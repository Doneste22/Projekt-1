/**
 * Was passiert, wenn jemand die Twilio-Nummer anruft.
 *
 * Diese Antwort *ist* der Gesprächsverlauf — sie muss also sofort kommen und
 * darf nicht warten. Hier wird nichts gerechnet: eine Handvoll Zeilen TwiML,
 * fertig. Die Arbeit (Mitschrift, Meldung) passiert danach in
 * anruf-mitschrift.ts.
 */

import type { Config } from "@netlify/edge-functions";
import { signaturStimmt } from "../../server/twilio.mjs";
import { ansageTwiml } from "../../server/anruf.mjs";

export default async (req: Request) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });

  const felder = Object.fromEntries(new URLSearchParams(await req.text())) as Record<string, string>;

  const authToken = Netlify.env.get("TWILIO_AUTH_TOKEN");
  const adresse = Netlify.env.get("JARVIS_ANRUF_URL") || req.url;
  const echt = await signaturStimmt({
    authToken,
    url: adresse,
    felder,
    signatur: req.headers.get("x-twilio-signature")
  });
  if (!echt) {
    console.warn("anruf: Unterschrift stimmt nicht — Anfrage kommt nicht von Twilio.");
    return new Response(null, { status: 403 });
  }

  const twiml = ansageTwiml({
    weiterAn: Netlify.env.get("JARVIS_ANRUF_WEITER") || "",
    ansage: Netlify.env.get("JARVIS_ANRUF_ANSAGE") || undefined,
    stimme: Netlify.env.get("JARVIS_ANRUF_STIMME") || undefined,
    rueckruf: new URL("/api/anruf-mitschrift", req.url).toString()
  });

  return new Response(twiml, {
    headers: { "content-type": "text/xml; charset=utf-8", "cache-control": "no-store" }
  });
};

export const config: Config = {
  path: "/api/anruf"
};
