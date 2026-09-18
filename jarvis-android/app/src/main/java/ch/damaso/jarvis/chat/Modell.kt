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
 * Der Aufruf an Jarvis' eigenen Endpunkt.
 *
 * Die App ruft nicht api.anthropic.com an, sondern denselben Server wie die
 * Web-Fassung: `/api/jarvis` auf der veröffentlichten Seite. Das war einmal
 * anders begründet — ein Zwischenserver koste Netz und Geld und verbessere
 * nichts, weil der Schlüssel auf Damasos eigenem Telefon ohnehin sicher liegt.
 * Diese Rechnung ging von einem eigenen Anthropic-Schlüssel aus. Den gibt es
 * hier nicht: Netlifys AI-Gateway stellt ihn, und es stellt ihn nur seinem
 * eigenen Endpunkt. Ein Schlüssel am Telefon wäre also ein zweiter, den
 * jemand zusätzlich bezahlen müsste.
 *
 * Damit liegt am Telefon überhaupt kein Schlüssel mehr, sondern nur der
 * Zugangscode — derselbe, den die Website abfragt (siehe `Tresor`). Geht er
 * verloren, kostet das nichts: er steht in den Netlify-Variablen und lässt
 * sich dort ändern.
 *
 * Der Server reicht den Antwortstrom unverändert durch, deshalb liest diese
 * Datei weiterhin das Format der Messages-API.
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

    private const val SERVER = "https://jarvis-damaso.netlify.app/api/jarvis"

    /**
     * Wohin der Aufruf geht. Im Betrieb immer `SERVER`; die Prüfung in
     * `app/src/test` zeigt ihn auf einen Nachbau, der das Antwortformat
     * nachspielt. Damit lässt sich die ganze Kette prüfen — Anfrage,
     * Strom, Abschluss — ohne einen Rappen auszugeben.
     */
    internal var ziel: String = SERVER

    /**
     * Modell, Systemprompt, Denktiefe und Token-Deckel bestimmt der Server in
     * `server/core.mjs`. Früher stand das hier ein zweites Mal — zwei Prompts,
     * die garantiert auseinanderdriften. Jetzt gibt es nur noch einen.
     */
    private const val MAX_NACHRICHTEN = 24     // so viel Verlauf geht mit
    private const val MAX_ZEICHEN = 60_000     // Deckel gegen unbeabsichtigte Kosten

    /** Was am Ende eines Aufrufs herauskommt. */
    data class Ergebnis(
        val fehler: String? = null,
        /** Ohne `message_stop` ist die Antwort abgebrochen — das muss dranstehen. */
        val vollstaendig: Boolean = false,
        val modell: String? = null
    )

    /**
     * Schickt den Verlauf los und reicht jedes Textstück sofort weiter.
     * Läuft im Hintergrund; wird der Auftrag abgebrochen, fällt die Verbindung
     * mit — sonst schriebe das Modell auf Damasos Rechnung weiter.
     */
    suspend fun frage(
        zugangscode: String,
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

        // Früher stand hier ein zweiter Versuch mit der anderen Form der
        // Zugangsdaten (`x-api-key` gegen `Authorization: Bearer`). Der eigene
        // Endpunkt kennt nur eine Form, also gibt es nichts mehr zu raten.
        versuch(zugangscode, nachrichten, aufText)
    }

    private suspend fun versuch(
        zugangscode: String,
        nachrichten: List<Nachricht>,
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
                // Derselbe Kopf, den die Web-Fassung schickt. Ist auf dem
                // Server kein Zugangscode gesetzt, wird er ignoriert.
                setRequestProperty("x-jarvis-passcode", zugangscode.trim())
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
                return Ergebnis(fehler = erklaeren(status, meldung))
            }
            if (status !in 200..299) {
                val meldung = verbindung.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
                return Ergebnis(fehler = erklaeren(status, meldung))
            }

            val modell = verbindung.getHeaderField("x-jarvis-model")
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

    /**
     * Der Aufruf selbst — nur noch der Verlauf und die Betriebsart.
     *
     * Modell, Systemprompt, Denktiefe und Token-Deckel stehen auf dem Server.
     * Das ist kein Verlust an Einfluss, sondern der Sinn der Sache: was die
     * App mitschickt, könnte jeder mitschicken, der die Adresse kennt. Der
     * Server glaubt deshalb nur die Betriebsart, und auch die nur, wenn er
     * sie kennt.
     */
    private fun anfrage(nachrichten: List<Nachricht>): JSONObject {
        val liste = JSONArray()
        nachrichten.forEach {
            liste.put(JSONObject().put("role", it.rolle).put("content", it.text))
        }
        return JSONObject()
            .put("modus", "chat")
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

    /**
     * Übersetzt eine Fehlerantwort in etwas, das in der Oberfläche stehen darf.
     *
     * Der eigene Server antwortet im Fehlerfall mit `{"error": "…"}` auf
     * Deutsch und sagt dabei genauer, was los ist, als die App raten könnte:
     * „Zugangscode fehlt oder stimmt nicht" statt „irgendetwas mit 401". Diese
     * Meldung hat deshalb Vorrang. Die Sätze darunter bleiben für den Fall,
     * dass gar keine ankommt — etwa wenn Netlify selbst antwortet.
     */
    private fun erklaeren(status: Int, rumpf: String): String {
        klartext(rumpf)?.let { return it }
        return when {
            status == 401 || status == 403 -> "Der Zugangscode wird abgelehnt. Prüf ihn in den Einstellungen."
            status == 429 -> "Das Modell ist gerade ausgelastet. Gleich nochmal versuchen."
            status == 400 -> "Die Anfrage wurde abgelehnt. Lösch den Verlauf und versuch es neu."
            status == 413 -> "Der Verlauf ist zu lang. Lösch ihn und fang neu an."
            status >= 500 -> "Der Server antwortet gerade nicht. Gleich nochmal versuchen."
            else -> {
                Log.w("Jarvis", "Unerwartete Antwort $status: ${rumpf.take(500)}")
                "Die Anfrage ist nicht durchgegangen."
            }
        }
    }

    /**
     * Die Klartextmeldung aus `{"error": "…"}`, falls eine drinsteht.
     *
     * Anthropic verpackt seine Fehler als Objekt (`{"error": {"message": …}}`),
     * der eigene Server als Zeichenkette. `optString` auf einem Objekt liefert
     * leer — damit fällt der fremde Fall von selbst durch, statt Klammern in
     * die Oberfläche zu schreiben.
     */
    private fun klartext(rumpf: String): String? =
        runCatching { JSONObject(rumpf).optString("error") }
            .getOrNull()
            ?.takeIf { it.isNotBlank() }
}
