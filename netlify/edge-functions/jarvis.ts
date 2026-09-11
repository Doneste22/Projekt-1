/**
 * Backend für Jarvis im Netz — als Edge-Function.
 *
 * Warum nicht als normale Function: die läuft nach rund 26 Sekunden in ihr
 * Zeitlimit und schneidet lange Antworten mitten im Wort ab. Eine
 * Edge-Function muss nur die Kopfzeilen innerhalb von 40 Sekunden schicken —
 * die schicken wir sofort, der Strom darf danach laufen, solange er braucht.
 *
 * Dafür darf sie pro Anfrage nur 50 Millisekunden rechnen. Deshalb wird der
 * Antwortstrom nicht ausgewertet, sondern unverändert durchgereicht; die
 * Begründung steht ausführlich in ../../server/core.mjs.
 *
 * Der Schlüssel liegt in den Netlify-Variablen und taucht nirgends im
 * ausgelieferten Code auf.
 */

import type { Config } from "@netlify/edge-functions";
import { callUpstream, check, describeUpstream, sseHeaders, DEFAULT_MODEL } from "../../server/core.mjs";

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

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return jsonResponse(503, {
      error: "Auf dem Server fehlt ANTHROPIC_API_KEY. In den Netlify-Variablen eintragen und neu veröffentlichen."
    });
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

  const checked = check(payload);
  if (checked.error) {
    return jsonResponse(checked.status, { error: checked.error });
  }

  const model = Netlify.env.get("JARVIS_MODEL") || DEFAULT_MODEL;

  let upstream: Response;
  try {
    upstream = await callUpstream({
      apiKey,
      model,
      messages: checked.messages,
      signal: req.signal,
      url: Netlify.env.get("ANTHROPIC_BASE_URL")
    });
  } catch {
    return jsonResponse(502, { error: "Das Modell war nicht erreichbar. Gleich nochmal versuchen." });
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return jsonResponse(upstream.status, { error: describeUpstream(upstream.status, text) });
  }

  // Unverändert weiterreichen. Kein eigener Code pro Token — das ist der Punkt.
  return new Response(upstream.body, {
    headers: sseHeaders({ model, unprotected: !passcode })
  });
};

export const config: Config = {
  path: "/api/jarvis"
};
