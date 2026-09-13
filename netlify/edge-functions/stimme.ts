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

  const apiKey = Netlify.env.get("ELEVENLABS_API_KEY");
  if (!apiKey) {
    return jsonResponse(503, {
      error: "Auf dem Server fehlt ELEVENLABS_API_KEY. In den Netlify-Variablen eintragen und neu veröffentlichen."
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
    return jsonResponse(upstream.status, { error: describeStimme(upstream.status, text) });
  }

  // Unverändert weiterreichen. Kein eigener Code pro Byte — das ist der Punkt.
  return new Response(upstream.body, { headers: AUDIO_HEADERS });
};

export const config: Config = {
  path: "/api/stimme"
};
