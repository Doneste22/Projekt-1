/**
 * Werkzeuge für Jarvis — nur im lokalen Server (Termux, PC).
 *
 * Damit kann Jarvis den Speicher des Geräts ansehen und aufräumen, auf dem er
 * läuft. Die Netz-Fassung bekommt diese Werkzeuge nicht: die läuft in einem
 * fremden Rechenzentrum und hat dort nichts anzufassen.
 *
 * Drei Regeln, die das Ganze ungefährlich machen:
 *
 *   1. Gelöscht wird nie, nur in einen Papierkorb mit Datum verschoben.
 *   2. Jeder Pfad wird gegen die freigegebenen Ordner geprüft (JARVIS_ORDNER).
 *      Was außerhalb liegt, wird abgelehnt — auch wenn es im Gespräch steht.
 *   3. Das Werkzeug zum Aufräumen nimmt *keine* Dateiliste entgegen. Es sucht
 *      selbst nach Byte-gleichen Doppelten und eindeutigem Müll. Niemand kann
 *      ihm also eine bestimmte Datei unterschieben — auch kein Dateiname, der
 *      wie eine Anweisung aussieht.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  art, aufraeumen, doppelteFinden, durchsehen, groesse, sichererPfad
} from "./dateien.mjs";

/** Welche Ordner Jarvis überhaupt sehen darf. */
export function wurzeln() {
  const gesetzt = (process.env.JARVIS_ORDNER || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => path.resolve(s.replace(/^~(?=$|\/)/, os.homedir())));
  if (gesetzt.length) return gesetzt.filter((p) => fs.existsSync(p));

  const standard = path.join(os.homedir(), "storage", "shared");   // Termux
  return fs.existsSync(standard) ? [standard] : [];
}

function datum(ms) {
  return new Date(ms).toLocaleDateString("de-CH", { year: "numeric", month: "2-digit", day: "2-digit" });
}

/**
 * Kürzt einen Pfad auf das, was man zum Wiedererkennen braucht — relativ zum
 * *übergeordneten* Ordner der Wurzel, damit „DCIM/Camera/IMG_1.jpg“ und
 * „Download/IMG_1.jpg“ unterscheidbar bleiben.
 */
function kurz(pfad) {
  const w = wurzeln().find((r) => pfad === r || pfad.startsWith(r + path.sep));
  if (!w) return pfad;
  const relativ = path.relative(path.dirname(w), pfad);
  return relativ || path.basename(w);
}

/** Prüft die Ordnerangabe eines Werkzeugs: keine Angabe heißt „alle freigegebenen". */
function ordnerAuswaehlen(eingabe) {
  const erlaubt = wurzeln();
  if (!erlaubt.length) {
    return { fehler: "Es ist kein Ordner freigegeben. In der Umgebung JARVIS_ORDNER setzen, z. B. ~/storage/shared." };
  }
  if (!eingabe) return { ordner: erlaubt };
  const geprueft = sichererPfad(eingabe, erlaubt);
  return geprueft.fehler ? { fehler: geprueft.fehler } : { ordner: [geprueft.pfad] };
}

/* ---------- Die Werkzeuge, wie das Modell sie sieht ---------- */

export const WERKZEUGE = [
  {
    name: "speicher_uebersicht",
    description:
      "Zeigt, wie voll der Speicher des Geräts ist und was in den freigegebenen Ordnern liegt — " +
      "Anzahl und Größe nach Art (Bilder, Videos, Ton, Dokumente). Benutze das bei Fragen wie " +
      "„wie voll ist mein Speicher“ oder „was liegt bei mir herum“.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ordner_lesen",
    description:
      "Listet Dateien eines Ordners mit Größe und Datum. Gut für „zeig mir die größten Videos“ " +
      "oder „was liegt in Download“.",
    input_schema: {
      type: "object",
      properties: {
        ordner: { type: "string", description: "Pfad des Ordners. Ohne Angabe werden alle freigegebenen Ordner gelesen." },
        sortieren_nach: { type: "string", enum: ["groesse", "datum", "name"], description: "Standard: groesse" },
        anzahl: { type: "integer", description: "Wie viele Einträge, höchstens 100. Standard 20." }
      },
      required: []
    }
  },
  {
    name: "dateien_suchen",
    description:
      "Sucht Dateien, deren Name den gesuchten Text enthält — etwa „Rechnung“, „WA0“ oder „.pdf“.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Teil des Dateinamens" },
        ordner: { type: "string", description: "Ordner, in dem gesucht wird. Ohne Angabe alle freigegebenen." }
      },
      required: ["text"]
    }
  },
  {
    name: "aufraeumen_pruefen",
    description:
      "Sucht Byte-gleiche Doppelte und eindeutigen Müll (leere Dateien, abgebrochene Downloads, " +
      "Vorschaubild-Caches) und sagt, wie viel Platz das Aufräumen brächte. Verschiebt nichts. " +
      "Rufe das immer zuerst auf und zeig Damaso das Ergebnis, bevor du etwas verschiebst.",
    input_schema: {
      type: "object",
      properties: { ordner: { type: "string", description: "Ordner. Ohne Angabe alle freigegebenen." } },
      required: []
    }
  },
  {
    name: "aufraeumen_ausfuehren",
    description:
      "Verschiebt die überzähligen Kopien und den Müll in einen Papierkorb-Ordner mit Datum. " +
      "Löscht nichts — alles bleibt zurückholbar, bis Damaso den Papierkorb selbst leert. " +
      "Von jeder Gruppe bleibt immer eine Kopie stehen. Rufe das nur auf, wenn Damaso in dieser " +
      "Unterhaltung ausdrücklich darum gebeten hat.",
    input_schema: {
      type: "object",
      properties: { ordner: { type: "string", description: "Ordner. Ohne Angabe alle freigegebenen." } },
      required: []
    }
  }
];

/* ---------- Ausführung ---------- */

async function speicherUebersicht() {
  const erlaubt = wurzeln();
  if (!erlaubt.length) return { text: "Es ist kein Ordner freigegeben (JARVIS_ORDNER).", ui: "kein Ordner freigegeben" };

  const zeilen = [];
  try {
    const s = await fs.promises.statfs(erlaubt[0]);
    const gesamt = s.blocks * s.bsize;
    const frei = s.bavail * s.bsize;
    zeilen.push(`Speicher gesamt ${groesse(gesamt)}, davon frei ${groesse(frei)} (${Math.round((frei / gesamt) * 100)} %).`);
  } catch {
    zeilen.push("Die Gesamtgröße des Speichers konnte das System nicht melden.");
  }

  const { dateien, uebersprungen } = await durchsehen(erlaubt);
  const gesamtBytes = dateien.reduce((s, d) => s + d.groesse, 0);
  zeilen.push(`In den freigegebenen Ordnern: ${dateien.length} Dateien, ${groesse(gesamtBytes)}.`);

  const nachArt = new Map();
  for (const d of dateien) {
    const a = art(d.pfad);
    const stand = nachArt.get(a) || { anzahl: 0, bytes: 0 };
    stand.anzahl++; stand.bytes += d.groesse;
    nachArt.set(a, stand);
  }
  [...nachArt.entries()].sort((a, b) => b[1].bytes - a[1].bytes)
    .forEach(([a, s]) => zeilen.push(`  ${a}: ${s.anzahl} Stück, ${groesse(s.bytes)}`));

  if (uebersprungen.length) zeilen.push(`${uebersprungen.length} Ordner ohne Leserecht übersprungen.`);
  return { text: zeilen.join("\n"), ui: `Speicher angesehen — ${dateien.length} Dateien, ${groesse(gesamtBytes)}` };
}

async function ordnerLesen(eingabe) {
  const wahl = ordnerAuswaehlen(eingabe.ordner);
  if (wahl.fehler) return { text: wahl.fehler, ui: "Ordner nicht lesbar" };

  const anzahl = Math.min(Math.max(Number(eingabe.anzahl) || 20, 1), 100);
  const sortierung = eingabe.sortieren_nach || "groesse";
  const { dateien } = await durchsehen(wahl.ordner);

  const sortiert = [...dateien].sort((a, b) => {
    if (sortierung === "datum") return b.zeit - a.zeit;
    if (sortierung === "name") return a.pfad.localeCompare(b.pfad, "de");
    return b.groesse - a.groesse;
  }).slice(0, anzahl);

  if (!sortiert.length) return { text: "Der Ordner ist leer.", ui: "Ordner ist leer" };

  const zeilen = sortiert.map((d) => `  ${groesse(d.groesse).padStart(9)}  ${datum(d.zeit)}  ${kurz(d.pfad)}`);
  const text = `${dateien.length} Dateien insgesamt, hier die ${sortiert.length} nach ${sortierung}:\n` + zeilen.join("\n");
  return { text, ui: `${kurz(wahl.ordner[0])} gelesen — ${dateien.length} Dateien` };
}

async function dateienSuchen(eingabe) {
  const wahl = ordnerAuswaehlen(eingabe.ordner);
  if (wahl.fehler) return { text: wahl.fehler, ui: "Ordner nicht lesbar" };

  const suche = String(eingabe.text || "").toLowerCase();
  if (!suche) return { text: "Kein Suchtext angegeben.", ui: "nichts gesucht" };

  const { dateien } = await durchsehen(wahl.ordner);
  const treffer = dateien.filter((d) => path.basename(d.pfad).toLowerCase().includes(suche));
  treffer.sort((a, b) => b.zeit - a.zeit);

  if (!treffer.length) return { text: `Nichts gefunden, das „${eingabe.text}“ im Namen hat.`, ui: `„${eingabe.text}“ — nichts gefunden` };

  const zeilen = treffer.slice(0, 50).map((d) => `  ${groesse(d.groesse).padStart(9)}  ${datum(d.zeit)}  ${kurz(d.pfad)}`);
  const rest = treffer.length > 50 ? `\n… und ${treffer.length - 50} weitere.` : "";
  return {
    text: `${treffer.length} Treffer für „${eingabe.text}“:\n` + zeilen.join("\n") + rest,
    ui: `„${eingabe.text}“ — ${treffer.length} Treffer`
  };
}

async function aufraeumenPruefen(eingabe) {
  const wahl = ordnerAuswaehlen(eingabe.ordner);
  if (wahl.fehler) return { text: wahl.fehler, ui: "Ordner nicht lesbar" };

  const { dateien, muell } = await durchsehen(wahl.ordner);
  const gruppen = await doppelteFinden(dateien);
  const doppeltBytes = gruppen.reduce((s, g) => s + g.groesse * g.ueberzaehlig.length, 0);
  const doppeltAnzahl = gruppen.reduce((s, g) => s + g.ueberzaehlig.length, 0);
  const muellBytes = muell.reduce((s, m) => s + m.groesse, 0);

  if (!doppeltAnzahl && !muell.length) {
    return { text: "Nichts zu holen — keine Doppelten, kein Müll.", ui: "geprüft — nichts zu holen" };
  }

  const zeilen = [`${doppeltAnzahl} überzählige Kopien (${groesse(doppeltBytes)}) und ${muell.length} Müll-Dateien (${groesse(muellBytes)}).`];
  zeilen.push(`Zusammen ${groesse(doppeltBytes + muellBytes)}.`);
  if (gruppen.length) {
    zeilen.push("Die größten Gruppen:");
    gruppen.slice(0, 8).forEach((g) => {
      zeilen.push(`  ${groesse(g.groesse)} × ${g.ueberzaehlig.length} — bleibt: ${kurz(g.behalten.pfad)}`);
      g.ueberzaehlig.slice(0, 3).forEach((u) => zeilen.push(`      ginge: ${kurz(u.pfad)}`));
    });
  }
  if (muell.length) {
    const grunde = new Map();
    muell.forEach((m) => grunde.set(m.grund, (grunde.get(m.grund) || 0) + 1));
    zeilen.push("Müll: " + [...grunde.entries()].map(([g, n]) => `${n} × ${g}`).join(", "));
  }
  zeilen.push("Verschoben wurde noch nichts.");
  return { text: zeilen.join("\n"), ui: `geprüft — ${groesse(doppeltBytes + muellBytes)} zu holen` };
}

async function aufraeumenAusfuehren(eingabe) {
  const wahl = ordnerAuswaehlen(eingabe.ordner);
  if (wahl.fehler) return { text: wahl.fehler, ui: "Ordner nicht lesbar" };

  const ergebnis = await aufraeumen(wahl.ordner);
  if (!ergebnis.verschoben) {
    return { text: "Es gab nichts zu verschieben.", ui: "nichts zu verschieben" };
  }
  const zeilen = [
    `${ergebnis.verschoben} Dateien verschoben, ${groesse(ergebnis.gespart)} frei.`,
    `Sie liegen im Papierkorb: ${ergebnis.papierkorb}`,
    "Gelöscht ist nichts — Damaso kann alles zurückschieben oder den Ordner wegwerfen."
  ];
  if (ergebnis.fehler.length) zeilen.push(`${ergebnis.fehler.length} Dateien ließen sich nicht verschieben.`);
  return { text: zeilen.join("\n"), ui: `${ergebnis.verschoben} Dateien in den Papierkorb, ${groesse(ergebnis.gespart)} frei` };
}

const AUSFUEHRUNG = {
  speicher_uebersicht: speicherUebersicht,
  ordner_lesen: ordnerLesen,
  dateien_suchen: dateienSuchen,
  aufraeumen_pruefen: aufraeumenPruefen,
  aufraeumen_ausfuehren: aufraeumenAusfuehren
};

/** Führt ein Werkzeug aus. Fehler werden zu Text — das Modell soll weiterreden können. */
export async function ausfuehren(name, eingabe) {
  const werkzeug = AUSFUEHRUNG[name];
  if (!werkzeug) return { text: `Das Werkzeug „${name}“ gibt es nicht.`, ui: `unbekanntes Werkzeug: ${name}`, fehler: true };
  try {
    return await werkzeug(eingabe || {});
  } catch (e) {
    console.error("werkzeug:", name, e);
    return { text: `Das Werkzeug „${name}“ ist gescheitert: ${e.message}`, ui: `${name} gescheitert`, fehler: true };
  }
}
