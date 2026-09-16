/**
 * Jarvis über WhatsApp und SMS — die Hülle fürs Netz.
 *
 * Twilio ruft diese Adresse auf, sobald jemand der Nummer schreibt. Geantwortet
 * wird **nicht** hier: Twilio wartet auf den Webhook nur wenige Sekunden, und
 * eine durchdachte Antwort dauert länger. Also sofort ein leeres `204` — die
 * Zustellung ist damit bestätigt — und die Antwort kommt danach über die
 * REST-API hinterher. Genau so steht es in Twilios eigener Anleitung für
 * alles, was nicht in Sekundenbruchteilen fertig ist.
 *
 * Möglich macht das `context.waitUntil`: Netlify lässt die Function nach der
 * Antwort weiterlaufen. Die 50 Millisekunden Rechenzeit einer Edge-Function
 * reichen dafür bequem — gewartet wird viel, gerechnet fast nichts (ein
 * HMAC, zwei JSON-Häppchen).
 *
 * Alles Inhaltliche steht in ../../server/whatsapp.mjs und ist dort geprüft.
 */

import type { Config, Context } from "@netlify/edge-functions";
import { getStore } from "@netlify/blobs";
import {
  antwortHolen,
  darfFragen,
  ladeVerlauf,
  nummer,
  sendeAntwort,
  sichereVerlauf,
  signaturStimmt,
  verlaufSchluessel,
  MAX_VERLAUF
} from "../../server/whatsapp.mjs";

/** Womit Damaso den Verlauf wegwerfen kann, ohne irgendwo hinzugehen. */
const NEUSTART = ["neu", "/neu", "reset", "/reset", "von vorn", "löschen"];

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(null, { status: 405 });
  }

  // Twilio schickt ein Formular. Die Werte werden hier entschlüsselt — genau
  // in dieser Form rechnet Twilio auch seine Unterschrift aus.
  const felder = Object.fromEntries(new URLSearchParams(await req.text())) as Record<string, string>;

  // Erst bestätigen, dann arbeiten. Twilio wartet sonst vergeblich und
  // trägt einen Fehler ins Protokoll ein, obwohl alles gut ging.
  // Was in waitUntil fliegt, fliegt ins Leere — also hier abfangen, sonst
  // steht im Protokoll nichts als eine unbehandelte Ausnahme.
  context.waitUntil(
    bearbeiten(req, felder).catch((e) => {
      console.error("jarvis-whatsapp: unerwarteter Fehler —", (e as Error)?.stack || e);
    })
  );
  return new Response(null, { status: 204 });
};

async function bearbeiten(req: Request, felder: Record<string, string>) {
  const authToken = Netlify.env.get("TWILIO_AUTH_TOKEN");
  if (!authToken) {
    console.error("jarvis-whatsapp: TWILIO_AUTH_TOKEN fehlt in den Netlify-Variablen.");
    return;
  }

  // Die Adresse muss die sein, die Twilio aufgerufen hat. Schreibt etwas
  // davor Schema oder Host um, stimmt die Unterschrift nicht mehr — dann
  // trägt man die richtige Adresse hier ein.
  const adresse = Netlify.env.get("JARVIS_WHATSAPP_URL") || req.url;
  const echt = await signaturStimmt({
    authToken,
    url: adresse,
    felder,
    signatur: req.headers.get("x-twilio-signature")
  });
  if (!echt) {
    console.warn("jarvis-whatsapp: Unterschrift stimmt nicht — Anfrage kommt nicht von Twilio.");
    return;
  }

  const von = felder.From;      // wer geschrieben hat
  const an = felder.To;         // welche Nummer angeschrieben wurde
  if (!von || !an) return;

  if (!darfFragen(von, Netlify.env.get("JARVIS_WHATSAPP_NUMMERN"))) {
    // Kein Wort zurück: eine Antwort kostet Geld und verriete, dass hier
    // etwas läuft. Wer freigeschaltet gehört, steht in der Variablen.
    console.warn("jarvis-whatsapp: Nummer nicht freigegeben:", nummer(von));
    return;
  }

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  const accountSid = Netlify.env.get("TWILIO_ACCOUNT_SID") || felder.AccountSid;
  if (!accountSid) {
    console.error("jarvis-whatsapp: keine AccountSid — weder als Variable noch in der Anfrage.");
    return;
  }
  const post = { accountSid, authToken, von: an, an: von };

  if (!apiKey) {
    console.error("jarvis-whatsapp: ANTHROPIC_API_KEY fehlt in den Netlify-Variablen.");
    await sendeAntwort(post, "Auf dem Server fehlt der API-Schlüssel. Er gehört in die Netlify-Variablen.");
    return;
  }

  const speicher = fach();
  const schluessel = verlaufSchluessel(von);
  const frage = String(felder.Body || "").trim();

  if (NEUSTART.includes(frage.toLowerCase())) {
    await sichereVerlauf(speicher, schluessel, []);
    await sendeAntwort(post, "Verlauf gelöscht. Fang an.");
    return;
  }

  if (!frage) {
    const mitMedien = Number(felder.NumMedia || 0) > 0;
    await sendeAntwort(
      post,
      mitMedien
        ? "Bilder und Sprachnachrichten kann ich hier nicht ansehen — schreib es mir kurz."
        : "Da war kein Text dabei."
    );
    return;
  }

  const verlauf = await ladeVerlauf(speicher, schluessel);
  verlauf.push({ role: "user", content: frage });

  const ergebnis = await antwortHolen({
    apiKey,
    baseUrl: Netlify.env.get("ANTHROPIC_BASE_URL"),
    model: Netlify.env.get("JARVIS_MODEL"),
    verlauf: verlauf.slice(-MAX_VERLAUF)
  });

  if (ergebnis.fehler) {
    // Die Frage kommt nicht in den Verlauf: eine Frage ohne Antwort würde
    // beim nächsten Mal als unbeantwortet mitgeschickt und verwirrt nur.
    await sendeAntwort(post, ergebnis.fehler);
    return;
  }

  const text = ergebnis.abgeschnitten
    ? ergebnis.text + "\n\n(Hier war Schluss — frag nach dem Rest.)"
    : ergebnis.text;

  const verschickt = await sendeAntwort(post, text);
  if (verschickt) {
    verlauf.push({ role: "assistant", content: ergebnis.text });
    await sichereVerlauf(speicher, schluessel, verlauf);
  }
}

/**
 * Das Ablagefach für den Verlauf. Netlify Blobs gibt es auf jedem Projekt,
 * ohne Zugangsdaten. Ist es nicht erreichbar, antwortet Jarvis eben ohne
 * Gedächtnis weiter — das ist besser als gar nicht zu antworten.
 */
function fach() {
  try {
    return getStore("jarvis-whatsapp");
  } catch (e) {
    console.warn("jarvis-whatsapp: kein Speicher für den Verlauf —", (e as Error)?.message);
    return null;
  }
}

export const config: Config = {
  path: "/api/jarvis-whatsapp"
};
