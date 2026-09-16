/**
 * Jarvis über WhatsApp und SMS — der Kern.
 *
 * Damaso schreibt an eine Twilio-Nummer, Jarvis antwortet. Ohne App, ohne
 * Schlüssel auf dem Gerät, von jedem Telefon aus.
 *
 * Der Ablauf ist anders als im Browser, und zwar aus einem Grund, der von
 * Twilio selbst kommt: eine Antwort darf nicht im Webhook stehen, weil Twilio
 * dort nur wenige Sekunden wartet (höchstens 15). Stattdessen bestätigt der
 * Server die Zustellung sofort mit einem leeren `204` und schickt die fertige
 * Antwort danach über die REST-API hinterher. Twilio nennt das ausdrücklich
 * als den richtigen Weg für alles, was länger dauert als ein Wimpernschlag.
 *
 * Systemprompt und Modellaufruf kommen aus `core.mjs` — ein Prompt an zwei
 * Stellen driftet garantiert auseinander.
 *
 * Hier steht nur Logik ohne Netlify und ohne Twilio-Bibliothek, damit sich
 * alles mit `node --test server/whatsapp.test.mjs` prüfen lässt.
 */

import { API_VERSION, DEFAULT_MODEL, SYSTEM_PROMPT, messagesUrl, isOauthToken, sanitize } from "./core.mjs";

/** Twilios Grenze für eine Nachricht. Mehr nimmt die API nicht an. */
export const MAX_ZEICHEN = 1600;
/** Mehr als drei Nachrichten am Stück ist Spam an sich selbst. */
export const MAX_TEILE = 3;
/** So viele Nachrichten Gedächtnis. Jede kostet bei jeder Frage wieder. */
export const MAX_VERLAUF = 12;
/** Kurzer Kanal, kurze Antworten — und ein Deckel gegen Ausreißer. */
export const MAX_TOKENS = 1000;

const TWILIO_API = "https://api.twilio.com";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/**
 * Zusatz zum Systemprompt für diesen Kanal. Steht bewusst hier und nicht in
 * `core.mjs`: es geht um die Form der Antwort, nicht um die Person.
 */
export const KANAL_ZUSATZ = [
  "",
  "Diese Unterhaltung läuft über WhatsApp oder SMS.",
  "Fass dich kurz — ein paar Sätze, und nur das, wonach gefragt wurde. Lange Antworten kommen hier in Stücken an und kosten pro Stück.",
  "Schreib reinen Text: keine Sternchen, keine Rauten, keine Tabellen. Aufzählungen mit einem Strich am Zeilenanfang sind in Ordnung.",
  "Braucht eine Frage wirklich viel Text, sag das in einem Satz und nenn das Wichtigste zuerst."
].join("\n");

/* ------------------------------------------------------------- Absender */

/** Twilio hängt `whatsapp:` vor die Nummer. Zum Vergleichen wollen wir die nackte. */
export function nummer(adresse) {
  return String(adresse || "").trim().replace(/^whatsapp:/i, "").replace(/[\s()\/-]/g, "");
}

/**
 * Wer fragen darf. **Eine leere Liste heißt: niemand.**
 *
 * Das ist Absicht. Ein offener Endpunkt bedeutet hier nicht nur fremden
 * Zugriff, sondern eine fremde Rechnung: jede Frage kostet Damaso Geld bei
 * Anthropic und jede Antwort zusätzlich bei Twilio. Wer die Nummer errät,
 * bekommt deshalb gar nichts — nicht einmal eine Fehlermeldung, die verriete,
 * dass hier überhaupt etwas läuft.
 */
export function darfFragen(absender, freigabe) {
  const liste = String(freigabe || "")
    .split(",")
    .map((n) => nummer(n))
    .filter(Boolean);
  if (!liste.length) return false;
  return liste.includes(nummer(absender));
}

/* ----------------------------------------------------------- Unterschrift */

/**
 * Twilio unterschreibt jede Anfrage: HMAC-SHA1 über die aufgerufene Adresse
 * plus alle Formularfelder, alphabetisch sortiert und aneinandergehängt,
 * mit dem Auth-Token als Schlüssel; das Ergebnis steht in `X-Twilio-Signature`.
 *
 * Ohne diese Prüfung könnte jeder, der die Adresse kennt, so tun, als wäre er
 * Twilio — und Damasos Nummer als Absender behaupten. Die Freigabeliste allein
 * reicht also nicht.
 *
 * Die Adresse muss **exakt** die sein, die Twilio aufgerufen hat. Steht ein
 * Proxy davor, der Schema oder Host umschreibt, stimmt die Unterschrift nicht
 * mehr — dafür gibt es die Umgebungsvariable JARVIS_WHATSAPP_URL.
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

/* --------------------------------------------------------------- Verlauf */

/** Ein Ablagefach pro Nummer. Nur Ziffern, damit der Name überall taugt. */
export function verlaufSchluessel(absender) {
  return "verlauf-" + nummer(absender).replace(/[^0-9]/g, "");
}

/**
 * Lädt das bisherige Gespräch. `speicher` ist alles mit `get` und `set` —
 * im Betrieb Netlify Blobs, in der Prüfung ein Fach aus zwei Zeilen.
 * Geht dabei etwas schief, fängt Jarvis eben ohne Gedächtnis an; ohne
 * Antwort dazustehen wäre schlechter.
 */
export async function ladeVerlauf(speicher, schluessel) {
  if (!speicher) return [];
  try {
    const roh = await speicher.get(schluessel);
    if (!roh) return [];
    const liste = typeof roh === "string" ? JSON.parse(roh) : roh;
    if (!Array.isArray(liste)) return [];
    return liste
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .slice(-MAX_VERLAUF);
  } catch (e) {
    console.warn("jarvis-whatsapp: Verlauf nicht lesbar, fange leer an —", e?.message || e);
    return [];
  }
}

export async function sichereVerlauf(speicher, schluessel, verlauf) {
  if (!speicher) return;
  try {
    await speicher.set(schluessel, JSON.stringify(verlauf.slice(-MAX_VERLAUF)));
  } catch (e) {
    console.warn("jarvis-whatsapp: Verlauf nicht speicherbar —", e?.message || e);
  }
}

/* ---------------------------------------------------------------- Modell */

/**
 * Fragt das Modell — ohne Strom, denn hier gibt es nichts, was wortweise
 * erscheinen könnte: WhatsApp bekommt eine fertige Nachricht.
 */
export async function antwortHolen({ apiKey, baseUrl, model, verlauf, signal }) {
  // Die Messages-API nimmt nur abwechselnde Rollen, Anfang und Ende beim
  // Nutzer. Ein auf die letzten Nachrichten gekürzter Verlauf beginnt aber
  // leicht mit einer Antwort — dann kommt ein 400 zurück, und Damaso sähe nur
  // „hat nicht geklappt". `sanitize` schneidet vorne und hinten zurecht.
  const nachrichten = sanitize(verlauf);
  if (!nachrichten.length) {
    return { fehler: "Da war keine Frage dabei." };
  }

  const oauth = isOauthToken(apiKey);
  const kopf = {
    "content-type": "application/json",
    "anthropic-version": API_VERSION
  };
  if (oauth) {
    kopf.authorization = `Bearer ${String(apiKey).trim()}`;
    kopf["anthropic-beta"] = `oauth-2025-04-20,${FALLBACK_BETA}`;
  } else {
    kopf["x-api-key"] = String(apiKey).trim();
    kopf["anthropic-beta"] = FALLBACK_BETA;
  }

  let antwort;
  try {
    antwort = await fetch(messagesUrl(baseUrl), {
      method: "POST",
      signal,
      headers: kopf,
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT + KANAL_ZUSATZ,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        fallbacks: "default",
        messages: nachrichten
      })
    });
  } catch (e) {
    console.error("jarvis-whatsapp: Modell nicht erreichbar —", e?.message || e);
    return { fehler: "Ich komme gerade nicht ans Modell. Versuch es in einer Minute nochmal." };
  }

  if (!antwort.ok) {
    const text = await antwort.text().catch(() => "");
    console.error("jarvis-whatsapp: Modell antwortet", antwort.status, text.slice(0, 300));
    if (antwort.status === 401 || antwort.status === 403) {
      return { fehler: "Der API-Schlüssel wird abgelehnt. Er muss in den Netlify-Variablen erneuert werden." };
    }
    if (antwort.status === 429) return { fehler: "Das Modell ist gerade ausgelastet. Gleich nochmal." };
    return { fehler: "Das hat nicht geklappt. Versuch es gleich nochmal." };
  }

  const daten = await antwort.json().catch(() => null);
  const text = (daten?.content || [])
    .filter((teil) => teil?.type === "text")
    .map((teil) => teil.text)
    .join("")
    .trim();

  // Wird eine Anfrage aus Sicherheitsgründen abgelehnt, kommt sie ohne Text
  // zurück. Eine leere Nachricht nimmt Twilio nicht an — und Damaso stünde
  // vor einem Schweigen, das er nicht deuten kann.
  if (!text) {
    if (daten?.stop_reason === "refusal") {
      return { fehler: "Das will ich nicht beantworten. Frag es anders." };
    }
    return { fehler: "Das Modell hat nichts geschickt. Versuch es nochmal." };
  }

  return { text, abgeschnitten: daten?.stop_reason === "max_tokens" };
}

/* ---------------------------------------------------------------- Senden */

/**
 * Zerlegt eine Antwort in versandfertige Stücke. Getrennt wird an Absätzen,
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
    if (schnitt < max * 0.5) schnitt = Math.max(fenster.lastIndexOf(". "), fenster.lastIndexOf("! "), fenster.lastIndexOf("? "));
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
 * Schickt eine Nachricht über Twilio. `von` ist die Nummer, bei der die Frage
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
    console.error("jarvis-whatsapp: Twilio nimmt die Nachricht nicht —", antwort.status, meldung.slice(0, 300));
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
