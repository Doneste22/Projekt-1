/**
 * Die Stimme von Jarvis im Netz — als Edge-Function.
 *
 * Genau wie beim Modell: der Schlüssel bleibt serverseitig, und der Audiostrom
 * wird unverändert durchgereicht. Eine Edge-Function darf 50 Millisekunden
 * rechnen — ein MP3 durch eigenen Code zu schieben, wäre nach dem ersten
 * Kilobyte vorbei. Die Begründung steht ausführlich in ../../server/stimme.mjs.
 */

import type { Config } from "@netlify/edge-functions";
import { AUDIO_HEADERS, callStimme, describeStimme, pruefeText, STIMME } from "../../server/stimme.mjs";

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

export default async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Nur POST." });
  }

  // Zwei Fälle, die gleich aussehen und verschiedene Ursachen haben — das hat
  // hier einen Nachmittag gekostet. Ist die Variable gar nicht angelegt,
  // liefert env.get undefined. Ist sie angelegt, aber für diesen
  // Deploy-Kontext ohne Wert (etwa weil bei „Different value for each deploy
  // context" nur ein Feld gefüllt wurde), liefert sie einen leeren Text.
  // Die Meldung muss das auseinanderhalten, sonst sucht man am falschen Ende.
  const apiKey = Netlify.env.get("ELEVENLABS_API_KEY");
  if (apiKey === undefined) {
    return jsonResponse(503, {
      error: "Auf dem Server ist ELEVENLABS_API_KEY gar nicht angelegt. In den Netlify-Variablen eintragen und neu veröffentlichen."
    });
  }
  if (!apiKey.trim()) {
    return jsonResponse(503, {
      error: "ELEVENLABS_API_KEY ist angelegt, aber für diese Veröffentlichung leer. In Netlify auf „Same value for all deploy contexts\" stellen und den Schlüssel noch einmal einfügen."
    });
  }
  if (!STIMME.id) {
    return jsonResponse(503, { error: "In jarvis/konfiguration.json fehlt „stimme.id“." });
  }

  const passcode = Netlify.env.get("JARVIS_PASSCODE");
  if (passcode && req.headers.get("x-jarvis-passcode") !== passcode) {
    return jsonResponse(401, { error: "Zugangscode fehlt oder stimmt nicht." });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(400, { error: "Ungültige Anfrage." });
  }

  const geprueft = pruefeText(payload);
  if (geprueft.error) {
    return jsonResponse(geprueft.status, { error: geprueft.error });
  }

  let upstream: Response;
  try {
    upstream = await callStimme({
      apiKey,
      text: geprueft.text,
      signal: req.signal,
      url: Netlify.env.get("JARVIS_STIMME_URL")
    });
  } catch {
    return jsonResponse(502, { error: "ElevenLabs war nicht erreichbar." });
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return jsonResponse(upstream.status, { error: describeStimme(upstream.status, text, apiKey) });
  }

  // Unverändert weiterreichen. Kein eigener Code pro Byte — das ist der Punkt.
  return new Response(upstream.body, { headers: AUDIO_HEADERS });
};

export const config: Config = {
  path: "/api/stimme"
};
