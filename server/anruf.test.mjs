/**
 * Prüfung für den Anrufbeantworter.
 *
 *   node --test server/anruf.test.mjs
 *
 * Geprüft wird das TwiML (das ist der Gesprächsverlauf — ein Fehler darin
 * hört der Anrufer sofort) und die Mitschrift gegen einen Nachbau von Twilio
 * und ElevenLabs.
 */

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { ansageTwiml, meldungText, mitschrift, KLINGELDAUER_S, MAX_AUFNAHME_S } from "./anruf.mjs";

async function nachbau(handler) {
  const gesehen = [];
  const server = http.createServer(async (req, res) => {
    const teile = [];
    for await (const stueck of req) teile.push(stueck);
    gesehen.push({ pfad: req.url, kopf: req.headers, laenge: Buffer.concat(teile).length });
    handler(req, res);
  });
  await new Promise((fertig) => server.listen(0, "127.0.0.1", fertig));
  return {
    adresse: `http://127.0.0.1:${server.address().port}`,
    gesehen,
    schliessen: () => new Promise((fertig) => server.close(fertig))
  };
}

/* ------------------------------------------------------------------ TwiML */

test("ohne Weiterleitung geht es direkt auf die Ansage", () => {
  const xml = ansageTwiml({ rueckruf: "https://wandfuerwand.ch/api/anruf-mitschrift" });
  assert.ok(!xml.includes("<Dial"));
  assert.ok(xml.includes('<Say language="de-DE"'));
  assert.ok(xml.includes("<Record"));
  assert.ok(xml.includes(`maxLength="${MAX_AUFNAHME_S}"`));
});

test("mit Weiterleitung klingelt erst das Handy", () => {
  const xml = ansageTwiml({
    weiterAn: "+41791234567",
    rueckruf: "https://wandfuerwand.ch/api/anruf-mitschrift"
  });
  assert.ok(xml.indexOf("<Dial") < xml.indexOf("<Record"), "erst klingeln, dann aufnehmen");
  assert.ok(xml.includes(`timeout="${KLINGELDAUER_S}"`));
  assert.ok(xml.includes("<Number>+41791234567</Number>"));
});

test("Text in der Ansage kann das TwiML nicht zerreissen", () => {
  const xml = ansageTwiml({
    ansage: 'Böses </Say><Hangup/> & "Anführung"',
    rueckruf: "https://wandfuerwand.ch/x"
  });
  assert.ok(!xml.includes("<Hangup/>"), "eingeschmuggelte Anweisung darf nicht durchkommen");
  assert.ok(xml.includes("&lt;/Say&gt;"));
  assert.ok(xml.includes("&amp;"));
});

test("Twilios eigene Mitschrift wird nicht angefordert", () => {
  // Sie kann nur amerikanisches Englisch — steht so in Twilios Dokumentation.
  const xml = ansageTwiml({ rueckruf: "https://wandfuerwand.ch/x" });
  assert.ok(!xml.includes("transcribe"), "sonst zahlt er für eine unbrauchbare Mitschrift");
});

/* ------------------------------------------------------------- Mitschrift */

test("die Aufnahme wird geholt und verschriftlicht", async () => {
  const twilio = await nachbau((req, res) => {
    res.writeHead(200, { "content-type": "audio/mpeg" });
    res.end(Buffer.from("ID3 tu so als wäre ich ein mp3"));
  });
  const eleven = await nachbau((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ text: "Grüezi, hier Meier, bitte zurückrufen." }));
  });

  const ergebnis = await mitschrift({
    aufnahmeUrl: `${twilio.adresse}/RE123`,
    accountSid: "AC123",
    authToken: "token",
    stimmeSchluessel: "xi-123",
    basis: eleven.adresse
  });

  assert.equal(ergebnis.text, "Grüezi, hier Meier, bitte zurückrufen.");
  assert.equal(twilio.gesehen[0].pfad, "/RE123.mp3", "Twilio liefert die MP3 unter .mp3");
  assert.equal(twilio.gesehen[0].kopf.authorization, "Basic " + Buffer.from("AC123:token").toString("base64"));
  assert.equal(eleven.gesehen[0].pfad, "/v1/speech-to-text");
  assert.equal(eleven.gesehen[0].kopf["xi-api-key"], "xi-123");
  assert.ok(eleven.gesehen[0].laenge > 0, "die Tondatei muss mitgeschickt werden");

  await twilio.schliessen();
  await eleven.schliessen();
});

test("ohne ElevenLabs-Schlüssel wird gesagt, was fehlt", async () => {
  const ergebnis = await mitschrift({ aufnahmeUrl: "https://x/RE1", stimmeSchluessel: "" });
  assert.match(ergebnis.fehler, /ELEVENLABS_API_KEY/);
});

test("eine unverständliche Aufnahme wird als solche gemeldet", async () => {
  const twilio = await nachbau((req, res) => { res.writeHead(200); res.end(Buffer.from("x")); });
  const eleven = await nachbau((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ text: "   " }));
  });

  const ergebnis = await mitschrift({
    aufnahmeUrl: `${twilio.adresse}/RE1`, accountSid: "AC1", authToken: "t",
    stimmeSchluessel: "xi", basis: eleven.adresse
  });

  assert.match(ergebnis.fehler, /nichts zu verstehen/);
  await twilio.schliessen();
  await eleven.schliessen();
});

/* ---------------------------------------------------------------- Meldung */

test("die Meldung nennt Anrufer und Text", () => {
  const text = meldungText({
    anrufer: "+41791234567",
    dauer: "23",
    text: "Hier Meier, bitte zurückrufen."
  });
  assert.ok(text.includes("+41791234567"));
  assert.ok(text.includes("23 Sekunden"));
  assert.ok(text.includes("Hier Meier"));
});

test("ohne Mitschrift kommt trotzdem eine Meldung, mit Link zum Anhören", () => {
  const text = meldungText({
    anrufer: "+41791234567",
    fehler: "Die Mitschrift ist nicht durchgegangen.",
    aufnahmeUrl: "https://api.twilio.com/RE9"
  });
  assert.ok(text.includes("nicht durchgegangen"));
  assert.ok(text.includes("https://api.twilio.com/RE9.mp3"), "sonst ist der Anruf verloren");
});
