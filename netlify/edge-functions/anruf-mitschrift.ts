/**
 * Twilio meldet hier, dass eine Aufnahme fertig ist.
 *
 * Dann wird sie abgeholt, verschriftlicht und als Text auf Damasos Handy
 * geschickt. Das dauert länger, als Twilio auf eine Antwort wartet — also
 * wie beim WhatsApp-Zugang: sofort ein leeres 204, die Arbeit danach in
 * `context.waitUntil`.
 */

import type { Config, Context } from "@netlify/edge-functions";
import { nummernListe, sendeAnAlle, signaturStimmt } from "../../server/twilio.mjs";
import { meldungText, mitschrift } from "../../server/anruf.mjs";

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });

  const felder = Object.fromEntries(new URLSearchParams(await req.text())) as Record<string, string>;

  context.waitUntil(
    bearbeiten(req, felder).catch((e) => {
      console.error("anruf-mitschrift: unerwarteter Fehler —", (e as Error)?.stack || e);
    })
  );
  return new Response(null, { status: 204 });
};

async function bearbeiten(req: Request, felder: Record<string, string>) {
  const authToken = Netlify.env.get("TWILIO_AUTH_TOKEN");
  if (!authToken) {
    console.error("anruf-mitschrift: TWILIO_AUTH_TOKEN fehlt.");
    return;
  }

  const adresse = Netlify.env.get("JARVIS_MITSCHRIFT_URL") || req.url;
  const echt = await signaturStimmt({
    authToken,
    url: adresse,
    felder,
    signatur: req.headers.get("x-twilio-signature")
  });
  if (!echt) {
    console.warn("anruf-mitschrift: Unterschrift stimmt nicht.");
    return;
  }

  const ziele = nummernListe(
    Netlify.env.get("JARVIS_MEINE_NUMMERN") || Netlify.env.get("JARVIS_WHATSAPP_NUMMERN")
  );
  const absender = Netlify.env.get("JARVIS_SMS_ABSENDER") || felder.To;
  const accountSid = Netlify.env.get("TWILIO_ACCOUNT_SID") || felder.AccountSid;
  if (!ziele.length || !absender || !accountSid) {
    console.error("anruf-mitschrift: Ziel oder Absender fehlt — nichts zu melden.");
    return;
  }

  const ergebnis = await mitschrift({
    aufnahmeUrl: felder.RecordingUrl,
    accountSid,
    authToken,
    stimmeSchluessel: Netlify.env.get("ELEVENLABS_API_KEY"),
    modell: Netlify.env.get("JARVIS_MITSCHRIFT_MODELL") || undefined
  });

  // Auch ohne Mitschrift bekommt Damaso Bescheid — mit dem Link zum Anhören.
  // Ein verpasster Anruf, von dem er nichts erfährt, ist das eigentliche
  // Problem; die Mitschrift ist die Bequemlichkeit obendrauf.
  await sendeAnAlle(
    { accountSid, authToken, von: absender },
    ziele,
    meldungText({
      anrufer: felder.From,
      dauer: felder.RecordingDuration,
      text: ergebnis.text,
      fehler: ergebnis.fehler,
      aufnahmeUrl: felder.RecordingUrl
    })
  );
}

export const config: Config = {
  path: "/api/anruf-mitschrift"
};
