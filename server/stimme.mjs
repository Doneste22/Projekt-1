/**
 * Die Stimme von Jarvis — ElevenLabs.
 *
 * Warum ein eigener Endpunkt und nicht direkt aus dem Browser: der
 * ElevenLabs-Schlüssel wäre in einer HTML-Datei für jeden Besucher lesbar, und
 * jeder Fremde würde Damasos Kontingent verbrauchen. Also derselbe Aufbau wie
 * beim Modell: Kern hier, dünne Hüllen in netlify/edge-functions/stimme.ts
 * (im Netz) und server/jarvis.mjs (lokal).
 *
 * Wie beim Modell wird der Antwortstrom NICHT angefasst, sondern unverändert
 * durchgereicht — eine Edge-Function darf 50 Millisekunden rechnen, und ein
 * MP3 Byte für Byte durch eigenen Code zu schieben, sprengt das sofort.
 *
 * Kontingent: ElevenLabs schenkt 10.000 Zeichen im Monat. Das sind ungefähr
 * hundert kurze Antworten. Deshalb steht unten eine Obergrenze pro Anfrage —
 * eine einzige lange Antwort soll nicht den halben Monat auffressen.
 */

import konfig from "../jarvis/konfiguration.json" with { type: "json" };

export const STIMME_BASE = "https://api.elevenlabs.io";

/** Mehr als das wird nicht vorgelesen. Der Rest der Antwort steht ja da. */
export const MAX_ZEICHEN = 700;

export const STIMME = konfig.stimme || {};

/**
 * Prüft, was der Browser schickt. Gibt entweder einen Fehler zurück oder den
 * fertigen Text — gekürzt, aber an einer Satzgrenze, damit die Stimme nicht
 * mitten im Wort abbricht.
 */
export function pruefeText(payload) {
  const roh = payload && typeof payload.text === "string" ? payload.text.trim() : "";
  if (!roh) return { error: "Kein Text zum Vorlesen.", status: 400 };
  if (roh.length <= MAX_ZEICHEN) return { text: roh };

  const stueck = roh.slice(0, MAX_ZEICHEN);
  const schnitt = Math.max(
    stueck.lastIndexOf(". "),
    stueck.lastIndexOf("! "),
    stueck.lastIndexOf("? ")
  );
  return { text: schnitt > 200 ? stueck.slice(0, schnitt + 1) : stueck };
}

/** Baut den Aufruf an ElevenLabs. Alle Stellschrauben stehen in der Konfiguration. */
export function stimmeRequest({ apiKey, text, signal, url }) {
  const base = String(url || STIMME_BASE).trim().replace(/\/+$/, "");
  const id = String(STIMME.id || "").trim();
  const einstellungen = {
    stability: Number(STIMME.stabilitaet ?? 0.4),
    similarity_boost: Number(STIMME.aehnlichkeit ?? 0.75)
  };
  const tempo = Number(STIMME.tempo ?? 1);
  if (tempo && tempo !== 1) einstellungen.speed = tempo;

  return [
    `${base}/v1/text-to-speech/${encodeURIComponent(id)}/stream?output_format=mp3_44100_64`,
    {
      method: "POST",
      signal,
      headers: {
        "xi-api-key": String(apiKey || "").trim(),
        "content-type": "application/json",
        accept: "audio/mpeg"
      },
      body: JSON.stringify({
        text,
        model_id: STIMME.modell || "eleven_multilingual_v2",
        voice_settings: einstellungen
      })
    }
  ];
}

export async function callStimme(options) {
  const [url, init] = stimmeRequest(options);
  return fetch(url, init);
}

export const AUDIO_HEADERS = {
  "content-type": "audio/mpeg",
  "cache-control": "no-store",
  "x-accel-buffering": "no"
};

/** Fehler von ElevenLabs in etwas übersetzen, das in der Oberfläche stehen darf. */
export function describeStimme(status, bodyText) {
  if (status === 401) return "Der ElevenLabs-Schlüssel wird abgelehnt. Prüf ELEVENLABS_API_KEY.";
  if (status === 404) return "Diese Stimmen-ID gibt es nicht. Prüf „stimme.id“ in jarvis/konfiguration.json.";
  if (status === 422) return "ElevenLabs mag den Text oder die Einstellungen nicht.";
  if (status === 429) return "Das ElevenLabs-Kontingent ist aufgebraucht oder wurde zu schnell abgefragt.";
  if (status >= 500) return "ElevenLabs antwortet gerade nicht.";
  console.error("stimme: unerwartete Antwort", status, (bodyText || "").slice(0, 500));
  return "Die Stimme ist nicht durchgegangen.";
}
