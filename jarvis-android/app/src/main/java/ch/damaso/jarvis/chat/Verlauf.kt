package ch.damaso.jarvis.chat

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** Eine Zeile im Gespräch. `rolle` ist "user" oder "assistant" — so heißt es in der API. */
data class Nachricht(val rolle: String, val text: String) {
    val vonDamaso: Boolean get() = rolle == "user"
}

/**
 * Der Gesprächsverlauf, gespeichert im privaten Ordner der App.
 *
 * Eine Datei mit JSON, keine Datenbank: es sind ein paar hundert kurze Texte,
 * und eine Datei lässt sich ansehen, kopieren und wegwerfen. Geschrieben wird
 * nach jeder fertigen Antwort, nicht bei jedem Buchstaben.
 */
object Verlauf {

    private const val DATEI = "verlauf.json"
    private const val HOECHSTZAHL = 200      // so viel bleibt liegen

    fun laden(context: Context): List<Nachricht> {
        val datei = File(context.filesDir, DATEI)
        if (!datei.exists()) return emptyList()
        return try {
            val liste = JSONArray(datei.readText(Charsets.UTF_8))
            buildList {
                for (i in 0 until liste.length()) {
                    val eintrag = liste.optJSONObject(i) ?: continue
                    val rolle = eintrag.optString("rolle")
                    val text = eintrag.optString("text")
                    if ((rolle == "user" || rolle == "assistant") && text.isNotEmpty()) {
                        add(Nachricht(rolle, text))
                    }
                }
            }
        } catch (e: Exception) {
            // Eine kaputte Datei darf die App nicht am Start hindern.
            Log.w("Jarvis", "Verlauf nicht lesbar, fange leer an", e)
            emptyList()
        }
    }

    fun sichern(context: Context, nachrichten: List<Nachricht>) {
        val liste = JSONArray()
        nachrichten.takeLast(HOECHSTZAHL).forEach {
            liste.put(JSONObject().put("rolle", it.rolle).put("text", it.text))
        }
        try {
            File(context.filesDir, DATEI).writeText(liste.toString(), Charsets.UTF_8)
        } catch (e: Exception) {
            Log.w("Jarvis", "Verlauf ließ sich nicht sichern", e)
        }
    }

    fun leeren(context: Context) {
        File(context.filesDir, DATEI).delete()
    }
}
