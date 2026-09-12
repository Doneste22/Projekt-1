/**
 * Aufräumen — findet doppelte Dateien und Müll im Handyspeicher.
 *
 * Läuft in Termux auf dem Handy (oder auf jedem Rechner mit Node). Braucht
 * keine Pakete.
 *
 *   node scripts/aufraeumen.mjs ~/storage/shared/DCIM ~/storage/shared/Download
 *
 * Standardmäßig wird nur gezeigt, nie gelöscht. Erst mit --papierkorb werden
 * die überzähligen Kopien verschoben — und zwar in einen Papierkorb-Ordner mit
 * Datum, nicht ins Nichts. Solange der Ordner existiert, ist jeder Schritt
 * zurückzuholen. Wirklich gelöscht wird nur, was du selbst löschst.
 *
 * Die eigentliche Arbeit steht in ../server/dateien.mjs — damit dieses Skript
 * und die Werkzeuge, die Jarvis benutzt, garantiert dasselbe tun.
 *
 *   --papierkorb    überzählige Kopien und Müll in den Papierkorb verschieben
 *   --liste <datei> vollständigen Bericht in eine Textdatei schreiben
 */

import fs from "node:fs";
import path from "node:path";
import {
  TABU, art, aufraeumen, doppelteFinden, durchsehen, groesse
} from "../server/dateien.mjs";

const argumente = process.argv.slice(2);
const verschieben = argumente.includes("--papierkorb");
const listeIndex = argumente.indexOf("--liste");
const listenDatei = listeIndex !== -1 ? argumente[listeIndex + 1] : null;
// Ohne --liste ist listeIndex -1; dann darf kein Argument wegfallen.
const ordner = argumente.filter((a, i) => !a.startsWith("--") && !(listeIndex !== -1 && i === listeIndex + 1));

if (!ordner.length) {
  console.log(`Aufräumen — findet doppelte Dateien und Müll.

  node scripts/aufraeumen.mjs <ordner> [weitere ordner] [--papierkorb] [--liste bericht.txt]

Auf dem Handy in Termux, nach einmaligem "termux-setup-storage":

  node scripts/aufraeumen.mjs ~/storage/shared/DCIM ~/storage/shared/Download

Ohne --papierkorb wird nur gezeigt, nichts angefasst.`);
  process.exit(0);
}

const wurzeln = [];
for (const o of ordner) {
  const voll = path.resolve(o);
  if (TABU.includes(voll)) {
    console.error(`Abbruch: ${voll} ist zu allgemein. Nenn einzelne Ordner wie DCIM oder Download.`);
    process.exit(1);
  }
  if (!fs.existsSync(voll)) {
    console.error(`Abbruch: ${voll} gibt es nicht.`);
    process.exit(1);
  }
  wurzeln.push(voll);
}

console.log("Lese ein …");
const { dateien, muell, uebersprungen } = await durchsehen(wurzeln);

const gesamt = dateien.reduce((s, d) => s + d.groesse, 0);
console.log(`\n${dateien.length} Dateien, ${groesse(gesamt)}.\n`);

/* Überblick */
const nachArt = new Map();
for (const d of dateien) {
  const a = art(d.pfad);
  const stand = nachArt.get(a) || { anzahl: 0, bytes: 0 };
  stand.anzahl++;
  stand.bytes += d.groesse;
  nachArt.set(a, stand);
}
console.log("Was da liegt");
console.log("────────────");
[...nachArt.entries()].sort((a, b) => b[1].bytes - a[1].bytes).forEach(([a, s]) => {
  console.log(`  ${a.padEnd(12)} ${String(s.anzahl).padStart(6)} Stück   ${groesse(s.bytes).padStart(10)}`);
});

/* Doppelte */
console.log("\nDoppelte suchen …");
const gruppen = await doppelteFinden(dateien);
const doppeltBytes = gruppen.reduce((s, g) => s + g.groesse * g.ueberzaehlig.length, 0);
const doppeltAnzahl = gruppen.reduce((s, g) => s + g.ueberzaehlig.length, 0);

console.log(`\nDoppelt vorhanden`);
console.log("─────────────────");
if (!gruppen.length) {
  console.log("  Nichts gefunden — keine Datei liegt zweimal Byte für Byte gleich herum.");
} else {
  console.log(`  ${doppeltAnzahl} überzählige Kopien, ${groesse(doppeltBytes)} zu holen.\n`);
  gruppen.slice(0, 15).forEach((g) => {
    console.log(`  ${groesse(g.groesse).padStart(9)} × ${g.ueberzaehlig.length}   ${path.basename(g.behalten.pfad)}`);
    console.log(`            bleibt:  ${g.behalten.pfad}`);
    g.ueberzaehlig.forEach((u) => console.log(`            geht:    ${u.pfad}`));
  });
  if (gruppen.length > 15) console.log(`  … und ${gruppen.length - 15} weitere Gruppen (siehe --liste).`);
}

/* Müll */
const muellBytes = muell.reduce((s, m) => s + m.groesse, 0);
console.log(`\nMüll`);
console.log("────");
if (!muell.length) {
  console.log("  Nichts gefunden.");
} else {
  const nachGrund = new Map();
  muell.forEach((m) => {
    const stand = nachGrund.get(m.grund) || { anzahl: 0, bytes: 0 };
    stand.anzahl++; stand.bytes += m.groesse;
    nachGrund.set(m.grund, stand);
  });
  [...nachGrund.entries()].forEach(([grund, s]) => {
    console.log(`  ${String(s.anzahl).padStart(4)} × ${grund.padEnd(32)} ${groesse(s.bytes).padStart(10)}`);
  });
}

/* Die größten Brocken — nur als Hinweis, nichts wird daran gemacht */
const groesste = [...dateien].sort((a, b) => b.groesse - a.groesse).slice(0, 8);
if (groesste.length) {
  console.log(`\nDie größten Einzeldateien (nur zur Ansicht)`);
  console.log("──────────────────────────────────────────");
  groesste.forEach((d) => console.log(`  ${groesse(d.groesse).padStart(9)}   ${d.pfad}`));
}

if (uebersprungen.length) {
  console.log(`\nÜbersprungen: ${uebersprungen.length} Ordner ohne Leserecht.`);
}

/* Bericht schreiben */
if (listenDatei) {
  const zeilen = [];
  zeilen.push(`Aufräum-Bericht, ${new Date().toLocaleString("de-CH")}`);
  zeilen.push(`Ordner: ${ordner.join(", ")}`);
  zeilen.push(`${dateien.length} Dateien, ${groesse(gesamt)}`, "");
  zeilen.push("DOPPELTE");
  gruppen.forEach((g) => {
    zeilen.push(`  ${groesse(g.groesse)} × ${g.ueberzaehlig.length}`);
    zeilen.push(`    bleibt: ${g.behalten.pfad}`);
    g.ueberzaehlig.forEach((u) => zeilen.push(`    geht:   ${u.pfad}`));
  });
  zeilen.push("", "MÜLL");
  muell.forEach((m) => zeilen.push(`  ${m.grund.padEnd(34)} ${m.pfad}`));
  await fs.promises.writeFile(listenDatei, zeilen.join("\n") + "\n", "utf8");
  console.log(`\nBericht geschrieben: ${listenDatei}`);
}

/* Verschieben */
const zuHolen = doppeltBytes + muellBytes;
if (!verschieben) {
  console.log(`\n${"═".repeat(52)}`);
  if (zuHolen > 0) {
    console.log(`Zu holen: ${groesse(zuHolen)}. Es wurde nichts angefasst.`);
    console.log(`Wenn das so stimmt, denselben Befehl nochmal mit --papierkorb:`);
    console.log(`  node ${path.relative(process.cwd(), process.argv[1]) || process.argv[1]} ${ordner.join(" ")} --papierkorb`);
  } else {
    console.log("Nichts zu tun — hier ist alles in Ordnung.");
  }
  process.exit(0);
}

if (zuHolen === 0) {
  console.log("\nNichts zu verschieben.");
  process.exit(0);
}

// Der Befund von oben wird weitergereicht, damit nicht ein zweites Mal
// durch den ganzen Speicher gelesen und gerechnet wird.
const ergebnis = await aufraeumen(wurzeln, { gruppen, muell });
ergebnis.fehler.forEach((f) => console.error(`  konnte nicht verschieben: ${f}`));

console.log(`\n${"═".repeat(52)}`);
console.log(`${ergebnis.verschoben} Dateien verschoben, ${groesse(ergebnis.gespart)} frei.`);
console.log(`Sie liegen jetzt hier: ${ergebnis.papierkorb}`);
console.log(`\nSieh in dem Ordner nach, ob wirklich nichts Wichtiges dabei ist.`);
console.log(`Passt es, kannst du ihn löschen — im Dateimanager oder mit:`);
console.log(`  rm -rf "${ergebnis.papierkorb}"`);
console.log(`Passt es nicht, schieb die Dateien einfach zurück.`);
