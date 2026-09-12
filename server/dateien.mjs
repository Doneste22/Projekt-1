/**
 * Dateilogik für Handyspeicher — was doppelt ist, was Müll ist, was in den
 * Papierkorb wandert.
 *
 * Wird von zwei Seiten benutzt, damit beide dasselbe tun:
 *   scripts/aufraeumen.mjs   das Werkzeug für die Kommandozeile
 *   server/werkzeuge.mjs     dieselbe Arbeit, aber von Jarvis aus aufgerufen
 *
 * Zwei Grundsätze stehen hier fest und gelten für beide Seiten:
 *
 *   Gelöscht wird nie. Es wird verschoben — in einen Papierkorb-Ordner mit
 *   Datum, aus dem sich alles zurückholen lässt.
 *
 *   Doppelt heißt Byte für Byte gleich. Erst wird nach Größe gruppiert, dann
 *   von den gleich großen die Prüfsumme gebildet. Gleicher Name genügt nicht.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";

/* ---------- Was als Müll gilt. Bewusst kurz und eindeutig. ---------- */

export const MUELL_ORDNER = new Set([".thumbnails", ".thumbdata", "LOST.DIR"]);
export const MUELL_ENDUNGEN = [".tmp", ".temp", ".crdownload", ".part", ".partial"];
export const MUELL_NAMEN = new Set(["thumbs.db", ".ds_store", "desktop.ini"]);

/* Ordner, in denen eine Datei am ehesten „das Original" ist — je weiter vorn,
   desto lieber wird diese Kopie behalten. */
export const RANGFOLGE = ["dcim/camera", "dcim", "pictures", "movies", "music", "documents", "download"];

/* Diese Pfade werden nicht angefasst, auch wenn man sie nennt. */
export const TABU = ["/", "/system", "/data", "/proc", "/dev", os.homedir()];

/* ---------- Hilfsmittel ---------- */

export function groesse(bytes) {
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(2) + " GB";
  if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(1) + " MB";
  if (bytes >= 1024) return Math.round(bytes / 1024) + " KB";
  return bytes + " B";
}

export function istMuell(datei) {
  const name = path.basename(datei).toLowerCase();
  if (MUELL_NAMEN.has(name)) return "Systemdatei";
  if (name.startsWith(".trashed-")) return "vom Handy gelöscht, nur noch Rest";
  if (MUELL_ENDUNGEN.some((e) => name.endsWith(e))) return "abgebrochener Download";
  return null;
}

export function rang(datei) {
  const p = datei.toLowerCase().replace(/\\/g, "/");
  const treffer = RANGFOLGE.findIndex((ordner) => p.includes("/" + ordner + "/"));
  return treffer === -1 ? RANGFOLGE.length : treffer;
}

/** Welche Kopie bleibt: bester Ordner, dann die ältere, dann der kürzere Pfad. */
export function besteKopie(a, b) {
  if (rang(a.pfad) !== rang(b.pfad)) return rang(a.pfad) - rang(b.pfad);
  if (a.zeit !== b.zeit) return a.zeit - b.zeit;
  return a.pfad.length - b.pfad.length;
}

export function hash(datei) {
  return new Promise((fertig, fehler) => {
    const h = crypto.createHash("sha256");
    const strom = fs.createReadStream(datei);
    strom.on("data", (d) => h.update(d));
    strom.on("end", () => fertig(h.digest("hex")));
    strom.on("error", fehler);
  });
}

/**
 * Prüft, ob ein Pfad innerhalb der erlaubten Wurzeln liegt. Ohne diese Prüfung
 * könnte ein Ordnername aus einer Antwort heraus irgendwohin zeigen — deshalb
 * wird jeder Pfad, der von außen kommt, hier hindurchgeschickt.
 */
export function sichererPfad(eingabe, wurzeln) {
  const voll = path.resolve(String(eingabe || "").replace(/^~(?=$|\/)/, os.homedir()));
  if (TABU.includes(voll)) return { fehler: `${voll} ist zu allgemein — nenn einen einzelnen Ordner.` };
  const erlaubt = wurzeln.some((w) => voll === w || voll.startsWith(w + path.sep));
  if (!erlaubt) return { fehler: `${voll} liegt außerhalb der freigegebenen Ordner (${wurzeln.join(", ")}).` };
  if (!fs.existsSync(voll)) return { fehler: `${voll} gibt es nicht.` };
  return { pfad: voll };
}

/* ---------- Einlesen ---------- */

/** Größe eines ganzen Ordners — für Caches, die als Block verschoben werden. */
export async function ordnerGroesse(wurzel) {
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

export async function einlesen(wurzel, gefunden, muell, uebersprungen) {
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
      if (eintrag.name.startsWith("Papierkorb-")) continue;       // eigener Papierkorb, nicht nochmal einsammeln
      if (MUELL_ORDNER.has(eintrag.name)) {
        muell.push({ pfad, grund: "Vorschaubilder-Cache", groesse: await ordnerGroesse(pfad), ordner: true });
        continue;                                                 // nicht hineingehen, der ganze Ordner geht weg
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

/** Bequemer Einstieg: mehrere Ordner einlesen und alles zusammen zurückgeben. */
export async function durchsehen(ordner) {
  const dateien = [];
  const muell = [];
  const uebersprungen = [];
  for (const o of ordner) await einlesen(o, dateien, muell, uebersprungen);
  return { dateien, muell, uebersprungen };
}

/* ---------- Doppelte finden ---------- */

export async function doppelteFinden(dateien) {
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

export const ARTEN = [
  ["Bilder", [".jpg", ".jpeg", ".png", ".heic", ".webp", ".gif", ".bmp", ".dng"]],
  ["Videos", [".mp4", ".mov", ".3gp", ".mkv", ".avi", ".webm"]],
  ["Ton", [".mp3", ".m4a", ".opus", ".ogg", ".wav", ".amr"]],
  ["Dokumente", [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".txt", ".odt", ".csv"]],
  ["Archive", [".zip", ".rar", ".7z", ".tar", ".gz", ".apk"]]
];

export function art(datei) {
  const endung = path.extname(datei).toLowerCase();
  for (const [name, endungen] of ARTEN) if (endungen.includes(endung)) return name;
  return "Sonstiges";
}

/* ---------- Verschieben ---------- */

export function papierkorbPfad(ordner) {
  const stempel = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return path.resolve(ordner, "..", "Papierkorb-" + stempel);
}

export async function inPapierkorb(pfad, papierkorb) {
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

/**
 * Räumt auf: verschiebt überzählige Kopien und Müll in einen Papierkorb.
 * Nimmt bewusst keine Dateiliste entgegen, sondern sucht selbst — so kann von
 * außen niemand bestimmen, welche Datei verschwindet.
 */
export async function aufraeumen(ordner, vorbefund) {
  // Wer schon gesucht hat, reicht das Ergebnis herein — sonst wird neu gesucht.
  let gruppen = vorbefund && vorbefund.gruppen;
  let muell = vorbefund && vorbefund.muell;
  if (!gruppen || !muell) {
    const durchsicht = await durchsehen(ordner);
    muell = durchsicht.muell;
    gruppen = await doppelteFinden(durchsicht.dateien);
  }
  const papierkorb = papierkorbPfad(ordner[0]);

  let verschoben = 0;
  let gespart = 0;
  const fehler = [];

  const verschiebe = async (pfad, bytes) => {
    try { await inPapierkorb(pfad, papierkorb); verschoben++; gespart += bytes; }
    catch (e) { fehler.push(`${pfad}: ${e.message}`); }
  };

  if (gruppen.length || muell.length) await fs.promises.mkdir(papierkorb, { recursive: true });
  for (const g of gruppen) for (const u of g.ueberzaehlig) await verschiebe(u.pfad, u.groesse);
  for (const m of muell) await verschiebe(m.pfad, m.groesse);

  return { verschoben, gespart, papierkorb, fehler };
}
