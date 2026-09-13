package ch.damaso.jarvis.chat

import androidx.compose.ui.graphics.Color

/**
 * Dieselbe Palette wie die Web-App in `jarvis/style.css`: ein Messgerät im
 * Dunkeln, Licht als Material, und die orange Libellenblase der Wasserwaage
 * als einziger Farbakzent. Ein Farbraum, kein Hell/Dunkel-Wechsel — das ist
 * eine Entscheidung, kein Versehen.
 */
object Farben {
    val grundTief = Color(0xFF04070C)
    val grund = Color(0xFF070B12)
    val flaeche = Color(0xFF0D1521)
    val flaecheHell = Color(0xFF131E2C)
    val linie = Color(0xFF1C2837)

    val text = Color(0xFFE8EFF7)
    val textLeise = Color(0xFF93A6BC)
    val textStill = Color(0xFF5E7183)

    val akzent = Color(0xFFFF7A2F)
    val akzentTief = Color(0xFFC9541A)
    val akzentSchimmer = Color(0x29FF7A2F)
    val warn = Color(0xFFFF6B4A)
    val warnFlaeche = Color(0x1FFF6B4A)
    val gut = Color(0xFF5BD6A4)
}
