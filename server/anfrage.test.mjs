/**
 * Prüfung für die Anfragen vom Angebotsformular.
 *
 *   node --test server/anfrage.test.mjs
 *
 * Der Schwerpunkt liegt auf der Abwehr: das Formular steht offen im Netz, und
 * jede SMS kostet. Ein Loch hier ist keine Unschönheit, sondern eine Rechnung.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { nachrichtText, pruefe, zuOft, PRO_STUNDE, PRO_TAG, MINDESTDAUER_MS } from "./anfrage.mjs";

function fach(inhalt = new Map()) {
  return {
    inhalt,
    async get(k) { return inhalt.get(k) ?? null; },
    async set(k, v) { inhalt.set(k, v); }
  };
}

const gut = {
  leistung: "Akustik-Check — CHF 240.–",
  name: "Hans Meier",
  ort: "Winterthur ZH",
  kontakt: "079 123 45 67",
  vorhaben: "Akustikdecke im Büro, 3 m hoch.",
  dauer: 45_000
};

test("eine ordentliche Anfrage kommt durch", () => {
  const { anfrage, fehler, still } = pruefe(gut);
  assert.equal(fehler, undefined);
  assert.equal(still, undefined);
  assert.equal(anfrage.name, "Hans Meier");
  assert.equal(anfrage.kontakt, "079 123 45 67");
});

test("ohne Rückweg wird nicht abgeschickt", () => {
  assert.match(pruefe({ ...gut, kontakt: "" }).fehler, /Telefon oder E-Mail/);
  assert.match(pruefe({ ...gut, name: "" }).fehler, /Namen/);
});

test("was in den Honigtopf tappt, wird still verworfen", () => {
  const ergebnis = pruefe({ ...gut, betreff: "Beste Preise GmbH" });
  assert.equal(ergebnis.still, true);
  assert.equal(ergebnis.anfrage, undefined);
  // Kein Fehler zurück: ein Skript, das merkt dass es auffliegt, probiert es anders.
  assert.equal(ergebnis.fehler, undefined);
});

test("wer das Formular in einer Sekunde ausfüllt, ist keiner", () => {
  assert.equal(pruefe({ ...gut, dauer: MINDESTDAUER_MS - 1 }).still, true);
  assert.equal(pruefe({ ...gut, dauer: MINDESTDAUER_MS + 1 }).still, undefined);
  // Fehlt die Angabe ganz, wird nicht verworfen — alte Browser, abgeschaltetes JS.
  assert.equal(pruefe({ ...gut, dauer: undefined }).still, undefined);
});

test("überlange Felder werden gekappt, nicht abgelehnt", () => {
  const { anfrage } = pruefe({ ...gut, vorhaben: "x".repeat(5000), name: "y".repeat(500) });
  assert.ok(anfrage.vorhaben.length <= 1500);
  assert.ok(anfrage.name.length <= 80);
});

test("die SMS nennt das Wichtigste zuerst", () => {
  const text = nachrichtText(pruefe(gut).anfrage);
  const zeilen = text.split("\n");
  assert.match(zeilen[0], /Neue Anfrage/);
  assert.ok(text.includes("Hans Meier"));
  assert.ok(text.includes("079 123 45 67"), "ohne Kontakt nützt die Meldung nichts");
  assert.ok(text.length < 1600, "muss in eine Nachricht passen");
});

test("derselbe Absender kommt nicht unbegrenzt oft", async () => {
  const speicher = fach();
  const jetzt = Date.now();
  for (let i = 0; i < PRO_STUNDE; i++) {
    assert.equal(await zuOft(speicher, "1-2-3-4", jetzt + i), false, `Versuch ${i + 1} sollte durch`);
  }
  assert.equal(await zuOft(speicher, "1-2-3-4", jetzt + PRO_STUNDE), true);
});

test("eine Stunde später geht es wieder", async () => {
  const speicher = fach();
  const jetzt = Date.now();
  for (let i = 0; i < PRO_STUNDE; i++) await zuOft(speicher, "5-6-7-8", jetzt + i);
  assert.equal(await zuOft(speicher, "5-6-7-8", jetzt + 3_600_001), false);
});

test("auch viele verschiedene Absender laufen gegen den Tagesdeckel", async () => {
  const speicher = fach();
  const jetzt = Date.now();
  let durch = 0;
  for (let i = 0; i < PRO_TAG + 5; i++) {
    if (!(await zuOft(speicher, `absender-${i}`, jetzt + i))) durch++;
  }
  assert.equal(durch, PRO_TAG);
});

test("ohne Speicher wird durchgelassen statt blockiert", async () => {
  assert.equal(await zuOft(null, "egal"), false);
});
