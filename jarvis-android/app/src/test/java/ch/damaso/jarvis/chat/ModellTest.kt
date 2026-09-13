package ch.damaso.jarvis.chat

import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.OutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import kotlin.concurrent.thread

/**
 * Prüft die Kette zum Modell gegen einen Nachbau, der das Antwortformat der
 * Messages-API nachspielt — ohne Netz und ohne einen Rappen Kosten.
 *
 * Geprüft wird, was sonst erst auf dem Telefon auffiele: was tatsächlich
 * gesendet wird, ob der Text stückweise ankommt, ob eine abgerissene Antwort
 * als abgerissen erkannt wird, und ob die zweite Form der Zugangsdaten
 * probiert wird, wenn die erste ein 401 bekommt.
 */
class ModellTest {

    private lateinit var nachbau: Nachbau

    @Before
    fun aufbauen() {
        nachbau = Nachbau()
        Modell.ziel = "http://127.0.0.1:${nachbau.port}/v1/messages"
    }

    @After
    fun abbauen() {
        nachbau.schliessen()
    }

    @Test
    fun `schickt den Aufruf so ab wie im Code beschrieben`() = runBlocking {
        nachbau.antwortet { _, aus -> strom(aus, listOf("Hallo "), abschluss = true) }

        Modell.frage("sk-ant-test", listOf(Nachricht("user", "Servus"))) {}

        val rumpf = nachbau.letzterRumpf()
        assertEquals("claude-opus-5", rumpf.getString("model"))
        assertTrue(rumpf.getBoolean("stream"))
        assertEquals("adaptive", rumpf.getJSONObject("thinking").getString("type"))
        assertEquals("medium", rumpf.getJSONObject("output_config").getString("effort"))
        assertEquals("default", rumpf.getString("fallbacks"))
        assertTrue(rumpf.getString("system").contains("Jarvis"))
        assertEquals(1, rumpf.getJSONArray("messages").length())
        assertEquals("Servus", rumpf.getJSONArray("messages").getJSONObject(0).getString("content"))
    }

    @Test
    fun `reicht den Text stueckweise durch und meldet den Abschluss`() = runBlocking {
        nachbau.antwortet { _, aus -> strom(aus, listOf("Das ", "sind ", "drei."), abschluss = true) }

        val stuecke = mutableListOf<String>()
        val ergebnis = Modell.frage("sk-ant-test", listOf(Nachricht("user", "Frag"))) {
            stuecke.add(it)
        }

        assertEquals(listOf("Das ", "sind ", "drei."), stuecke)
        assertTrue(ergebnis.vollstaendig)
        assertNull(ergebnis.fehler)
    }

    @Test
    fun `erkennt eine abgerissene Antwort am fehlenden Abschluss`() = runBlocking {
        nachbau.antwortet { _, aus -> strom(aus, listOf("Angefangen und dann "), abschluss = false) }

        val ergebnis = Modell.frage("sk-ant-test", listOf(Nachricht("user", "Frag"))) {}

        assertFalse(ergebnis.vollstaendig)
    }

    @Test
    fun `nennt eine Ablehnung des Modells beim Namen`() = runBlocking {
        nachbau.antwortet { _, aus ->
            strom(aus, emptyList(), abschluss = true, abbruchgrund = "refusal")
        }

        val ergebnis = Modell.frage("sk-ant-test", listOf(Nachricht("user", "Frag"))) {}

        assertTrue(ergebnis.fehler!!.contains("abgelehnt"))
    }

    @Test
    fun `probiert bei 401 die andere Form der Zugangsdaten`() = runBlocking {
        var ersterDurchgang = true
        nachbau.antwortet { _, aus ->
            if (ersterDurchgang) {
                ersterDurchgang = false
                knapp(aus, 401, "Unauthorized", """{"error":{"message":"invalid x-api-key"}}""")
            } else {
                strom(aus, listOf("Doch noch."), abschluss = true)
            }
        }

        val ergebnis = Modell.frage("sk-ant-test", listOf(Nachricht("user", "Frag"))) {}

        assertEquals(listOf("x-api-key", "authorization"), nachbau.gesehenerKopf)
        assertTrue(ergebnis.vollstaendig)
    }

    @Test
    fun `sagt bei einem abgelehnten Schluessel was zu tun ist`() = runBlocking {
        nachbau.antwortet { _, aus -> knapp(aus, 401, "Unauthorized", "{}") }

        val ergebnis = Modell.frage("sk-ant-test", listOf(Nachricht("user", "Frag"))) {}

        assertTrue(ergebnis.fehler!!.contains("Einstellungen"))
    }

    @Test
    fun `wirft einen Verlauf weg der nicht beim Nutzer beginnt`() = runBlocking {
        nachbau.antwortet { _, aus -> strom(aus, listOf("ja"), abschluss = true) }

        Modell.frage(
            "sk-ant-test",
            listOf(
                // Eine Begrüßung, die die Oberfläche selbst erzeugt hätte, darf
                // nicht mitgeschickt werden — sonst lehnt die API ab.
                Nachricht("assistant", "Guten Morgen"),
                Nachricht("user", "Servus")
            )
        ) {}

        val nachrichten = nachbau.letzterRumpf().getJSONArray("messages")
        assertEquals(1, nachrichten.length())
        assertEquals("user", nachrichten.getJSONObject(0).getString("role"))
    }

    @Test
    fun `sagt bei einem ueberlangen Verlauf was zu tun ist`() = runBlocking {
        val lang = listOf(Nachricht("user", "x".repeat(70_000)))

        val ergebnis = Modell.frage("sk-ant-test", lang) {}

        assertTrue(ergebnis.fehler!!.contains("zu lang"))
    }

    /* ------------------------------------------------------- Antwortformat */

    /** Schreibt einen Ereignisstrom, wie ihn die Messages-API schickt. */
    private fun strom(
        aus: OutputStream,
        stuecke: List<String>,
        abschluss: Boolean,
        abbruchgrund: String = "end_turn"
    ) {
        aus.write(
            ("HTTP/1.1 200 OK\r\n" +
                "content-type: text/event-stream\r\n" +
                "connection: close\r\n\r\n").toByteArray(Charsets.UTF_8)
        )
        fun sende(art: String, daten: String) {
            aus.write("event: $art\ndata: $daten\n\n".toByteArray(Charsets.UTF_8))
            aus.flush()
        }
        sende("message_start", """{"type":"message_start","message":{"model":"claude-opus-5"}}""")
        stuecke.forEach {
            sende(
                "content_block_delta",
                JSONObject()
                    .put("type", "content_block_delta")
                    .put("delta", JSONObject().put("type", "text_delta").put("text", it))
                    .toString()
            )
        }
        sende("message_delta", """{"type":"message_delta","delta":{"stop_reason":"$abbruchgrund"}}""")
        if (abschluss) sende("message_stop", """{"type":"message_stop"}""")
    }

    private fun knapp(aus: OutputStream, status: Int, grund: String, rumpf: String) {
        val bytes = rumpf.toByteArray(Charsets.UTF_8)
        aus.write(
            ("HTTP/1.1 $status $grund\r\n" +
                "content-type: application/json\r\n" +
                "content-length: ${bytes.size}\r\n" +
                "connection: close\r\n\r\n").toByteArray(Charsets.UTF_8)
        )
        aus.write(bytes)
        aus.flush()
    }

    /**
     * Ein Server aus einem Socket statt aus einer Bibliothek: im Android-Test
     * steht nur das zur Verfügung, was auch auf dem Telefon da wäre.
     */
    private class Nachbau {

        private val horcher = ServerSocket(0, 0, InetAddress.getByName("127.0.0.1"))
        private val ruempfe = mutableListOf<String>()
        private var handlung: (String, OutputStream) -> Unit = { _, _ -> }

        /** Welche Form der Zugangsdaten jeweils ankam. */
        val gesehenerKopf = mutableListOf<String>()

        val port: Int get() = horcher.localPort

        init {
            thread(isDaemon = true) {
                while (!horcher.isClosed) {
                    val verbindung = try { horcher.accept() } catch (e: Exception) { break }
                    thread(isDaemon = true) { bedienen(verbindung) }
                }
            }
        }

        fun antwortet(neu: (String, OutputStream) -> Unit) {
            handlung = neu
        }

        fun letzterRumpf(): JSONObject = synchronized(ruempfe) { JSONObject(ruempfe.last()) }

        fun schliessen() {
            runCatching { horcher.close() }
        }

        private fun bedienen(verbindung: Socket) {
            verbindung.use { sitzung ->
                val ein = sitzung.getInputStream()
                zeile(ein) ?: return                    // Anfragezeile
                var laenge = 0
                while (true) {
                    val kopf = zeile(ein) ?: break
                    if (kopf.isEmpty()) break
                    val name = kopf.substringBefore(':').trim().lowercase()
                    val wert = kopf.substringAfter(':').trim()
                    if (name == "content-length") laenge = wert.toIntOrNull() ?: 0
                    if (name == "x-api-key" || name == "authorization") {
                        synchronized(gesehenerKopf) { gesehenerKopf.add(name) }
                    }
                }
                // Byteweise, nicht zeichenweise: `content-length` zählt Bytes,
                // und der Systemprompt hat Umlaute. Wer hier Zeichen zählt,
                // wartet auf Zeichen, die nie kommen.
                val bytes = ByteArray(laenge)
                var gelesen = 0
                while (gelesen < laenge) {
                    val n = ein.read(bytes, gelesen, laenge - gelesen)
                    if (n < 0) break
                    gelesen += n
                }
                synchronized(ruempfe) { ruempfe.add(String(bytes, 0, gelesen, Charsets.UTF_8)) }
                handlung(String(bytes, 0, gelesen, Charsets.UTF_8), sitzung.getOutputStream())
            }
        }

        /** Eine Zeile bis CRLF, byteweise. */
        private fun zeile(ein: java.io.InputStream): String? {
            val puffer = java.io.ByteArrayOutputStream()
            while (true) {
                val b = ein.read()
                if (b < 0) return if (puffer.size() == 0) null else puffer.toString("UTF-8")
                if (b == '\n'.code) return puffer.toString("UTF-8").removeSuffix("\r")
                puffer.write(b)
            }
        }
    }
}
