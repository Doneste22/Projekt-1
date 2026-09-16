/**
 * Nimmt die Anfragen vom Angebotsformular entgegen und schickt sie als SMS
 * auf Damasos Handy.
 *
 * Kein Twilio-Webhook, sondern die eigene Seite ruft hier an — also gibt es
 * keine Unterschrift zu prüfen. Stattdessen zählt der Endpunkt mit, wie oft
 * geschrieben wurde: er steht offen im Netz, und jede SMS kostet.
 *
 * Die Seite bekommt eine kurze Rückmeldung und zeigt sie an; geht hier etwas
 * schief, bleibt der mailto-Weg im Formular als Netz darunter.
 */

import type { Config, Context } from "@netlify/edge-functions";
import { getStore } from "@netlify/blobs";
import { nummernListe, sendeAnAlle } from "../../server/twilio.mjs";
import { nachrichtText, pruefe, zuOft } from "../../server/anfrage.mjs";

function json(status: number, koerper: Record<string, unknown>) {
  return new Response(JSON.stringify(koerper), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return json(405, { error: "Nur POST." });

  let daten: unknown;
  try {
    daten = await req.json();
  } catch {
    return json(400, { error: "Die Anfrage kam beschädigt an." });
  }

  const geprueft = pruefe(daten);
  // Sieht nach Skript aus: nichts verschicken, aber Erfolg melden.
  if (geprueft.still) return json(200, { ok: true });
  if (geprueft.fehler) return json(400, { error: geprueft.fehler });

  const ziele = nummernListe(
    Netlify.env.get("JARVIS_MEINE_NUMMERN") || Netlify.env.get("JARVIS_WHATSAPP_NUMMERN")
  );
  const absender = Netlify.env.get("JARVIS_SMS_ABSENDER");
  const accountSid = Netlify.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Netlify.env.get("TWILIO_AUTH_TOKEN");

  if (!ziele.length || !absender || !accountSid || !authToken) {
    console.error("anfrage: Twilio ist nicht eingerichtet — es fehlen Netlify-Variablen.");
    return json(503, { error: "Der Versand ist noch nicht eingerichtet." });
  }

  const speicher = fach();
  if (await zuOft(speicher, kennung(context))) {
    console.warn("anfrage: zu viele Anfragen von", kennung(context));
    return json(429, { error: "Da kamen gerade sehr viele Anfragen. Versuch es in einer Stunde nochmal." });
  }

  const verschickt = await sendeAnAlle(
    { accountSid, authToken, von: absender },
    ziele,
    nachrichtText(geprueft.anfrage)
  );

  if (!verschickt) return json(502, { error: "Der Versand hat nicht geklappt." });
  return json(200, { ok: true });
};

/** Wer geschrieben hat — nur zum Mitzählen, nicht gespeichert im Klartext. */
function kennung(context: Context) {
  return (context.ip || "unbekannt").replace(/[^0-9a-zA-Z]/g, "");
}

function fach() {
  try {
    return getStore("jarvis-anfragen");
  } catch (e) {
    console.warn("anfrage: kein Speicher zum Mitzählen —", (e as Error)?.message);
    return null;
  }
}

export const config: Config = {
  path: "/api/anfrage"
};
