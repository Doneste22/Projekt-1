package ch.damaso.jarvis.chat

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

enum class Zustand(val beschriftung: String) {
    BEREIT("bereit"),
    HOERT("hört zu"),
    DENKT("denkt nach")
}

/**
 * Der Zustand der App an einer Stelle: der Verlauf, die laufende Antwort, was
 * gerade passiert und was schiefging. Die Ansicht liest hier nur ab.
 */
class JarvisModel(anwendung: Application) : AndroidViewModel(anwendung) {

    val nachrichten = mutableStateListOf<Nachricht>()

    /** Die Antwort, während sie eintrifft. Null, wenn gerade keine läuft. */
    var imFluss by mutableStateOf<String?>(null)
        private set

    var zustand by mutableStateOf(Zustand.BEREIT)
        private set

    /** Ein Satz, der über der Eingabe steht, wenn etwas nicht geklappt hat. */
    var hinweis by mutableStateOf<String?>(null)

    var schluessel by mutableStateOf("")
        private set

    var vorlesen by mutableStateOf(false)
        private set

    /** Setzt die Ansicht; wird gerufen, sobald eine Antwort ganz da ist. */
    var aufFertigerAntwort: ((String) -> Unit)? = null

    private var auftrag: Job? = null

    val laeuft: Boolean get() = auftrag?.isActive == true

    init {
        val kontext = getApplication<Application>()
        nachrichten.addAll(Verlauf.laden(kontext))
        schluessel = Tresor.lesen(kontext)
        vorlesen = Merker.vorlesen(kontext)
    }

    fun zustandSetzen(neu: Zustand) {
        // Nur der Übergang von und nach „hört zu"; „denkt nach" gehört dem Auftrag.
        if (zustand == Zustand.DENKT || neu == Zustand.DENKT) return
        zustand = neu
    }

    fun schluesselSetzen(wert: String) {
        val kontext = getApplication<Application>()
        Tresor.schreiben(kontext, wert)
        schluessel = Tresor.lesen(kontext)
        if (schluessel.isNotEmpty()) hinweis = null
    }

    fun vorlesenUmschalten() {
        val neu = !vorlesen
        vorlesen = neu
        Merker.vorlesen(getApplication(), neu)
    }

    fun verlaufLeeren() {
        abbrechen()
        nachrichten.clear()
        imFluss = null
        hinweis = null
        Verlauf.leeren(getApplication())
    }

    fun abbrechen() {
        auftrag?.cancel()
    }

    fun senden(eingabe: String) {
        val text = eingabe.trim()
        if (text.isEmpty() || laeuft) return

        if (schluessel.isEmpty()) {
            hinweis = "Trag zuerst deinen API-Schlüssel in den Einstellungen ein."
            return
        }

        val kontext = getApplication<Application>()
        hinweis = null
        nachrichten.add(Nachricht("user", text))
        Verlauf.sichern(kontext, nachrichten)

        zustand = Zustand.DENKT
        imFluss = ""

        auftrag = viewModelScope.launch {
            val gesammelt = StringBuilder()
            var ergebnis = Modell.Ergebnis()
            var abgebrochen = false
            try {
                ergebnis = Modell.frage(schluessel, nachrichten.toList()) { stueck ->
                    gesammelt.append(stueck)
                    imFluss = gesammelt.toString()
                }
            } catch (e: CancellationException) {
                abgebrochen = true
            } finally {
                val antwort = gesammelt.toString().trim()
                imFluss = null
                zustand = Zustand.BEREIT

                if (antwort.isNotEmpty()) {
                    nachrichten.add(Nachricht("assistant", antwort))
                    Verlauf.sichern(kontext, nachrichten)
                }

                hinweis = when {
                    abgebrochen && antwort.isEmpty() -> null
                    abgebrochen -> "Abgebrochen — die Antwort ist nur zur Hälfte da."
                    ergebnis.fehler != null -> ergebnis.fehler
                    // Ohne den Abschluss des Stroms fehlt hinten etwas. Das
                    // muss dranstehen: eine halbe Antwort liest sich sonst
                    // wie eine ganze.
                    antwort.isNotEmpty() && !ergebnis.vollstaendig ->
                        "Die Antwort ist unterwegs abgerissen. Frag nach dem Rest."
                    antwort.isEmpty() -> "Das Modell hat nichts geschickt."
                    else -> null
                }

                if (!abgebrochen && antwort.isNotEmpty() && ergebnis.vollstaendig) {
                    aufFertigerAntwort?.invoke(antwort)
                }
            }
        }
    }
}
