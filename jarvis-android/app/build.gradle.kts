plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

/*
 * Der Signaturschlüssel liegt bewusst nicht im Repo (siehe .gitignore).
 * Ist `schluessel.jks` da — lokal hingelegt oder von der GitHub-Action aus
 * einem Secret geschrieben —, wird die Release-APK damit signiert und lässt
 * sich aufs Telefon ziehen. Fehlt er, bricht der Release-Build ab, statt
 * stillschweigend etwas Nicht-Installierbares abzulegen.
 */
val schluesselDatei = rootProject.file("schluessel.jks")

android {
    namespace = "ch.damaso.jarvis.chat"
    compileSdk = 35

    defaultConfig {
        applicationId = "ch.damaso.jarvis.chat"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    signingConfigs {
        create("veroeffentlichung") {
            if (schluesselDatei.exists()) {
                storeFile = schluesselDatei
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD") ?: "jarvis"
                keyAlias = System.getenv("ANDROID_KEY_ALIAS") ?: "jarvis"
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
                    ?: System.getenv("ANDROID_KEYSTORE_PASSWORD") ?: "jarvis"
            }
        }
    }

    buildTypes {
        release {
            // Kein R8: die App hat keine Abhängigkeit, die vom Verkleinern
            // profitiert, und ein falsch verkleinerter Build fällt erst auf
            // dem Telefon auf — dort, wo niemand ein Protokoll liest.
            isMinifyEnabled = false
            if (schluesselDatei.exists()) {
                signingConfig = signingConfigs.getByName("veroeffentlichung")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }

    testOptions {
        unitTests {
            // `android.util.Log` gibt es auf dem Rechner nicht; im Test soll
            // es stillhalten statt zu werfen.
            isReturnDefaultValues = true
        }
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)

    // Nur für die Prüfung auf dem Rechner: JUnit, dazu ein echtes org.json
    // (Android bringt es mit, die JVM nicht).
    testImplementation(libs.junit)
    testImplementation(libs.json)
}
