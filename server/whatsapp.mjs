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
 * Antwort danach über die REST-API hinterher.
 *
 * Systemprompt und Modellaufruf kommen aus `core.mjs`, das Twilio-Handwerk aus
 * `twilio.mjs`. Hier steht nur, was diesen Kanal ausmacht.
 */

import { API_VERSION, DEFAULT_MODEL, SYSTEM_PROMPT, messagesUrl, isOauthToken, sanitize } from "./core.mjs";
import { nummer, nummernListe } from "./twilio.mjs";

/** So viele Nachrichten Gedächtnis. Jede kostet bei jeder Frage wieder. */
export const MAX_VERLAUF = 12;
/** Kurzer Kanal, kurze Antworten — und ein Deckel gegen Ausreißer. */
export const MAX_TOKENS = 1000;

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
  const liste = nummernListe(freigabe);
  if (!liste.length) return false;
  return liste.includes(nummer(absender));
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
