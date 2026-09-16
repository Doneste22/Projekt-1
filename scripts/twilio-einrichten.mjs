#!/usr/bin/env node
/**
 * Richtet Twilio für dieses Projekt ein — in einem Durchgang.
 *
 *   node scripts/twilio-einrichten.mjs
 *
 * Fragt nach den vier Angaben aus der Twilio-Console, trägt sie in die
 * Netlify-Variablen ein, veröffentlicht neu (Variablen wirken erst dann) und
 * schreibt zum Schluss auf, welche drei Adressen bei Twilio einzutragen sind.
 *
 * Gebraucht wird nur die Netlify-Anmeldung. Ist sie noch nicht da, sagt das
 * Skript es und bricht ab, statt auf halbem Weg stehen zu bleiben.
 */

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { execFileSync } from "node:child_process";

const NETLIFY = ["npx", "--yes", "netlify-cli@latest"];

function netlify(...argumente) {
  const [befehl, ...rest] = [...NETLIFY, ...argumente];
  return execFileSync(befehl, rest, { encoding: "utf-8", stdio: ["inherit", "pipe", "pipe"] });
}

function versuche(beschreibung, arbeit) {
  try {
    return arbeit();
  } catch (e) {
    console.error(`\n✗ ${beschreibung} ging schief:\n${e.stderr || e.message}`);
    process.exit(1);
  }
}

const frage = createInterface({ input: stdin, output: stdout });

async function pflicht(text, pruefung) {
  for (;;) {
    const wert = (await frage.question(text)).trim();
    if (!wert) {
      console.log("  … das brauche ich wirklich.");
      continue;
    }
    if (pruefung && !pruefung(wert)) {
      console.log("  … das sieht nicht richtig aus, nochmal.");
      continue;
    }
    return wert;
  }
}

console.log(`
Twilio einrichten
=================

Was du brauchst — alles auf console.twilio.com, Startseite:

  1. Account SID       beginnt mit AC…
  2. Auth Token        steht daneben, muss erst sichtbar gemacht werden
  3. Deine Twilio-Nummer, an die Anrufe und SMS gehen (+41…)
  4. Deine eigene Handynummer, auf der die Meldungen landen (+41…)

Zum Ausprobieren ohne gekaufte Nummer: Messaging → Try it out → WhatsApp.
Dort steht die Sandbox-Nummer, die du bei 3. eintragen kannst.
`);

const sid = await pflicht("1. Account SID: ", (w) => /^AC[0-9a-f]{32}$/i.test(w));
const token = await pflicht("2. Auth Token: ", (w) => w.length >= 20);
const twilioNummer = await pflicht("3. Twilio-Nummer (+41…): ", (w) => /^\+[0-9]{8,15}$/.test(w));
const meineNummer = await pflicht("4. Deine Handynummer (+41…): ", (w) => /^\+[0-9]{8,15}$/.test(w));
frage.close();

console.log("\nProjekt bei Netlify suchen …");
const status = versuche("Netlify abfragen", () => netlify("status", "--json"));
let projekt;
try {
  projekt = JSON.parse(status);
} catch {
  console.error("Netlify antwortet unverständlich. Bist du angemeldet? `npx netlify-cli login`");
  process.exit(1);
}
const name = projekt?.siteData?.name || projekt?.siteData?.site_id;
const adresse = projekt?.siteData?.ssl_url || projekt?.siteData?.url;
if (!name || !adresse) {
  console.error("Kein verbundenes Netlify-Projekt gefunden. Erst `npx netlify-cli link` im Projektordner.");
  process.exit(1);
}
console.log(`  gefunden: ${name} (${adresse})`);

const variablen = [
  ["TWILIO_ACCOUNT_SID", sid, false],
  ["TWILIO_AUTH_TOKEN", token, true],
  ["JARVIS_SMS_ABSENDER", twilioNummer, false],
  ["JARVIS_MEINE_NUMMERN", meineNummer, false],
  ["JARVIS_ANRUF_WEITER", meineNummer, false]
];

console.log("\nVariablen eintragen …");
for (const [schluessel, wert, geheim] of variablen) {
  versuche(`${schluessel} setzen`, () =>
    netlify("env:set", schluessel, wert, ...(geheim ? ["--secret"] : []))
  );
  console.log(`  ✓ ${schluessel}${geheim ? " (geheim)" : ""}`);
}

// Geheim markierte Variablen sind beim Anlegen schon einmal stillschweigend
// verschwunden. Also nachsehen, nicht hoffen.
console.log("\nNachsehen, ob wirklich alles angekommen ist …");
const liste = versuche("Variablen abfragen", () => netlify("env:list", "--json"));
const vorhanden = JSON.parse(liste);
let fehlt = false;
for (const [schluessel] of variablen) {
  if (!(schluessel in vorhanden)) {
    console.error(`  ✗ ${schluessel} fehlt — von Hand nachtragen.`);
    fehlt = true;
  } else {
    console.log(`  ✓ ${schluessel}`);
  }
}
if (fehlt) process.exit(1);

console.log("\nNeu veröffentlichen (Variablen wirken erst danach) …");
versuche("veröffentlichen", () => netlify("deploy", "--prod"));

console.log(`
Fertig auf dieser Seite.
========================

Bleibt das, was nur in Twilios Oberfläche geht. Auf console.twilio.com:

  Phone Numbers → deine Nummer → Configure

    A CALL COMES IN        Webhook   POST   ${adresse}/api/anruf
    A MESSAGE COMES IN     Webhook   POST   ${adresse}/api/jarvis-whatsapp

  Für WhatsApp zusätzlich: Messaging → Try it out → WhatsApp → Sandbox settings

    WHEN A MESSAGE COMES IN   POST   ${adresse}/api/jarvis-whatsapp

Danach:
  • Der Nummer eine WhatsApp schreiben — Jarvis antwortet.
  • Die Nummer anrufen, nicht abnehmen, aufs Band sprechen — der Text kommt als SMS.
  • Auf ${adresse}/angebot.html das Formular abschicken — die Anfrage kommt als SMS.
`);
