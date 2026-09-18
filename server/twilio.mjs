/**
 * Was alle Twilio-Sachen gemeinsam brauchen: prüfen, dass eine Anfrage
 * wirklich von Twilio kommt, und eine Nachricht verschicken.
 *
 * Steht getrennt, weil es inzwischen drei Anwender hat — Jarvis auf WhatsApp,
 * die Anfragen vom Angebotsformular und der Anrufbeantworter. Dreimal
 * dasselbe zu schreiben hiesse, es zweimal falsch zu korrigieren.
 */

export const TWILIO_API = "https://api.twilio.com";
/** Twilios Grenze für eine Nachricht. Mehr nimmt die API nicht an. */
export const MAX_ZEICHEN = 1600;
/** Mehr als drei Nachrichten am Stück ist Spam an sich selbst. */
export const MAX_TEILE = 3;

/** Twilio hängt `whatsapp:` vor die Nummer. Zum Vergleichen wollen wir die nackte. */
export function nummer(adresse) {
  return String(adresse || "").trim().replace(/^whatsapp:/i, "").replace(/[\s()\/-]/g, "");
}

/** Liest eine Liste von Nummern aus einer Umgebungsvariablen. */
export function nummernListe(wert) {
  return String(wert || "")
    .split(",")
    .map((n) => nummer(n))
    .filter(Boolean);
}

/**
 * Twilio unterschreibt jede Anfrage: HMAC-SHA1 über die aufgerufene Adresse
 * plus alle Formularfelder, alphabetisch sortiert und aneinandergehängt,
 * mit dem Auth-Token als Schlüssel; das Ergebnis steht in `X-Twilio-Signature`.
 *
 * Ohne diese Prüfung könnte jeder, der die Adresse kennt, sich als Twilio
 * ausgeben — und eine fremde Absendernummer behaupten.
 *
 * Die Adresse muss **exakt** die sein, die Twilio aufgerufen hat. Steht ein
 * Proxy davor, der Schema oder Host umschreibt, stimmt die Unterschrift nicht
 * mehr; dafür gibt es in jeder Hülle eine Umgebungsvariable zum Nachhelfen.
 */
export async function signaturStimmt({ authToken, url, felder, signatur }) {
  if (!authToken || !signatur) return false;
  let daten = String(url);
  for (const name of Object.keys(felder).sort()) daten += name + felder[name];

  const schluessel = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const roh = await crypto.subtle.sign("HMAC", schluessel, new TextEncoder().encode(daten));
  const eigen = btoa(String.fromCharCode(...new Uint8Array(roh)));
  return gleichOhneVerrat(eigen, String(signatur));
}

/** Vergleich ohne frühen Abbruch — sonst verrät die Laufzeit die Unterschrift. */
function gleichOhneVerrat(a, b) {
  if (a.length !== b.length) return false;
  let unterschied = 0;
  for (let i = 0; i < a.length; i++) unterschied |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return unterschied === 0;
}

/**
 * Zerlegt einen Text in versandfertige Stücke. Getrennt wird an Absätzen,
 * sonst an Satzenden, sonst an Leerzeichen — mitten im Wort zu schneiden liest
 * sich wie ein Fehler. Was nach `MAX_TEILE` noch übrig ist, fällt weg; dafür
 * steht am Ende ein Hinweis statt einer stillen Lücke.
 */
export function teile(text, max = MAX_ZEICHEN, hoechstens = MAX_TEILE) {
  const ganz = String(text || "").trim();
  if (!ganz) return [];
  if (ganz.length <= max) return [ganz];

  const stuecke = [];
  let rest = ganz;
  while (rest.length > max && stuecke.length < hoechstens) {
    const fenster = rest.slice(0, max);
    let schnitt = fenster.lastIndexOf("\n\n");
    if (schnitt < max * 0.5) {
      schnitt = Math.max(fenster.lastIndexOf(". "), fenster.lastIndexOf("! "), fenster.lastIndexOf("? "));
    }
    if (schnitt > 0 && ".!?".includes(fenster[schnitt])) schnitt += 1;   // hinter dem Punkt trennen
    if (schnitt < max * 0.5) schnitt = fenster.lastIndexOf(" ");
    if (schnitt <= 0) schnitt = max;
    stuecke.push(rest.slice(0, schnitt).trim());
    rest = rest.slice(schnitt).trim();
  }
  if (rest) {
    stuecke.push(
      stuecke.length >= hoechstens
        ? "… der Rest ist zu lang für eine Nachricht. Frag gezielt nach."
        : rest
    );
  }
  return stuecke.slice(0, hoechstens + 1);
}

/**
 * Schickt eine Nachricht über Twilio. `von` ist die Nummer, bei der etwas
 * ankam — damit läuft dasselbe Stück Code für WhatsApp und für SMS, ohne dass
 * irgendwo eine zweite Nummer gepflegt werden muss.
 */
export async function sendeNachricht({ accountSid, authToken, von, an, text, basis = TWILIO_API }) {
  const formular = new URLSearchParams({ From: von, To: an, Body: text });
  const antwort = await fetch(`${basis}/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: "Basic " + btoa(`${accountSid}:${authToken}`)
    },
    body: formular.toString()
  });
  if (!antwort.ok) {
    const meldung = await antwort.text().catch(() => "");
    console.error("twilio: Nachricht abgelehnt —", antwort.status, meldung.slice(0, 300));
    return false;
  }
  return true;
}

/** Alle Stücke nacheinander, in der richtigen Reihenfolge. */
export async function sendeAntwort(einstellungen, text) {
  for (const stueck of teile(text)) {
    const ok = await sendeNachricht({ ...einstellungen, text: stueck });
    if (!ok) return false;
  }
  return true;
}

/** Dieselbe Nachricht an mehrere Nummern — für Meldungen an Damaso selbst. */
export async function sendeAnAlle(einstellungen, nummern, text) {
  let alleOk = nummern.length > 0;
  for (const an of nummern) {
    const ok = await sendeAntwort({ ...einstellungen, an }, text);
    if (!ok) alleOk = false;
  }
  return alleOk;
}

/** Entschärft Text, der in XML (TwiML) landet. */
export function xmlSicher(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
