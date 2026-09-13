package ch.damaso.jarvis.chat

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import java.util.Locale

/**
 * Zuhören. Die Spracherkennung kommt vom System — jedes Android bringt eine
 * mit, und sie läuft auf neueren Geräten auch ohne Netz.
 *
 * Muss vom Hauptstrang aus bedient werden; darum wird sie aus der Oberfläche
 * heraus gestartet und beim Schließen der App wieder freigegeben.
 */
class Zuhoerer(private val context: Context) {

    private var erkenner: SpeechRecognizer? = null
    var laeuft: Boolean = false
        private set

    fun verfuegbar(): Boolean = SpeechRecognizer.isRecognitionAvailable(context)

    fun starten(
        aufZwischenstand: (String) -> Unit,
        aufFertig: (String) -> Unit,
        aufFehler: (String) -> Unit
    ) {
        if (laeuft) return
        if (!verfuegbar()) {
            aufFehler("Auf diesem Telefon ist keine Spracherkennung eingerichtet.")
            return
        }

        val neu = SpeechRecognizer.createSpeechRecognizer(context)
        erkenner = neu
        laeuft = true

        neu.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onEvent(eventType: Int, params: Bundle?) {}

            override fun onPartialResults(partialResults: Bundle?) {
                erstes(partialResults)?.let(aufZwischenstand)
            }

            override fun onResults(results: Bundle?) {
                laeuft = false
                aufFertig(erstes(results).orEmpty())
                aufloesen()
            }

            override fun onError(error: Int) {
                laeuft = false
                aufFehler(erklaeren(error))
                aufloesen()
            }
        })

        val absicht = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(
                RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
            )
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.GERMAN.toLanguageTag())
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
        }
        runCatching { neu.startListening(absicht) }.onFailure {
            laeuft = false
            Log.w("Jarvis", "Spracherkennung startet nicht", it)
            aufFehler("Die Spracherkennung lässt sich nicht starten.")
            aufloesen()
        }
    }

    /** Genug geredet — was bis hierher verstanden wurde, kommt als Ergebnis. */
    fun beenden() {
        runCatching { erkenner?.stopListening() }
    }

    fun aufloesen() {
        laeuft = false
        runCatching { erkenner?.destroy() }
        erkenner = null
    }

    private fun erstes(bundle: Bundle?): String? =
        bundle?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            ?.firstOrNull()
            ?.takeIf { it.isNotBlank() }

    private fun erklaeren(fehler: Int): String = when (fehler) {
        SpeechRecognizer.ERROR_NO_MATCH,
        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Nichts verstanden."
        SpeechRecognizer.ERROR_AUDIO -> "Das Mikrofon liefert nichts."
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Die App darf das Mikrofon nicht benutzen."
        SpeechRecognizer.ERROR_NETWORK,
        SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Die Spracherkennung kommt nicht ins Netz."
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Die Spracherkennung ist noch beschäftigt."
        else -> "Die Spracherkennung hat aufgegeben."
    }
}

/**
 * Vorlesen. Ist ausgeschaltet, bis Damaso es einschaltet — eine App, die
 * ungefragt losredet, wird einmal benutzt.
 */
class Sprecher(context: Context) {

    private var stimme: TextToSpeech? = null
    private var bereit = false
    /** Nicht leer, wenn beim Einrichten etwas fehlt — gehört in die Oberfläche. */
    var mangel: String? = null
        private set

    init {
        stimme = TextToSpeech(context.applicationContext) { status ->
            if (status != TextToSpeech.SUCCESS) {
                mangel = "Auf diesem Telefon ist keine Sprachausgabe eingerichtet."
                return@TextToSpeech
            }
            val ergebnis = runCatching { stimme?.setLanguage(Locale.GERMAN) }.getOrNull()
            if (ergebnis == TextToSpeech.LANG_MISSING_DATA ||
                ergebnis == TextToSpeech.LANG_NOT_SUPPORTED
            ) {
                mangel = "Für Deutsch fehlt die Sprachausgabe. In den Android-Einstellungen nachladen."
                return@TextToSpeech
            }
            bereit = true
        }
        stimme?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {}
            override fun onDone(utteranceId: String?) {}
            @Deprecated("Von Android so vorgegeben")
            override fun onError(utteranceId: String?) {}
        })
    }

    fun sprich(text: String) {
        if (!bereit) return
        val sauber = text.trim()
        if (sauber.isEmpty()) return
        stimme?.speak(sauber, TextToSpeech.QUEUE_FLUSH, null, "jarvis")
    }

    fun still() {
        runCatching { stimme?.stop() }
    }

    fun aufloesen() {
        runCatching { stimme?.stop() }
        runCatching { stimme?.shutdown() }
        stimme = null
        bereit = false
    }
}
