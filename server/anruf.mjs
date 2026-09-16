/**
 * Anrufbeantworter, der mitschreibt.
 *
 * Ruft jemand die Twilio-Nummer an, klingelt zuerst Damasos Handy. Nimmt er
 * nicht ab — Gerüst, Maschine, Hände voll —, kommt eine Ansage, der Anrufer
 * spricht, und Damaso bekommt kurz darauf den **Text** aufs Handy. Nicht eine
 * Sprachnachricht zum Abhören, sondern etwas zum Lesen.
 *
 * Zur Mitschrift wird ausdrücklich **nicht** Twilios eingebaute Funktion
 * benutzt: die kann laut Twilios eigener Dokumentation nur amerikanisches
 * Englisch. Für Anrufer aus der Schweiz ist das wertlos. Stattdessen geht die
 * Aufnahme an ElevenLabs, dessen Schlüssel für Jarvis' Stimme ohnehin schon
 * im Projekt liegt — und dessen Erkennung Deutsch kann.
 */

import { xmlSicher } from "./twilio.mjs";

export const STIMME_BASE = "https://api.elevenlabs.io";
/** Scribe v2 ist das empfohlene Erkennungsmodell. Überschreibbar, falls es umbenannt wird. */
export const MITSCHRIFT_MODELL = "scribe_v2";
/** Länger als zwei Minuten spricht auf einen Anrufbeantworter niemand sinnvoll. */
export const MAX_AUFNAHME_S = 120;
/** So lange klingelt Damasos Handy, bevor die Ansage kommt. */
export const KLINGELDAUER_S = 20;

/**
 * Die Ansage sagt auch, dass mitgeschrieben wird. Das ist keine Förmlichkeit:
 * die Aufnahme geht zur Verschriftlichung an einen Dienst im Ausland, und der
 * Anrufer soll auflegen können, bevor er spricht.
 */
export const ANSAGE =
  "Grüezi, Sie sind bei Damaso Estévez gelandet. Ich bin gerade auf einer Baustelle. " +
  "Sagen Sie nach dem Ton Ihren Namen, Ihre Nummer und worum es geht — ich rufe zurück. " +
  "Ihre Nachricht wird aufgezeichnet und automatisch in Text umgewandelt.";

/**
 * Das TwiML für einen eingehenden Anruf.
 *
 * Erst weiterleiten, dann aufnehmen: `<Dial>` fällt nach der Klingeldauer von
 * selbst in die nächste Anweisung, wenn niemand abnimmt. Ist keine Nummer zum
 * Weiterleiten hinterlegt, geht es direkt auf die Ansage.
 */
export function ansageTwiml({ weiterAn, ansage = ANSAGE, stimme = "Polly.Vicki-Neural", rueckruf }) {
  const zeilen = ['<?xml version="1.0" encoding="UTF-8"?>', "<Response>"];

  if (weiterAn) {
    // Ohne callerId reicht Twilio die Nummer des Anrufers durch — Damaso
    // sieht also auf dem Display, wer dran ist, und nicht seine eigene Nummer.
    zeilen.push(
      `  <Dial timeout="${KLINGELDAUER_S}"><Number>${xmlSicher(weiterAn)}</Number></Dial>`
    );
  }

  zeilen.push(`  <Say language="de-DE" voice="${xmlSicher(stimme)}">${xmlSicher(ansage)}</Say>`);
  zeilen.push(
    `  <Record maxLength="${MAX_AUFNAHME_S}" playBeep="true" trim="trim-silence"` +
      ` recordingStatusCallbackEvent="completed"` +
      ` recordingStatusCallback="${xmlSicher(rueckruf)}" />`
  );
  zeilen.push(`  <Say language="de-DE" voice="${xmlSicher(stimme)}">Danke, auf Wiederhören.</Say>`);
  zeilen.push("</Response>");
  return zeilen.join("\n");
}

/**
 * Holt die Aufnahme bei Twilio und lässt sie von ElevenLabs verschriftlichen.
 *
 * Die Aufnahme liegt hinter Twilios Zugangsdaten, lässt sich also nicht
 * einfach als Adresse weiterreichen — sie muss einmal durch. Das ist nur
 * Durchreichen von Bytes, keine Rechenarbeit: die 50 Millisekunden einer
 * Edge-Function reichen dafür.
 */
export async function mitschrift({
  aufnahmeUrl,
  accountSid,
  authToken,
  stimmeSchluessel,
  modell = MITSCHRIFT_MODELL,
  basis = STIMME_BASE
}) {
  if (!aufnahmeUrl) return { fehler: "Es kam keine Aufnahme an." };
  if (!stimmeSchluessel) return { fehler: "Für die Mitschrift fehlt ELEVENLABS_API_KEY." };

  let toene;
  try {
    // Twilio liefert unter derselben Adresse mit .mp3 eine fertige MP3-Datei.
    const geholt = await fetch(`${aufnahmeUrl}.mp3`, {
      headers: { authorization: "Basic " + btoa(`${accountSid}:${authToken}`) }
    });
    if (!geholt.ok) {
      console.error("anruf: Aufnahme nicht abholbar —", geholt.status);
      return { fehler: "Die Aufnahme ließ sich nicht abholen." };
    }
    toene = await geholt.blob();
  } catch (e) {
    console.error("anruf: Aufnahme nicht abholbar —", e?.message || e);
    return { fehler: "Die Aufnahme ließ sich nicht abholen." };
  }

  const formular = new FormData();
  formular.append("model_id", modell);
  formular.append("language_code", "deu");
  formular.append("file", toene, "anruf.mp3");

  let antwort;
  try {
    antwort = await fetch(`${basis}/v1/speech-to-text`, {
      method: "POST",
      headers: { "xi-api-key": stimmeSchluessel },
      body: formular
    });
  } catch (e) {
    console.error("anruf: Erkennung nicht erreichbar —", e?.message || e);
    return { fehler: "Die Mitschrift ist nicht durchgegangen." };
  }

  if (!antwort.ok) {
    const meldung = await antwort.text().catch(() => "");
    console.error("anruf: Erkennung antwortet", antwort.status, meldung.slice(0, 300));
    if (antwort.status === 401) return { fehler: "Der ElevenLabs-Schlüssel wird abgelehnt." };
    return { fehler: "Die Mitschrift ist nicht durchgegangen." };
  }

  const daten = await antwort.json().catch(() => null);
  const text = String(daten?.text || "").trim();
  if (!text) return { fehler: "Auf der Aufnahme war nichts zu verstehen." };
  return { text };
}

/** Was auf Damasos Handy steht, wenn jemand aufs Band gesprochen hat. */
export function meldungText({ anrufer, dauer, text, fehler, aufnahmeUrl }) {
  const zeilen = ["Anruf verpasst"];
  zeilen.push(anrufer ? `von ${anrufer}` : "von unbekannter Nummer");
  if (Number(dauer)) zeilen.push(`${Math.round(Number(dauer))} Sekunden aufs Band`);
  zeilen.push("");
  if (text) {
    zeilen.push(text);
  } else {
    zeilen.push(fehler || "Keine Mitschrift.");
    if (aufnahmeUrl) {
      zeilen.push("");
      zeilen.push("Anhören: " + aufnahmeUrl + ".mp3");
    }
  }
  return zeilen.join("\n");
}
