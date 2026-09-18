/**
 * Die Abteilungen von Jarvis — Serverseite.
 *
 * Gedanke dahinter: ein Assistent, der alles gleich behandelt, antwortet auf
 * alles gleich mittelmässig. Also bekommt jede Art von Frage einen eigenen
 * Arbeitsplatz — eigener Kontext im Systemprompt, eigene Werkzeuge. Welche
 * Abteilung dran ist, entscheidet die Weiche im Browser (jarvis/abteilungen.js);
 * hierher kommt nur noch ihr Name.
 *
 * Und genau deshalb wird der Name geprüft und nicht geglaubt: Kontext und
 * Werkzeugliste stehen in jarvis/abteilungen.json auf dem Server. Wer die
 * Adresse kennt, kann sich damit keinen eigenen Prompt und keine eigenen
 * Werkzeuge bestellen — nur zwischen den eingetragenen Abteilungen wählen.
 */

import datei from "../jarvis/abteilungen.json" with { type: "json" };

export const ABTEILUNGEN = datei.abteilungen || {};
export const STANDARD = ABTEILUNGEN[datei.standard] ? datei.standard : Object.keys(ABTEILUNGEN)[0] || "alltag";

/** Gibt es die Abteilung? Sonst die Standardabteilung. */
export function abteilungWaehlen(name) {
  return Object.prototype.hasOwnProperty.call(ABTEILUNGEN, name) ? name : STANDARD;
}

/** Der Kontext, der in den Systemprompt wandert. Leer heisst: kein Zusatz. */
export function abteilungKontext(name) {
  const a = ABTEILUNGEN[abteilungWaehlen(name)];
  if (!a || !a.kontext) return "";
  return `Diese Frage gehört in die Abteilung „${a.name}“ (${a.kurz}). ${a.kontext}`;
}

/**
 * Filtert die Werkzeugliste auf das, was die Abteilung anfassen darf.
 * Gibt `undefined` zurück, wenn nichts übrig bleibt — die Messages-API mag
 * kein leeres `tools`.
 */
export function werkzeugeFuer(name, werkzeuge) {
  const a = ABTEILUNGEN[abteilungWaehlen(name)];
  const erlaubt = (a && a.werkzeuge) || [];
  if (!Array.isArray(werkzeuge) || !werkzeuge.length || !erlaubt.length) return undefined;
  const gefiltert = werkzeuge.filter((w) => erlaubt.includes(w.name));
  return gefiltert.length ? gefiltert : undefined;
}

/** Für die Weiche: welche Abteilungen es gibt, kurz beschrieben. */
export function abteilungenListe() {
  return Object.entries(ABTEILUNGEN).map(([id, a]) => ({ id, name: a.name, kurz: a.kurz }));
}
