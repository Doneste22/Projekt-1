package ch.damaso.jarvis.chat

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

/**
 * Der Aufruf an die Messages-API von Anthropic.
 *
 * Die App spricht direkt mit api.anthropic.com — anders als die Web-Fassung,
 * die dafür einen eigenen Server braucht. Der Unterschied ist wichtig und
 * kein Widerspruch: im Browser wäre der Schlüssel für jeden Besucher lesbar,
 * hier liegt er verschlüsselt auf Damasos eigenem Telefon (siehe `Tresor`).
 * Ein Zwischenserver würde daran nichts verbessern, aber Netz und Geld kosten.
 *
 * Kein SDK, sondern ein roher Aufruf mit `HttpURLConnection`: das Antwortformat
 * ist eine Handvoll JSON-Zeilen, und die App bleibt damit ohne eine einzige
 * Abhängigkeit, die veralten kann.
 *
 * Gestreamt wird, weil eine Antwort, die wortweise erscheint, sich wie ein
 * Gespräch anfühlt — und eine, die nach dreißig Sekunden am Stück kommt, wie
 * ein Formular.
 */
object Modell {

    const val STANDARD = "claude-opus-5"

    private const val API = "https://api.anthropic.com/v1/messages"

    /**
     * Wohin der Aufruf geht. Im Betrieb immer `API`; die Prüfung in
     * `app/src/test` zeigt ihn auf einen Nachbau, der das Antwortformat
     * nachspielt. Damit lässt sich die ganze Kette prüfen — Anfrage,
     * Strom, Abschluss — ohne einen Rappen auszugeben.
     */
    internal var ziel: String = API
    private const val VERSION = "2023-06-01"
    private const val FALLBACK_BETA = "server-side-fallback-2026-07-01"
    private const val MAX_TOKENS = 4000
    private const val MAX_NACHRICHTEN = 24     // so viel Verlauf geht mit
    private const val MAX_ZEICHEN = 60_000     // Deckel gegen unbeabsichtigte Kosten

    /**
     * Steht genau einmal hier. Die Web-Fassung hat ihren eigenen in
     * `server/core.mjs` — zwei Sprachen lassen sich nicht teilen; wer den
     * einen ändert, sieht bitte beim anderen nach.
     */
    private val SYSTEMPROMPT = listOf(
        "Du bist Jarvis, der persönliche KI-Assistent von Damaso.",
        "Damaso ist seit über zwei Jahrzehnten im Baugewerbe tätig, spezialisiert auf Verputzarbeiten, Trockenbau (Pladur) und Akustiklösungen. Er lebt in der Schweiz und plant den Umzug nach Galicien, Spanien.",
        "Antworte klar, knapp und hilfsbereit, standardmäßig auf Deutsch, außer Damaso schreibt in einer anderen Sprache.",
        "Du hast keinen Zugriff auf das Internet, Kalender, E-Mails oder Smart-Home-Geräte – sag das offen, wenn danach gefragt wird, statt zu raten.",
        "Diese Unterhaltung läuft auf dem Handy und ist auf kurze Wartezeit ausgelegt; beginne deine sichtbare Antwort sofort.",
        "Die Oberfläche zeigt reinen Text und kann deine Antwort vorlesen. Schreib deshalb ohne Markdown: keine Sternchen, keine Rauten, keine Tabellen. Aufzählungen mit einem Strich am Zeilenanfang sind in Ordnung.",
        "Wenn du dich korrigierst, sag es in einem Satz und mach weiter — kein langes Zurückrudern."
    ).joinToString("\n\n")

    /** Was am Ende eines Aufrufs herauskommt. */
    data class Ergebnis(
        val fehler: String? = null,
        /** Ohne `message_stop` ist die Antwort abgebrochen — das muss dranstehen. */
        val vollstaendig: Boolean = false,
        val abgelehnt: Boolean = false,
        val modell: String? = null
    )

    /**
     * Schickt den Verlauf los und reicht jedes Textstück sofort weiter.
     * Läuft im Hintergrund; wird der Auftrag abgebrochen, fällt die Verbindung
     * mit — sonst schriebe das Modell auf Damasos Rechnung weiter.
     */
    suspend fun frage(
        apiSchluessel: String,
        verlauf: List<Nachricht>,
        aufText: suspend (String) -> Unit
    ): Ergebnis = withContext(Dispatchers.IO) {

        val nachrichten = zurechtlegen(verlauf)
        if (nachrichten.isEmpty()) {
            return@withContext Ergebnis(fehler = "Keine Nachricht zum Abschicken.")
        }
        if (nachrichten.sumOf { it.text.length } > MAX_ZEICHEN) {
            return@withContext Ergebnis(fehler = "Der Verlauf ist zu lang. Lösch ihn und fang neu an.")
        }

        // Zugangsdaten gibt es in zwei Formen, die sich zum Verwechseln ähnlich
        // sehen: ein API-Schlüssel gehört in `x-api-key`, ein OAuth-Token in
        // `Authorization: Bearer`. Die falsche Wahl ergibt ein 401, das wie ein
        // ungültiger Schlüssel aussieht. Also raten und im Zweifel umschalten —
        // ein 401 kostet nichts, der zweite Versuch ist gratis.
        val vermutungOauth = apiSchluessel.trim().startsWith("sk-ant-oat", ignoreCase = true)
        val erster = versuch(apiSchluessel, nachrichten, vermutungOauth, aufText)
        if (erster.abgelehnt) {
            Log.i("Jarvis", "401, versuche die andere Form der Zugangsdaten")
            return@withContext versuch(apiSchluessel, nachrichten, !vermutungOauth, aufText)
        }
        erster
    }

    private suspend fun versuch(
        apiSchluessel: String,
        nachrichten: List<Nachricht>,
        oauth: Boolean,
        aufText: suspend (String) -> Unit
    ): Ergebnis {
        var verbindung: HttpURLConnection? = null
        var abbruchwache: kotlinx.coroutines.DisposableHandle? = null
        try {
            verbindung = (URL(ziel).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                doOutput = true
                connectTimeout = 20_000
                // Zwischen zwei Ereignissen des Stroms vergeht selten mehr als
                // ein paar Sekunden; eine Minute ist reichlich Luft.
                readTimeout = 60_000
                setRequestProperty("content-type", "application/json")
                setRequestProperty("accept", "text/event-stream")
                // Ohne das packt HttpURLConnection den Strom in gzip und
                // sammelt ihn — die Antwort käme dann in einem Schwall statt
                // wortweise.
                setRequestProperty("accept-encoding", "identity")
                setRequestProperty("anthropic-version", VERSION)
                val schluessel = apiSchluessel.trim()
                if (oauth) {
                    setRequestProperty("authorization", "Bearer $schluessel")
                    setRequestProperty("anthropic-beta", "oauth-2025-04-20,$FALLBACK_BETA")
                } else {
                    setRequestProperty("x-api-key", schluessel)
                    setRequestProperty("anthropic-beta", FALLBACK_BETA)
                }
            }

            // Beim Abbrechen die Verbindung wirklich zumachen: ein blockierendes
            // Lesen merkt von selbst nichts davon, dass niemand mehr zuhört.
            val laufenderAuftrag = currentCoroutineContext()[Job]
            val offen = verbindung
            abbruchwache = laufenderAuftrag?.invokeOnCompletion {
                if (it != null) runCatching { offen.disconnect() }
            }

            verbindung.outputStream.use { it.write(anfrage(nachrichten).toString().toByteArray(Charsets.UTF_8)) }

            val status = verbindung.responseCode
            if (status == 401 || status == 403) {
                val meldung = verbindung.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
                Log.w("Jarvis", "Zugangsdaten abgelehnt ($status): ${meldung.take(300)}")
                return Ergebnis(abgelehnt = true, fehler = erklaeren(status, meldung))
            }
            if (status !in 200..299) {
                val meldung = verbindung.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
                return Ergebnis(fehler = erklaeren(status, meldung))
            }

            val modell = verbindung.getHeaderField("anthropic-model")
            return lesen(verbindung, modell, aufText)

        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: java.net.UnknownHostException) {
            return Ergebnis(fehler = "Keine Verbindung. Prüf das Netz.")
        } catch (e: java.net.SocketTimeoutException) {
            return Ergebnis(fehler = "Das Modell hat zu lange nicht geantwortet.")
        } catch (e: Exception) {
            Log.w("Jarvis", "Aufruf fehlgeschlagen", e)
            return Ergebnis(fehler = "Die Anfrage ist nicht durchgegangen.")
        } finally {
            abbruchwache?.dispose()
            runCatching { verbindung?.disconnect() }
        }
    }

    /**
     * Liest den Ereignisstrom der Messages-API.
     *
     * `content_block_delta` mit `text_delta` ist der sichtbare Text,
     * `message_delta` bringt den `stop_reason`, `message_stop` ist der
     * Abschluss. Fehlt der Abschluss, ist die Antwort unvollständig — und das
     * gehört sichtbar in die Oberfläche, sonst liest sich eine halbe Antwort
     * wie eine ganze.
     */
    private suspend fun lesen(
        verbindung: HttpURLConnection,
        modellKopf: String?,
        aufText: suspend (String) -> Unit
    ): Ergebnis {
        var vollstaendig = false
        var abbruchgrund: String? = null
        var fehler: String? = null
        var modell = modellKopf

        BufferedReader(InputStreamReader(verbindung.inputStream, Charsets.UTF_8)).use { leser ->
            while (true) {
                currentCoroutineContext().ensureActive()
                val zeile = leser.readLine() ?: break
                if (!zeile.startsWith("data:")) continue
                val rohdaten = zeile.substring(5).trim()
                if (rohdaten.isEmpty() || rohdaten == "[DONE]") continue

                val ereignis = runCatching { JSONObject(rohdaten) }.getOrNull() ?: continue
                when (ereignis.optString("type")) {
                    "message_start" -> {
                        ereignis.optJSONObject("message")?.optString("model")
                            ?.takeIf { it.isNotEmpty() }?.let { modell = it }
                    }
                    "content_block_delta" -> {
                        val delta = ereignis.optJSONObject("delta")
                        if (delta?.optString("type") == "text_delta") {
                            val stueck = delta.optString("text")
                            if (stueck.isNotEmpty()) aufText(stueck)
                        }
                        // thinking_delta und signature_delta bleiben liegen:
                        // die App zeigt keine Denkblöcke und schickt keine zurück.
                    }
                    "message_delta" -> {
                        ereignis.optJSONObject("delta")?.optString("stop_reason")
                            ?.takeIf { it.isNotEmpty() }?.let { abbruchgrund = it }
                    }
                    "message_stop" -> vollstaendig = true
                    "error" -> {
                        val meldung = ereignis.optJSONObject("error")?.optString("message").orEmpty()
                        Log.w("Jarvis", "Fehler im Strom: $meldung")
                        fehler = "Die Antwort wurde unterwegs abgebrochen."
                    }
                }
            }
        }

        if (fehler == null && abbruchgrund == "refusal") {
            fehler = "Das Modell hat die Anfrage abgelehnt. Formulier sie anders."
        }
        if (fehler == null && abbruchgrund == "max_tokens") {
            fehler = "Die Antwort war zu lang und wurde abgeschnitten. Frag nach dem Rest."
        }
        return Ergebnis(fehler = fehler, vollstaendig = vollstaendig, modell = modell)
    }

    /** Der Aufruf selbst. Alle Stellschrauben für Kosten und Tempo stehen hier. */
    private fun anfrage(nachrichten: List<Nachricht>): JSONObject {
        val liste = JSONArray()
        nachrichten.forEach {
            liste.put(JSONObject().put("role", it.rolle).put("content", it.text))
        }
        return JSONObject()
            .put("model", STANDARD)
            .put("max_tokens", MAX_TOKENS)
            .put("stream", true)
            .put("system", SYSTEMPROMPT)
            .put("thinking", JSONObject().put("type", "adaptive"))
            // Gespräch am Handy: Tempo vor Tiefe.
            .put("output_config", JSONObject().put("effort", "medium"))
            // Wird die Anfrage aus Sicherheitsgründen abgelehnt, läuft sie
            // serverseitig auf einem anderen Modell weiter, statt leer
            // zurückzukommen.
            .put("fallbacks", "default")
            .put("messages", liste)
    }

    /**
     * Die API nimmt nur abwechselnde Rollen, Anfang und Ende beim Nutzer.
     * Ein Verlauf, der mit einer Antwort beginnt, wird abgelehnt.
     */
    private fun zurechtlegen(roh: List<Nachricht>): List<Nachricht> {
        val sauber = roh.filter {
            (it.rolle == "user" || it.rolle == "assistant") && it.text.isNotBlank()
        }.toMutableList()
        while (sauber.isNotEmpty() && sauber.first().rolle != "user") sauber.removeAt(0)
        while (sauber.isNotEmpty() && sauber.last().rolle != "user") sauber.removeAt(sauber.size - 1)
        return sauber.takeLast(MAX_NACHRICHTEN)
    }

    /** Übersetzt eine Fehlerantwort in etwas, das in der Oberfläche stehen darf. */
    private fun erklaeren(status: Int, rumpf: String): String = when {
        status == 401 || status == 403 -> "Der API-Schlüssel wird abgelehnt. Prüf ihn in den Einstellungen."
        status == 429 -> "Das Modell ist gerade ausgelastet. Gleich nochmal versuchen."
        status == 400 -> "Die Anfrage wurde abgelehnt. Lösch den Verlauf und versuch es neu."
        status >= 500 -> "Das Modell antwortet gerade nicht. Gleich nochmal versuchen."
        else -> {
            Log.w("Jarvis", "Unerwartete Antwort $status: ${rumpf.take(500)}")
            "Die Anfrage ist nicht durchgegangen."
        }
    }
}
