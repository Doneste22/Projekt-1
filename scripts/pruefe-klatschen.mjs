/**
 * Prüft die Klatsch-Erkennung aus jarvis/klatschen.js — ohne Mikrofon und
 * ohne dass jemand vor dem Rechner in die Hände klatschen muss.
 *
 *   node scripts/pruefe-klatschen.mjs
 *
 * Die Erkennung sieht nur Lautstärkewerte zwischen 0 und 1 samt Zeitstempel.
 * Genau die füttern wir hier von Hand: zwei Klatscher im richtigen Abstand,
 * zu früh, zu spät, Gerede, Dauerlärm. Das ist der ganze Trick daran, dass die
 * Logik überhaupt prüfbar ist.
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Die Datei ist ein gewöhnliches Browser-Skript. Wir geben ihr das Minimum an
// Umgebung, das sie zum Laden braucht, und holen uns die Erkennung heraus.
const kontext = { window: {}, navigator: {}, setInterval: () => 0, clearInterval: () => {}, Date };
vm.createContext(kontext);
vm.runInContext(fs.readFileSync(path.join(WURZEL, "jarvis/klatschen.js"), "utf8"), kontext);
const { erkenner } = kontext.window.Klatschen;

let fehler = 0;
function pruefe(name, folge, erwartet) {
  const e = erkenner();
  let treffer = 0;
  for (const [wert, zeit] of folge) if (e.pegel(wert, zeit)) treffer++;
  const ok = treffer === erwartet;
  if (!ok) fehler++;
  console.log(`${ok ? "ok  " : "FEHL"}  ${name}: ${treffer} Treffer, erwartet ${erwartet}`);
}

/** Ein Klatscher: kurzer Ausschlag, dann sofort wieder still. */
const knall = (t) => [[0.6, t], [0.2, t + 25], [0.02, t + 50], [0.02, t + 75]];
const still = (von, bis) => {
  const werte = [];
  for (let t = von; t < bis; t += 25) werte.push([0.02, t]);
  return werte;
};

pruefe("zwei Klatscher im richtigen Abstand", [...knall(0), ...still(100, 300), ...knall(300)], 1);
pruefe("nur ein Klatscher", [...knall(0), ...still(100, 2000)], 0);
pruefe("zweiter Klatscher zu spät", [...knall(0), ...still(100, 1500), ...knall(1500)], 0);
pruefe("zweiter Klatscher zu früh", [...knall(0), [0.6, 60], ...still(100, 900)], 0);
pruefe("Gerede: laut, aber nie leise dazwischen",
  Array.from({ length: 200 }, (_, i) => [0.18 + (i % 5) * 0.03, i * 25]), 0);
pruefe("drei Klatscher zählen einmal, nicht zweimal",
  [...knall(0), ...still(100, 300), ...knall(300), ...still(400, 700), ...knall(700)], 1);
pruefe("zweimal klatschen, Pause, nochmal zweimal",
  [...knall(0), ...still(100, 300), ...knall(300), ...still(400, 2600),
   ...knall(2600), ...still(2700, 2900), ...knall(2900)], 2);
pruefe("Dauerlärm auf Anschlag", Array.from({ length: 200 }, (_, i) => [0.9, i * 25]), 0);

console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen` : "\nAlle Prüfungen bestanden");
process.exit(fehler ? 1 : 0);
