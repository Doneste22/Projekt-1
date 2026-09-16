/**
 * Anfragen vom Angebotsformular als SMS aufs Handy.
 *
 * Bis jetzt bereitete das Formular nur eine E-Mail vor. Wer danach nicht auf
 * „Senden" drückt — und das sind viele —, ist weg, und Damaso erfährt nie,
 * dass jemand da war. Eine SMS kommt an, während der Mensch noch auf der
 * Seite steht.
 *
 * Der Haken daran: das Formular ist öffentlich, und jede SMS kostet. Ein
 * Skript, das es tausendmal abschickt, wäre eine Rechnung. Deshalb steht
 * hier mehr Abwehr als Inhalt — und zwar im Code, nicht im Prompt.
 */

/** Längen, bei denen abgeschnitten wird. Eine Anfrage ist keine Diplomarbeit. */
export const GRENZEN = {
  leistung: 120,
  name: 80,
  ort: 80,
  kontakt: 120,
  vorhaben: 1500
};

/** Von einem Absender pro Stunde. */
export const PRO_STUNDE = 3;
/** Von allen zusammen pro Tag — der Deckel gegen die böse Überraschung. */
export const PRO_TAG = 30;
/** Wer das Formular in unter zwei Sekunden ausfüllt, ist keiner. */
export const MINDESTDAUER_MS = 2000;

function kurz(wert, grenze) {
  return String(wert ?? "").replace(/\s+/g, " ").trim().slice(0, grenze);
}

/**
 * Prüft, was von der Seite kommt.
 *
 * Gibt `{ still: true }` zurück, wenn es nach einem Skript aussieht: dann wird
 * nichts verschickt, der Seite aber Erfolg gemeldet. Ein Bot, der merkt, dass
 * er aufgeflogen ist, probiert es anders; einer, der Erfolg sieht, geht weiter.
 */
export function pruefe(daten) {
  if (!daten || typeof daten !== "object") return { fehler: "Da kam nichts an." };

  // Das Feld ist im Formular versteckt. Menschen füllen es nie aus, Skripte
  // füllen alles aus, was sie finden. Es heißt „betreff" und nicht „firma",
  // damit die Ausfüllhilfe des Browsers nicht hineinschreibt — sonst fiele
  // ein echter Kunde in die Falle.
  if (kurz(daten.betreff, 50)) return { still: true };

  const dauer = Number(daten.dauer);
  if (Number.isFinite(dauer) && dauer >= 0 && dauer < MINDESTDAUER_MS) return { still: true };

  const anfrage = {
    leistung: kurz(daten.leistung, GRENZEN.leistung),
    name: kurz(daten.name, GRENZEN.name),
    ort: kurz(daten.ort, GRENZEN.ort),
    kontakt: kurz(daten.kontakt, GRENZEN.kontakt),
    vorhaben: kurz(daten.vorhaben, GRENZEN.vorhaben)
  };

  if (anfrage.name.length < 2) return { fehler: "Bitte den Namen eintragen." };
  if (anfrage.kontakt.length < 5) {
    return { fehler: "Bitte Telefon oder E-Mail eintragen, sonst kann ich nicht zurückkommen." };
  }
  if (!anfrage.vorhaben && !anfrage.leistung) {
    return { fehler: "Bitte kurz schreiben, worum es geht." };
  }

  return { anfrage };
}

/** Was auf Damasos Handy steht. Kurz, und das Wichtigste zuerst. */
export function nachrichtText(anfrage) {
  const zeilen = ["Neue Anfrage über die Seite"];
  if (anfrage.leistung) zeilen.push(anfrage.leistung);
  zeilen.push("");
  zeilen.push(anfrage.ort ? `${anfrage.name}, ${anfrage.ort}` : anfrage.name);
  zeilen.push(`Kontakt: ${anfrage.kontakt}`);
  if (anfrage.vorhaben) {
    zeilen.push("");
    zeilen.push(anfrage.vorhaben);
  }
  return zeilen.join("\n");
}

/**
 * Zählt mit, wie oft geschrieben wurde, und sagt Halt.
 *
 * Zwei Deckel: einer pro Absender, damit ein einzelner nicht durchdreht, und
 * einer für alle zusammen, damit ein Schwarm es auch nicht tut. Ohne Speicher
 * wird durchgelassen — lieber eine SMS zu viel als ein Formular, das nichts
 * mehr tut, weil ein Ablagefach klemmt.
 */
export async function zuOft(speicher, kennung, jetzt = Date.now()) {
  if (!speicher) return false;
  const proStunde = await zaehle(speicher, `tempo-${kennung}`, jetzt, 3600_000, PRO_STUNDE);
  if (proStunde) return true;
  return zaehle(speicher, "tempo-gesamt", jetzt, 86_400_000, PRO_TAG);
}

async function zaehle(speicher, schluessel, jetzt, fenster, grenze) {
  try {
    const roh = await speicher.get(schluessel);
    const bisher = roh ? JSON.parse(typeof roh === "string" ? roh : JSON.stringify(roh)) : [];
    const frisch = (Array.isArray(bisher) ? bisher : [])
      .filter((t) => Number.isFinite(t) && jetzt - t < fenster);
    if (frisch.length >= grenze) return true;
    frisch.push(jetzt);
    await speicher.set(schluessel, JSON.stringify(frisch.slice(-grenze * 2)));
    return false;
  } catch (e) {
    console.warn("anfrage: Zähler klemmt, lasse durch —", e?.message || e);
    return false;
  }
}
