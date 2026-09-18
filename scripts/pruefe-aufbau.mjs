/**
 * Prüft die beiden Schichten, die zwischen Frage und Antwort liegen — ohne
 * Browser, ohne Netz, ohne einen Rappen Kosten:
 *
 *   node scripts/pruefe-aufbau.mjs
 *
 *   Die Weiche      (jarvis/abteilungen.js) sieht nur Text und entscheidet,
 *                   welche Abteilung zuständig ist. Also füttern wir sie mit
 *                   Sätzen, wie Damaso sie tippt, und sehen nach, wo sie
 *                   landen — und wo sie ehrlich „weiss nicht“ sagt, damit das
 *                   billige Modell übernimmt.
 *   Das Gedächtnis  (jarvis/gedaechtnis.js) sieht nur Notizen und eine Frage.
 *                   Geprüft wird, dass die passenden mitgehen, dass ein Faden
 *                   über die Marken trägt und dass nichts doppelt abgelegt wird.
 *
 * Beide Dateien sind gewöhnliche Browser-Skripte. Sie bekommen hier das
 * Minimum an Umgebung, das sie zum Laden brauchen — ein `window` und einen
 * Speicher, der sich wie localStorage verhält.
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** localStorage, klein nachgebaut. */
const ablage = new Map();
const localStorage = {
  getItem: (k) => (ablage.has(k) ? ablage.get(k) : null),
  setItem: (k, v) => ablage.set(k, String(v)),
  removeItem: (k) => ablage.delete(k)
};

const kontext = { window: {}, localStorage, Date, Math, JSON, console };
vm.createContext(kontext);
for (const datei of ["jarvis/abteilungen.js", "jarvis/gedaechtnis.js"]) {
  vm.runInContext(fs.readFileSync(path.join(WURZEL, datei), "utf8"), kontext);
}
const { Abteilungen, Gedaechtnis } = kontext.window;

Abteilungen.laden(JSON.parse(fs.readFileSync(path.join(WURZEL, "jarvis/abteilungen.json"), "utf8")));

let fehler = 0;
function pruefe(name, bedingung, gesehen) {
  if (!bedingung) fehler++;
  console.log(`${bedingung ? "ok  " : "FEHL"}  ${name}${bedingung ? "" : `  — gesehen: ${gesehen}`}`);
}

/* ---------- Die Weiche ---------- */

console.log("\nDie Weiche");

const weichenfaelle = [
  ["Wie dick spachtle ich für Q3?", "baustelle"],
  ["Was für Profile nehme ich für eine Vorsatzschale?", "baustelle"],
  ["Die Decke hallt wie eine Turnhalle, was hilft?", "baustelle"],
  ["Schreib mir eine Offerte über 40 Quadratmeter", "angebot"],
  ["Mein Stundensatz ist zu tief, oder?", "angebot"],
  ["Mein Speicher ist voll, was liegt da rum?", "buero"],
  ["Sind die Fotos doppelt drauf?", "buero"],
  ["Was brauche ich für die NIE-Nummer in Spanien?", "galicien"],
  ["Wie ist das Wetter in Galicien im November?", "galicien"]
];
for (const [satz, erwartet] of weichenfaelle) {
  const ergebnis = Abteilungen.weiche(satz);
  pruefe(`„${satz}" → ${erwartet}`, ergebnis.sicher && ergebnis.abteilung === erwartet,
    `${ergebnis.abteilung} (${ergebnis.sicher ? "sicher" : "unsicher"})`);
}

/* Umlaute dürfen nicht entscheiden: „Dämmung" und „Daemmung" sind dasselbe. */
pruefe("Umlaut oder nicht, dieselbe Abteilung",
  Abteilungen.weiche("Welche Daemmung?").abteilung === Abteilungen.weiche("Welche Dämmung?").abteilung,
  Abteilungen.weiche("Welche Daemmung?").abteilung);

/* Wortanfang genügt — „gips" muss „Gipskartonplatten" treffen. */
pruefe("Wortanfang genügt", Abteilungen.weiche("Gipskartonplatten bestellen").abteilung === "baustelle");

/* Und wo nichts trifft, wird ehrlich „unsicher" gemeldet, statt zu raten. */
for (const satz of ["Wie geht es dir?", "Erzähl mir einen Witz", "Was denkst du darüber?"]) {
  pruefe(`„${satz}" → unsicher, das Modell übernimmt`, !Abteilungen.weiche(satz).sicher);
}

/* Was das Modell zurückschreibt, wird nie blind übernommen. */
pruefe("Modellantwort „buero“ wird gelesen", Abteilungen.lesen("buero") === "buero");
pruefe("Geschwätzige Modellantwort wird gelesen", Abteilungen.lesen("Das gehört wohl in die Abteilung Angebot.") === "angebot");
pruefe("Erfundene Abteilung fällt auf den Standard zurück", Abteilungen.lesen("marketing-abteilung") === "alltag");

/* ---------- Das Gedächtnis ---------- */

console.log("\nDas Gedächtnis");

Gedaechtnis.leeren();
Gedaechtnis.merken("Damaso rechnet mit 85 Franken Stundenansatz.", { marken: ["preis"], abteilung: "angebot" });
Gedaechtnis.merken("Kunde Meier in Horgen zahlt regelmässig zu spät.", { marken: ["preis", "kunde"], abteilung: "angebot" });
Gedaechtnis.merken("Damaso arbeitet am liebsten mit Knauf-Platten.", { marken: ["material"], abteilung: "baustelle" });
Gedaechtnis.merken("Der Transporter hat im März Service.", { marken: ["fahrzeug"], abteilung: "alltag" });

pruefe("vier Notizen angelegt", Gedaechtnis.alle().length === 4, Gedaechtnis.alle().length);

Gedaechtnis.merken("Damaso rechnet mit 85 Franken Stundenansatz.", { marken: ["ansatz"] });
pruefe("dieselbe Notiz zweimal bleibt eine", Gedaechtnis.alle().length === 4, Gedaechtnis.alle().length);

const zumPreis = Gedaechtnis.passende("Was soll ich für den Stundenansatz verlangen?", "angebot");
pruefe("zur Preisfrage kommt der Stundenansatz mit",
  zumPreis.some((n) => n.text.includes("85 Franken")), zumPreis.map((n) => n.text).join(" | "));

/* Der Faden: „Meier" steht in keiner Preis-Frage, hängt aber über die Marke
   #preis am Treffer — und kommt deshalb mit. */
pruefe("über die Marke kommt der Kunde mit",
  zumPreis.some((n) => n.text.includes("Meier")), zumPreis.map((n) => n.text).join(" | "));

const zumMaterial = Gedaechtnis.passende("Welche Platten nimmst du?", "baustelle");
pruefe("zur Materialfrage kommt Knauf mit",
  zumMaterial.some((n) => n.text.includes("Knauf")), zumMaterial.map((n) => n.text).join(" | "));
pruefe("und der Transporter bleibt draussen",
  !zumMaterial.some((n) => n.text.includes("Transporter")), zumMaterial.map((n) => n.text).join(" | "));

pruefe("nie mehr als die vereinbarte Zahl auf einmal",
  Gedaechtnis.passende("Damaso Franken Knauf Meier Transporter Service Horgen Platten", "alltag").length <= Gedaechtnis.MITGEBEN);

/* Was das Modell als Merkzettel zurückschreibt. */
Gedaechtnis.leeren();
const aufgenommen = Gedaechtnis.aufnehmen(
  "- Damaso hat am 3. Mai eine Baustelle in Wädenswil. #termin #baustelle\n" +
  "- Er bestellt Material bei Bauhaus. #material\n" +
  "- zu kurz\n", "baustelle");
pruefe("zwei brauchbare Zeilen aufgenommen, die dritte verworfen", aufgenommen.length === 2, aufgenommen.length);
pruefe("die Marken sind von der Notiz getrennt",
  aufgenommen[0].marken.join(",") === "termin,baustelle" && !aufgenommen[0].text.includes("#"),
  `${aufgenommen[0].marken}  |  ${aufgenommen[0].text}`);

Gedaechtnis.leeren();
pruefe("„nichts“ legt nichts an", Gedaechtnis.aufnehmen("nichts", "alltag").length === 0);

console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen.` : "\nAlles in Ordnung.");
process.exit(fehler ? 1 : 0);
