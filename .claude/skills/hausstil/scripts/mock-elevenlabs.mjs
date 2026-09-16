/**
 * Spielt ElevenLabs nach — damit sich die Stimme prüfen lässt, ohne einen
 * einzigen der 10.000 Freizeichen zu verbrauchen.
 *
 *   node .claude/skills/hausstil/scripts/mock-elevenlabs.mjs        # Port 8790
 *   JARVIS_STIMME_URL=http://localhost:8790 node server/jarvis.mjs
 *
 * Antwortet auf /v1/text-to-speech/<id>/stream mit einem kurzen Piepton als
 * MP3 und protokolliert, welche Stimme, welches Modell und welcher Text
 * tatsächlich ankamen. Damit lässt sich alles prüfen, was schiefgehen kann:
 * Kürzung an der Satzgrenze, Zugangscode, Abbruch, Fehlerbehandlung.
 *
 * Fehler auf Zuruf:
 *   MOCK_STATUS=401  node …    Schlüssel abgelehnt
 *   MOCK_STATUS=429  node …    Kontingent aufgebraucht
 */

import http from "node:http";

const PORT = Number(process.env.MOCK_PORT || 8790);
const STATUS = Number(process.env.MOCK_STATUS || 200);

// Ein Piepton, 0,35 Sekunden. Reicht, um zu hören, dass etwas ankommt, und um
// zu sehen, ob die Oberfläche mehrere Stücke hintereinander abspielt.
const PIEP = Buffer.from("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", "base64");

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const treffer = url.pathname.match(/^\/v1\/text-to-speech\/([^/]+)\/stream$/);

  if (!treffer) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ detail: "Diesen Pfad kennt ElevenLabs nicht." }));
    return;
  }

  const stuecke = [];
  for await (const stueck of req) stuecke.push(stueck);
  let koerper = {};
  try { koerper = JSON.parse(Buffer.concat(stuecke).toString("utf8")); } catch { /* egal */ }

  console.log("— Anfrage an die Stimme —");
  console.log("  Stimmen-ID:", decodeURIComponent(treffer[1]));
  console.log("  Schlüssel:", req.headers["xi-api-key"] ? "da" : "FEHLT");
  console.log("  Modell:", koerper.model_id);
  console.log("  Format:", url.searchParams.get("output_format"));
  console.log("  Einstellungen:", JSON.stringify(koerper.voice_settings));
  console.log("  Zeichen:", (koerper.text || "").length);
  console.log("  Text:", JSON.stringify(koerper.text));

  if (STATUS !== 200) {
    res.writeHead(STATUS, { "content-type": "application/json" });
    res.end(JSON.stringify({ detail: { message: "vom Mock erzwungen", status: STATUS } }));
    return;
  }

  res.writeHead(200, { "content-type": "audio/mpeg", "cache-control": "no-store" });
  res.end(PIEP);
}).listen(PORT, () => {
  console.log(`Mock-ElevenLabs läuft auf http://localhost:${PORT}`);
  if (STATUS !== 200) console.log(`Antwortet auf alles mit Status ${STATUS}.`);
});
