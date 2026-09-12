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
 * Zwei Kopien desselben Fotos werden daran erkannt, dass sie Byte für Byte
 * gleich sind: erst nach Größe gruppiert, dann von den gleich großen die
 * Prüfsumme gebildet. Gleicher Name allein genügt nicht — und ein Foto, das
 * einmal durch WhatsApp gelaufen ist, ist eine andere Datei und wird deshalb
 * bewusst nicht angefasst.
 *
 *   --papierkorb    überzählige Kopien und Müll in den Papierkorb verschieben
 *   --liste <datei> vollständigen Bericht in eine Textdatei schreiben
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";

/* ---------- Was als Müll gilt. Bewusst kurz und eindeutig. ---------- */

const MUELL_ORDNER = new Set([".thumbnails", ".thumbdata", "LOST.DIR"]);
const MUELL_ENDUNGEN = [".tmp", ".temp", ".crdownload", ".part", ".partial"];
const MUELL_NAMEN = new Set(["thumbs.db", ".ds_store", "desktop.ini"]);

/* Ordner, in denen eine Datei am ehesten „das Original" ist — je weiter vorn,
   desto lieber wird diese Kopie behalten. */
const RANGFOLGE = ["dcim/camera", "dcim", "pictures", "movies", "music", "documents", "download"];

/* Diese Pfade fasst das Skript nicht an, auch wenn man sie ihm nennt. */
const TABU = ["/", "/system", "/data", "/proc", "/dev", os.homedir()];

/* ---------- Hilfsmittel ---------- */

function groesse(bytes) {
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(2) + " GB";
  if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(1) + " MB";
  if (bytes >= 1024) return Math.round(bytes / 1024) + " KB";
  return bytes + " B";
}

function istMuell(datei) {
  const name = path.basename(datei).toLowerCase();
  if (MUELL_NAMEN.has(name)) return "Systemdatei";
  if (name.startsWith(".trashed-")) return "vom Handy gelöscht, nur noch Rest";
  if (MUELL_ENDUNGEN.some((e) => name.endsWith(e))) return "abgebrochener Download";
  return null;
}

function rang(datei) {
  const p = datei.toLowerCase().replace(/\\/g, "/");
  const treffer = RANGFOLGE.findIndex((ordner) => p.includes("/" + ordner + "/"));
  return treffer === -1 ? RANGFOLGE.length : treffer;
}

/** Welche Kopie bleibt: bester Ordner, dann die ältere, dann der kürzere Pfad. */
function besteKopie(a, b) {
  if (rang(a.pfad) !== rang(b.pfad)) return rang(a.pfad) - rang(b.pfad);
  if (a.zeit !== b.zeit) return a.zeit - b.zeit;
  return a.pfad.length - b.pfad.length;
}

function hash(datei) {
  return new Promise((fertig, fehler) => {
    const h = crypto.createHash("sha256");
    const strom = fs.createReadStream(datei);
    strom.on("data", (d) => h.update(d));
    strom.on("end", () => fertig(h.digest("hex")));
    strom.on("error", fehler);
  });
}

/* ---------- Einlesen ---------- */

/** Größe eines ganzen Ordners — für Caches, die als Block verschoben werden. */
async function ordnerGroesse(wurzel) {
  let summe = 0;
  let eintraege;
  try { eintraege = await fs.promises.readdir(wurzel, { withFileTypes: true }); } catch { return 0; }
  for (const e of eintraege) {
    const p = path.join(wurzel, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) { summe += await ordnerGroesse(p); continue; }
    try { summe += (await fs.promises.stat(p)).size; } catch { /* weg ist weg */ }
  }
  return summe;
}

async function einlesen(wurzel, gefunden, muell, uebersprungen) {
  let eintraege;
  try {
    eintraege = await fs.promises.readdir(wurzel, { withFileTypes: true });
  } catch {
    uebersprungen.push(wurzel + " (nicht lesbar)");
    return;
  }

  for (const eintrag of eintraege) {
    const pfad = path.join(wurzel, eintrag.name);
    if (eintrag.isSymbolicLink()) continue;                       // Verknüpfungen nie verfolgen
    if (eintrag.isDirectory()) {
      if (eintrag.name.startsWith("Papierkorb-")) continue;         // eigener Papierkorb, nicht nochmal einsammeln
      if (MUELL_ORDNER.has(eintrag.name)) {
        muell.push({ pfad, grund: "Vorschaubilder-Cache", groesse: await ordnerGroesse(pfad), ordner: true });
        continue;                                                   // nicht hineingehen, der ganze Ordner geht weg
      }
      await einlesen(pfad, gefunden, muell, uebersprungen);
      continue;
    }
    if (!eintrag.isFile()) continue;

    let stat;
    try { stat = await fs.promises.stat(pfad); } catch { continue; }

    const grund = istMuell(pfad);
    if (grund) { muell.push({ pfad, grund, groesse: stat.size }); continue; }
    if (stat.size === 0) { muell.push({ pfad, grund: "leere Datei", groesse: 0 }); continue; }

    gefunden.push({ pfad, groesse: stat.size, zeit: stat.mtimeMs });
  }
}

/* ---------- Doppelte finden ---------- */

async function doppelteFinden(dateien) {
  const nachGroesse = new Map();
  for (const d of dateien) {
    if (!nachGroesse.has(d.groesse)) nachGroesse.set(d.groesse, []);
    nachGroesse.get(d.groesse).push(d);
  }

  const gruppen = [];
  for (const [, kandidaten] of nachGroesse) {
    if (kandidaten.length < 2) continue;                          // allein kann nicht doppelt sein
    const nachHash = new Map();
    for (const d of kandidaten) {
      let summe;
      try { summe = await hash(d.pfad); } catch { continue; }
      if (!nachHash.has(summe)) nachHash.set(summe, []);
      nachHash.get(summe).push(d);
    }
    for (const [, gleiche] of nachHash) {
      if (gleiche.length < 2) continue;
      gleiche.sort(besteKopie);
      gruppen.push({ behalten: gleiche[0], ueberzaehlig: gleiche.slice(1), groesse: gleiche[0].groesse });
    }
  }
  gruppen.sort((a, b) => b.groesse * b.ueberzaehlig.length - a.groesse * a.ueberzaehlig.length);
  return gruppen;
}

/* ---------- Überblick nach Art ---------- */

const ARTEN = [
  ["Bilder", [".jpg", ".jpeg", ".png", ".heic", ".webp", ".gif", ".bmp", ".dng"]],
  ["Videos", [".mp4", ".mov", ".3gp", ".mkv", ".avi", ".webm"]],
  ["Ton", [".mp3", ".m4a", ".opus", ".ogg", ".wav", ".amr"]],
  ["Dokumente", [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".txt", ".odt", ".csv"]],
  ["Archive", [".zip", ".rar", ".7z", ".tar", ".gz", ".apk"]]
];

function art(datei) {
  const endung = path.extname(datei).toLowerCase();
  for (const [name, endungen] of ARTEN) if (endungen.includes(endung)) return name;
  return "Sonstiges";
}

/* ---------- Verschieben ---------- */

async function inPapierkorb(pfad, papierkorb) {
  const ziel = path.join(papierkorb, path.basename(path.dirname(pfad)), path.basename(pfad));
  await fs.promises.mkdir(path.dirname(ziel), { recursive: true });
  let endgueltig = ziel;
  let n = 1;
  while (fs.existsSync(endgueltig)) {
    const e = path.extname(ziel);
    endgueltig = ziel.slice(0, ziel.length - e.length) + "-" + n++ + e;
  }
  try {
    await fs.promises.rename(pfad, endgueltig);
  } catch {
    // Über Speichergrenzen hinweg geht rename nicht — dann kopieren und löschen.
    await fs.promises.cp(pfad, endgueltig, { recursive: true });
    await fs.promises.rm(pfad, { recursive: true });
  }
  return endgueltig;
}

/* ---------- Hauptlauf ---------- */

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
}

const dateien = [];
const muell = [];
const uebersprungen = [];

console.log("Lese ein …");
for (const o of ordner) await einlesen(path.resolve(o), dateien, muell, uebersprungen);

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

const stempel = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const papierkorb = path.resolve(ordner[0], "..", "Papierkorb-" + stempel);
await fs.promises.mkdir(papierkorb, { recursive: true });

let verschoben = 0;
let gespart = 0;
for (const g of gruppen) {
  for (const u of g.ueberzaehlig) {
    try { await inPapierkorb(u.pfad, papierkorb); verschoben++; gespart += u.groesse; }
    catch (e) { console.error(`  konnte nicht verschieben: ${u.pfad} (${e.message})`); }
  }
}
for (const m of muell) {
  try { await inPapierkorb(m.pfad, papierkorb); verschoben++; gespart += m.groesse; }
  catch (e) { console.error(`  konnte nicht verschieben: ${m.pfad} (${e.message})`); }
}

console.log(`\n${"═".repeat(52)}`);
console.log(`${verschoben} Dateien verschoben, ${groesse(gespart)} frei.`);
console.log(`Sie liegen jetzt hier: ${papierkorb}`);
console.log(`\nSieh in dem Ordner nach, ob wirklich nichts Wichtiges dabei ist.`);
console.log(`Passt es, kannst du ihn löschen — im Dateimanager oder mit:`);
console.log(`  rm -rf "${papierkorb}"`);
console.log(`Passt es nicht, schieb die Dateien einfach zurück.`);
