/**
 * Backend für Jarvis im Netz.
 *
 * Der Browser spricht nie direkt mit der Modell-API — er ruft /api/jarvis auf,
 * und erst diese Function setzt den API-Schlüssel ein. Der Schlüssel liegt in
 * den Netlify-Umgebungsvariablen und taucht nirgends im ausgelieferten Code auf.
 *
 * Die eigentliche Arbeit steht in ../../server/core.mjs, damit der lokale
 * Server (Termux, PC) exakt dasselbe tut.
 */

import type { Config } from "@netlify/functions";
import { check, pump, startStream, DEFAULT_MODEL, SSE_HEADERS } from "../../server/core.mjs";

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
  const stream = startStream({ apiKey, model, messages: checked.messages });
  const encoder = new TextEncoder();

  const body = new ReadableStream({
    async start(controller) {
      const emit = (event: string, data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      emit("meta", { model, unprotected: !passcode });
      await pump(stream, emit);
      controller.close();
    },
    cancel() {
      // Der Browser hat abgebrochen — dann muss das Modell nicht weiterschreiben.
      stream.abort();
    }
  });

  return new Response(body, { headers: SSE_HEADERS });
};

export const config: Config = {
  path: "/api/jarvis"
};
