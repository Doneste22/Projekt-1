package ch.damaso.jarvis.chat

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Der API-Schlüssel. Er steht nirgends im Code und nirgends im Repo — Damaso
 * tippt ihn einmal in den Einstellungen ein, danach liegt er hier.
 *
 * „Hier" heißt: verschlüsselt in den App-Einstellungen. Der Schlüssel zum
 * Entschlüsseln wird im Schlüsselspeicher des Geräts erzeugt (auf den meisten
 * Telefonen in eigener Hardware) und verlässt ihn nie — er lässt sich nur
 * benutzen, nicht auslesen. Wer die Einstellungsdatei in die Hand bekäme,
 * hielte damit nur unlesbares Zeug.
 *
 * Dazu kommt: die App ist von jeder Sicherung ausgenommen (siehe
 * `res/xml/datenabgabe.xml`). Der Schlüssel geht also weder in eine Cloud
 * noch auf ein neues Telefon mit.
 *
 * Bewusst ohne Zusatzpaket (androidx.security): das sind rund sechzig Zeilen
 * Standard-Kryptografie, und ein Paket weniger ist ein Paket weniger, das in
 * zwei Jahren nicht mehr baut.
 */
object Tresor {

    private const val DATEI = "jarvis.tresor"
    private const val FELD = "api-schluessel"
    private const val SPEICHER = "AndroidKeyStore"
    private const val ALIAS = "jarvis.tresor.v1"
    private const val IV_LAENGE = 12          // AES/GCM: 96 Bit, so will es die Norm
    private const val PRUEFSUMME_BITS = 128

    fun lesen(context: Context): String {
        val roh = einstellungen(context).getString(FELD, null) ?: return ""
        return try {
            val bytes = Base64.decode(roh, Base64.NO_WRAP)
            if (bytes.size <= IV_LAENGE) return ""
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(
                Cipher.DECRYPT_MODE,
                geheimnis(),
                GCMParameterSpec(PRUEFSUMME_BITS, bytes, 0, IV_LAENGE)
            )
            String(cipher.doFinal(bytes, IV_LAENGE, bytes.size - IV_LAENGE), Charsets.UTF_8)
        } catch (e: Exception) {
            // Kann vorkommen, wenn der Gerätespeicher zurückgesetzt wurde
            // (etwa nach dem Ändern der Bildschirmsperre). Dann ist der
            // Schlüssel weg und muss neu eingegeben werden — kein Absturz.
            Log.w("Jarvis", "Schlüssel nicht lesbar, er muss neu eingegeben werden", e)
            loeschen(context)
            ""
        }
    }

    fun schreiben(context: Context, wert: String) {
        val sauber = wert.trim()
        if (sauber.isEmpty()) {
            loeschen(context)
            return
        }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, geheimnis())
        val iv = cipher.iv
        val geheim = cipher.doFinal(sauber.toByteArray(Charsets.UTF_8))
        val zusammen = ByteArray(iv.size + geheim.size)
        iv.copyInto(zusammen, 0)
        geheim.copyInto(zusammen, iv.size)
        einstellungen(context).edit()
            .putString(FELD, Base64.encodeToString(zusammen, Base64.NO_WRAP))
            .apply()
    }

    fun loeschen(context: Context) {
        einstellungen(context).edit().remove(FELD).apply()
    }

    private fun einstellungen(context: Context) =
        context.applicationContext.getSharedPreferences(DATEI, Context.MODE_PRIVATE)

    /** Holt den Geräteschlüssel oder legt ihn beim ersten Mal an. */
    private fun geheimnis(): SecretKey {
        val speicher = KeyStore.getInstance(SPEICHER).apply { load(null) }
        (speicher.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }

        val erzeuger = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, SPEICHER)
        erzeuger.init(
            KeyGenParameterSpec.Builder(
                ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                // Keine Bildschirmsperre verlangt: sonst wäre die App auf
                // einem Telefon ohne PIN gar nicht benutzbar.
                .setUserAuthenticationRequired(false)
                .build()
        )
        return erzeuger.generateKey()
    }
}
