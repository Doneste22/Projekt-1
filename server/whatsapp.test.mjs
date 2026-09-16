/**
 * Prüfung für Jarvis über WhatsApp — und für das Twilio-Handwerk in
 * twilio.mjs, das inzwischen auch Anfragen und Anrufe benutzen.
 *
 *   node --test server/whatsapp.test.mjs
 *
 * Geprüft wird gegen einen Nachbau, der das Antwortformat der Messages-API und
 * die Messages-Schnittstelle von Twilio nachspielt — ohne Netz, ohne Konto und
 * ohne einen Rappen Kosten. Das deckt genau die Stellen ab, die sonst erst im
 * Betrieb auffielen: was tatsächlich gesendet wird, wer durchgelassen wird, und
 * ob eine gefälschte Unterschrift abprallt.
 */

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createHmac } from "node:crypto";

import { nummer, sendeNachricht, signaturStimmt, teile, MAX_ZEICHEN } from "./twilio.mjs";
import {
  antwortHolen,
  darfFragen,
  ladeVerlauf,
  sichereVerlauf,
  verlaufSchluessel,
  KANAL_ZUSATZ,
  MAX_VERLAUF
} from "./whatsapp.mjs";

/* -------------------------------------------------------------- Werkzeug */

/** Ein Fach wie Netlify Blobs, aber aus zwei Zeilen. */
function fach(inhalt = new Map()) {
  return {
    inhalt,
    async get(k) { return inhalt.get(k) ?? null; },
    async set(k, v) { inhalt.set(k, v); }
  };
}

/** Rechnet Twilios Unterschrift aus — bewusst mit einer anderen Bibliothek
 *  als der Code, sonst prüfte sich ein Fehler selbst durch. */
function twilioUnterschrift(authToken, url, felder) {
  let daten = url;
  for (const name of Object.keys(felder).sort()) daten += name + felder[name];
  return createHmac("sha1", authToken).update(Buffer.from(daten, "utf-8")).digest("base64");
}

/** Startet einen Nachbau und gibt Adresse plus Protokoll zurück. */
async function nachbau(handler) {
  const gesehen = [];
  const server = http.createServer(async (req, res) => {
    const teile = [];
    for await (const stueck of req) teile.push(stueck);
    const rumpf = Buffer.concat(teile).toString("utf-8");
    gesehen.push({ pfad: req.url, kopf: req.headers, rumpf });
    handler(req, res, rumpf);
  });
  await new Promise((fertig) => server.listen(0, "127.0.0.1", fertig));
  return {
    adresse: `http://127.0.0.1:${server.address().port}`,
    gesehen,
    schliessen: () => new Promise((fertig) => server.close(fertig))
  };
}

function antwortet(res, status, koerper) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(koerper));
}

/* -------------------------------------------------------------- Absender */

test("nummer schält das whatsapp: und die Trennzeichen weg", () => {
  assert.equal(nummer("whatsapp:+41 79 123 45 67"), "+41791234567");
  assert.equal(nummer("+41-79-123-45-67"), "+41791234567");
  assert.equal(nummer(undefined), "");
});

test("ohne Freigabeliste darf niemand fragen", () => {
  assert.equal(darfFragen("whatsapp:+41791234567", ""), false);
  assert.equal(darfFragen("whatsapp:+41791234567", undefined), false);
});

test("nur wer auf der Liste steht, darf fragen", () => {
  const liste = "+41791234567, +34600112233";
  assert.equal(darfFragen("whatsapp:+41791234567", liste), true);
  assert.equal(darfFragen("+34600112233", liste), true);
  assert.equal(darfFragen("whatsapp:+41799999999", liste), false);
});

/* ---------------------------------------------------------- Unterschrift */

test("eine echte Unterschrift von Twilio wird angenommen", async () => {
  const token = "geheimes-auth-token";
  const url = "https://wandfuerwand.ch/api/jarvis-whatsapp";
  const felder = { From: "whatsapp:+41791234567", Body: "Servus", To: "whatsapp:+41790000000" };
  const signatur = twilioUnterschrift(token, url, felder);

  assert.equal(await signaturStimmt({ authToken: token, url, felder, signatur }), true);
});

test("eine gefälschte Unterschrift prallt ab", async () => {
  const url = "https://wandfuerwand.ch/api/jarvis-whatsapp";
  const felder = { From: "whatsapp:+41791234567", Body: "Servus" };
  const echte = twilioUnterschrift("geheimes-auth-token", url, felder);

  assert.equal(
    await signaturStimmt({ authToken: "geheimes-auth-token", url, felder, signatur: "AAAA" + echte.slice(4) }),
    false
  );
  // Ein verändertes Feld muss die Unterschrift ebenfalls ungültig machen.
  assert.equal(
    await signaturStimmt({
      authToken: "geheimes-auth-token",
      url,
      felder: { ...felder, Body: "Etwas ganz anderes" },
      signatur: echte
    }),
    false
  );
  assert.equal(await signaturStimmt({ authToken: "", url, felder, signatur: echte }), false);
});

/* -------------------------------------------------------------- Verlauf */

test("der Verlauf überlebt Hin- und Rückweg und wird gedeckelt", async () => {
  const speicher = fach();
  const schluessel = verlaufSchluessel("whatsapp:+41791234567");
  assert.match(schluessel, /^verlauf-41791234567$/);

  const viele = Array.from({ length: MAX_VERLAUF + 6 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `Nachricht ${i}`
  }));
  await sichereVerlauf(speicher, schluessel, viele);

  const zurueck = await ladeVerlauf(speicher, schluessel);
  assert.equal(zurueck.length, MAX_VERLAUF);
  assert.equal(zurueck.at(-1).content, `Nachricht ${viele.length - 1}`);
});

test("ein kaputter Verlauf wirft die App nicht um", async () => {
  const speicher = fach(new Map([["verlauf-1", "{kein json"]]));
  assert.deepEqual(await ladeVerlauf(speicher, "verlauf-1"), []);
  assert.deepEqual(await ladeVerlauf(null, "verlauf-1"), []);
});

/* ---------------------------------------------------------------- Teilen */

test("kurze Antworten bleiben ein Stück", () => {
  assert.deepEqual(teile("Zwei Sack Gips."), ["Zwei Sack Gips."]);
  assert.deepEqual(teile("   "), []);
});

test("lange Antworten werden an Satzenden geteilt, nie mitten im Wort", () => {
  const satz = "Das ist ein Satz über Gipskarton und seine Eigenheiten. ";
  const stuecke = teile(satz.repeat(60));

  assert.ok(stuecke.length > 1);
  for (const stueck of stuecke) assert.ok(stueck.length <= MAX_ZEICHEN, `zu lang: ${stueck.length}`);
  // Kein Stück endet mitten in einem Wort.
  for (const stueck of stuecke.slice(0, -1)) assert.match(stueck, /[.!?]$/);
});

test("was nicht mehr passt, wird benannt statt verschluckt", () => {
  const stuecke = teile("wort ".repeat(4000));
  assert.ok(stuecke.length <= 4);
  assert.match(stuecke.at(-1), /zu lang/);
});

/* ---------------------------------------------------------------- Modell */

test("der Aufruf ans Modell sieht aus wie im Code beschrieben", async () => {
  const server = await nachbau((req, res) => {
    antwortet(res, 200, { content: [{ type: "text", text: "Zwei Sack." }], stop_reason: "end_turn" });
  });

  const ergebnis = await antwortHolen({
    apiKey: "sk-ant-test",
    baseUrl: server.adresse,
    verlauf: [{ role: "user", content: "Wie viel Gips?" }]
  });

  const rumpf = JSON.parse(server.gesehen[0].rumpf);
  assert.equal(server.gesehen[0].pfad, "/v1/messages");
  assert.equal(server.gesehen[0].kopf["x-api-key"], "sk-ant-test");
  assert.equal(rumpf.model, "claude-opus-5");
  assert.equal(rumpf.stream, undefined, "über WhatsApp gibt es nichts zu streamen");
  assert.equal(rumpf.fallbacks, "default");
  assert.ok(rumpf.system.includes(KANAL_ZUSATZ.trim().split("\n")[0]));
  assert.equal(ergebnis.text, "Zwei Sack.");

  await server.schliessen();
});

test("eine Ablehnung des Modells wird zu einem Satz statt zu Schweigen", async () => {
  const server = await nachbau((req, res) => {
    antwortet(res, 200, { content: [], stop_reason: "refusal" });
  });

  const ergebnis = await antwortHolen({
    apiKey: "sk-ant-test",
    baseUrl: server.adresse,
    verlauf: [{ role: "user", content: "..." }]
  });

  assert.ok(ergebnis.fehler);
  assert.equal(ergebnis.text, undefined);
  await server.schliessen();
});

test("ein abgelehnter Schlüssel sagt, wo er erneuert wird", async () => {
  const server = await nachbau((req, res) => antwortet(res, 401, { error: { message: "invalid x-api-key" } }));

  const ergebnis = await antwortHolen({
    apiKey: "sk-ant-falsch",
    baseUrl: server.adresse,
    verlauf: [{ role: "user", content: "Servus" }]
  });

  assert.match(ergebnis.fehler, /Netlify/);
  await server.schliessen();
});

test("eine abgeschnittene Antwort wird als solche gemeldet", async () => {
  const server = await nachbau((req, res) => {
    antwortet(res, 200, { content: [{ type: "text", text: "Fang an und" }], stop_reason: "max_tokens" });
  });

  const ergebnis = await antwortHolen({
    apiKey: "sk-ant-test",
    baseUrl: server.adresse,
    verlauf: [{ role: "user", content: "Erzähl lang" }]
  });

  assert.equal(ergebnis.abgeschnitten, true);
  await server.schliessen();
});

test("ein Verlauf, der mit einer Antwort beginnt, wird zurechtgeschnitten", async () => {
  // So sieht er aus, sobald der Deckel vorne eine Frage abgeschnitten hat.
  const server = await nachbau((req, res) => {
    antwortet(res, 200, { content: [{ type: "text", text: "ja" }], stop_reason: "end_turn" });
  });

  await antwortHolen({
    apiKey: "sk-ant-test",
    baseUrl: server.adresse,
    verlauf: [
      { role: "assistant", content: "…zwei Sack." },
      { role: "user", content: "Und bei drei Metern?" }
    ]
  });

  const rumpf = JSON.parse(server.gesehen[0].rumpf);
  assert.equal(rumpf.messages.length, 1);
  assert.equal(rumpf.messages[0].role, "user");

  await server.schliessen();
});

test("ohne brauchbare Frage wird gar nicht erst gefragt", async () => {
  const ergebnis = await antwortHolen({ apiKey: "sk-ant-test", baseUrl: "http://127.0.0.1:1", verlauf: [] });
  assert.ok(ergebnis.fehler);
});

/* ---------------------------------------------------------------- Senden */

test("die Antwort geht mit Zugangsdaten an die richtige Adresse zurück", async () => {
  const server = await nachbau((req, res) => antwortet(res, 201, { sid: "SM123" }));

  const ok = await sendeNachricht({
    accountSid: "AC123",
    authToken: "token",
    von: "whatsapp:+41790000000",
    an: "whatsapp:+41791234567",
    text: "Zwei Sack.",
    basis: server.adresse
  });

  assert.equal(ok, true);
  const anfrage = server.gesehen[0];
  assert.equal(anfrage.pfad, "/2010-04-01/Accounts/AC123/Messages.json");
  assert.equal(anfrage.kopf.authorization, "Basic " + Buffer.from("AC123:token").toString("base64"));

  const felder = new URLSearchParams(anfrage.rumpf);
  assert.equal(felder.get("From"), "whatsapp:+41790000000");
  assert.equal(felder.get("To"), "whatsapp:+41791234567");
  assert.equal(felder.get("Body"), "Zwei Sack.");

  await server.schliessen();
});

test("nimmt Twilio die Nachricht nicht an, wird das gemeldet und nicht verschwiegen", async () => {
  const server = await nachbau((req, res) => antwortet(res, 400, { message: "nope" }));

  const ok = await sendeNachricht({
    accountSid: "AC123", authToken: "token",
    von: "+1", an: "+2", text: "Hallo", basis: server.adresse
  });

  assert.equal(ok, false);
  await server.schliessen();
});
