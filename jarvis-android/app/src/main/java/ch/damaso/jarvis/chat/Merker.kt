package ch.damaso.jarvis.chat

import android.content.Context

/** Kleinkram, der keine Verschlüsselung braucht — etwa, ob vorgelesen werden soll. */
object Merker {

    private const val DATEI = "jarvis.merker"
    private const val VORLESEN = "vorlesen"

    fun vorlesen(context: Context): Boolean =
        einstellungen(context).getBoolean(VORLESEN, false)

    fun vorlesen(context: Context, an: Boolean) {
        einstellungen(context).edit().putBoolean(VORLESEN, an).apply()
    }

    private fun einstellungen(context: Context) =
        context.applicationContext.getSharedPreferences(DATEI, Context.MODE_PRIVATE)
}
