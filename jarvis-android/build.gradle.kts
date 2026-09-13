// Wurzelprojekt: hier stehen nur die Versionen der Werkzeuge.
// Alles Eigentliche liegt in app/build.gradle.kts.
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
}
