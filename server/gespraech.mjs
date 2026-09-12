/**
 * Die Werkzeug-Schleife — nur für den lokalen Server.
 *
 * Im Netz reicht der Server den Antwortstrom unverändert durch, weil eine
 * Edge-Function pro Anfrage nur 50 Millisekunden rechnen darf. Auf dem eigenen
 * Gerät gilt das nicht: hier darf der Server mitlesen, und das muss er auch,
 * denn Werkzeuge gehen nicht ohne. Der Ablauf ist immer derselbe:
 *
 *   fragen → Modell antwortet und will ein Werkzeug → ausführen →
 *   Ergebnis zurückgeben → Modell schreibt weiter → fertig
 *
 * Nach außen sieht das aus wie eine einzige Antwort: Text fließt durchgehend,
 * und `message_stop` kommt genau einmal, wenn wirklich alles gesagt ist.
 * Zusätzlich meldet der Server jedes Werkzeug als eigenes Ereignis, damit in
 * der Oberfläche sichtbar ist, was gerade angefasst wird.
 */

import { callUpstream, describeUpstream } from "./core.mjs";
import { WERKZEUGE, ausfuehren, wurzeln } from "./werkzeuge.mjs";

const MAX_RUNDEN = 6;        // Schutz gegen ein Modell, das sich im Kreis dreht

/** Zerlegt einen Server-Sent-Events-Strom in einzelne Ereignisse. */
async function* ereignisse(koerper) {
  const leser = koerper.getReader();
  const dekoder = new TextDecoder();
  let puffer = "";

  while (true) {
    const stueck = await leser.read();
    if (stueck.done) break;
    puffer += dekoder.decode(stueck.value, { stream: true });

    const bloecke = puffer.split("\n\n");
    puffer = bloecke.pop();

    for (const block of bloecke) {
      let name = "message";
      let daten = "";
      for (const zeile of block.split("\n")) {
        if (zeile.startsWith("event:")) name = zeile.slice(6).trim();
        else if (zeile.startsWith("data:")) daten += zeile.slice(5).trim();
      }
      if (!daten) continue;
      try { yield [name, JSON.parse(daten)]; } catch { /* unvollständiges JSON überspringen */ }
    }
  }
}

/**
 * Eine Runde: fragen, den Text sofort weiterreichen, die Blöcke der Antwort
 * einsammeln. Gibt zurück, womit das Modell aufgehört hat.
 */
async function eineRunde({ apiKey, model, messages, werkzeuge, signal, url, sende }) {
  const antwort = await callUpstream({ apiKey, model, messages, signal, url, werkzeuge });

  if (!antwort.ok || !antwort.body) {
    const text = await antwort.text().catch(() => "");
    const fehler = new Error(describeUpstream(antwort.status, text));
    fehler.status = antwort.status;
    throw fehler;
  }

  const bloecke = new Map();          // index → Block im Aufbau
  let stopGrund = null;

  for await (const [, daten] of ereignisse(antwort.body)) {
    switch (daten.type) {
      case "content_block_start":
        bloecke.set(daten.index, { ...daten.content_block, text: "", thinking: "", partial: "" });
        break;

      case "content_block_delta": {
        const block = bloecke.get(daten.index);
        if (!block) break;
        const d = daten.delta || {};
        if (d.type === "text_delta") {
          block.text += d.text;
          sende("content_block_delta", daten);            // Text fließt sofort weiter
        } else if (d.type === "input_json_delta") {
          block.partial += d.partial_json || "";          // Werkzeug-Eingabe kommt stückweise
        } else if (d.type === "thinking_delta") {
          block.thinking += d.thinking || "";
        } else if (d.type === "signature_delta") {
          block.signature = d.signature;
        }
        break;
      }

      case "message_delta":
        if (daten.delta && daten.delta.stop_reason) stopGrund = daten.delta.stop_reason;
        break;

      case "error":
        throw Object.assign(new Error((daten.error && daten.error.message) || "Fehler im Strom"), { roh: daten });

      default:
        break;
    }
  }

  // Aus den eingesammelten Stücken wieder die Blöcke bauen, die zurückgeschickt
  // werden müssen. Denkblöcke gehören unverändert dazu, sonst lehnt die API die
  // nächste Runde ab.
  const inhalt = [];
  for (const block of [...bloecke.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b)) {
    if (block.type === "text" && block.text) {
      inhalt.push({ type: "text", text: block.text });
    } else if (block.type === "thinking") {
      inhalt.push({ type: "thinking", thinking: block.thinking, signature: block.signature });
    } else if (block.type === "redacted_thinking") {
      inhalt.push({ type: "redacted_thinking", data: block.data });
    } else if (block.type === "tool_use") {
      let eingabe = {};
      // Nie auf dem Rohtext herumschneiden — die API schickt gültiges JSON.
      try { eingabe = block.partial ? JSON.parse(block.partial) : {}; } catch { eingabe = {}; }
      inhalt.push({ type: "tool_use", id: block.id, name: block.name, input: eingabe });
    }
  }

  return { stopGrund, inhalt };
}

/**
 * Führt das Gespräch, bis das Modell fertig ist. `sende(ereignis, daten)` geht
 * an den Browser.
 */
export async function fuehren({ apiKey, model, messages, signal, url, sende }) {
  const werkzeuge = wurzeln().length ? WERKZEUGE : undefined;
  const verlauf = [...messages];

  for (let runde = 1; runde <= MAX_RUNDEN; runde++) {
    const { stopGrund, inhalt } = await eineRunde({ apiKey, model, messages: verlauf, werkzeuge, signal, url, sende });

    if (stopGrund !== "tool_use") {
      sende("message_delta", { type: "message_delta", delta: { stop_reason: stopGrund || "end_turn" } });
      sende("message_stop", { type: "message_stop" });
      return;
    }

    verlauf.push({ role: "assistant", content: inhalt });

    // Alle Werkzeuge dieser Runde ausführen; die Ergebnisse gehen zusammen in
    // *eine* Nachricht zurück — getrennt verschickt würde das Modell künftig
    // seltener mehrere Werkzeuge auf einmal nehmen.
    const ergebnisse = [];
    for (const block of inhalt.filter((b) => b.type === "tool_use")) {
      sende("werkzeug", { status: "laeuft", name: block.name });
      const ergebnis = await ausfuehren(block.name, block.input);
      sende("werkzeug", { status: "fertig", name: block.name, text: ergebnis.ui, fehler: !!ergebnis.fehler });
      ergebnisse.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: ergebnis.text,
        ...(ergebnis.fehler ? { is_error: true } : {})
      });
    }
    verlauf.push({ role: "user", content: ergebnisse });
  }

  // Mehr Runden als erlaubt: lieber sauber abschließen als endlos weiterlaufen.
  sende("werkzeug", { status: "fertig", name: "grenze", text: `nach ${MAX_RUNDEN} Runden abgebrochen`, fehler: true });
  sende("message_delta", { type: "message_delta", delta: { stop_reason: "max_runden" } });
  sende("message_stop", { type: "message_stop" });
}
