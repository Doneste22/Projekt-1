/**
 * Tut so, als wäre es api.anthropic.com — zum Prüfen der eigenen Kette, ohne
 * einen Rappen auszugeben.
 *
 *   node mock-anthropic.mjs [port]                     # Standard 9099
 *   ANTHROPIC_BASE_URL=http://localhost:9099 \
 *   ANTHROPIC_API_KEY=sk-test node server/jarvis.mjs
 *
 * Protokolliert nach stderr, welches Modell und welche Parameter tatsächlich
 * gesendet wurden — damit fällt auf, wenn der Aufruf etwas anderes schickt, als
 * im Code zu stehen scheint. Antwortet im Streaming-Format der Messages-API.
 *
 * Werkzeuge: Schickt die Anfrage `tools` mit, spielt der Mock eine echte
 * Werkzeug-Runde — erst Text plus ein tool_use-Block mit stop_reason
 * "tool_use", nach dem tool_result dann die Schlussantwort, in die das
 * Ergebnis eingebaut ist. Damit lässt sich die ganze Schleife prüfen, ohne dass
 * ein Modell im Spiel ist. Welches Werkzeug aufgerufen wird, bestimmt
 * MOCK_WERKZEUG (Standard: das erste der Anfrage), die Eingabe MOCK_EINGABE.
 */

import http from "node:http";

const PORT = Number(process.argv[2] || 9099);
const CHUNKS = process.env.MOCK_REPLY
  ? [process.env.MOCK_REPLY]
  : ["Kurze ", "**Testantwort** ", "aus dem Mock.\n\n", "- Punkt eins\n", "- Punkt zwei"];

function schreiber(res) {
  return (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
}

function beginn(send, modell) {
  send("message_start", {
    type: "message_start",
    message: {
      id: "msg_mock", type: "message", role: "assistant", model: modell,
      content: [], stop_reason: null, stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 1 }
    }
  });
}

async function textBlock(send, index, stuecke, pause = 80) {
  send("content_block_start", { type: "content_block_start", index, content_block: { type: "text", text: "" } });
  for (const text of stuecke) {
    await new Promise((r) => setTimeout(r, pause));
    send("content_block_delta", { type: "content_block_delta", index, delta: { type: "text_delta", text } });
  }
  send("content_block_stop", { type: "content_block_stop", index });
}

function abschluss(send, grund) {
  send("message_delta", { type: "message_delta", delta: { stop_reason: grund, stop_sequence: null }, usage: { output_tokens: 42 } });
  send("message_stop", { type: "message_stop" });
}

/** Sucht im Verlauf das jüngste tool_result — daran hängt die Schlussantwort. */
function letztesErgebnis(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const inhalt = messages[i].content;
    if (!Array.isArray(inhalt)) continue;
    const treffer = inhalt.find((b) => b && b.type === "tool_result");
    if (treffer) return String(treffer.content || "");
  }
  return null;
}

http.createServer(async (req, res) => {
  let body = "";
  for await (const c of req) body += c;
  const parsed = JSON.parse(body || "{}");
  const send = schreiber(res);

  console.error(`mock: ${req.method} ${req.url}`);
  console.error("mock: betas=" + (req.headers["anthropic-beta"] || "-"));
  console.error("mock: " + JSON.stringify({
    model: parsed.model,
    max_tokens: parsed.max_tokens,
    thinking: parsed.thinking,
    output_config: parsed.output_config,
    fallbacks: parsed.fallbacks,
    werkzeuge: (parsed.tools || []).map((t) => t.name),
    nachrichten: (parsed.messages || []).length,
    rollen: (parsed.messages || []).map((m) => m.role).join(",")
  }));

  res.writeHead(200, { "content-type": "text/event-stream" });
  beginn(send, parsed.model);

  const ergebnis = letztesErgebnis(parsed.messages || []);

  if (ergebnis !== null) {
    // Zweite Runde: das Werkzeug hat geantwortet, jetzt die Schlussantwort.
    console.error("mock: tool_result erhalten (" + ergebnis.length + " Zeichen)");
    const erste = ergebnis.split("\n")[0];
    await textBlock(send, 0, ["Das Werkzeug meldet: ", erste, "\n\nSoll ich damit weitermachen?"]);
    abschluss(send, "end_turn");
    res.end();
    return;
  }

  if ((parsed.tools || []).length) {
    // Erste Runde mit Werkzeugen: ansagen und eines aufrufen.
    const name = process.env.MOCK_WERKZEUG || parsed.tools[0].name;
    const eingabe = process.env.MOCK_EINGABE || "{}";
    console.error("mock: rufe Werkzeug " + name + " mit " + eingabe);
    await textBlock(send, 0, ["Ich sehe kurz nach.\n\n"]);
    send("content_block_start", {
      type: "content_block_start", index: 1,
      content_block: { type: "tool_use", id: "toolu_mock1", name, input: {} }
    });
    send("content_block_delta", {
      type: "content_block_delta", index: 1,
      delta: { type: "input_json_delta", partial_json: eingabe }
    });
    send("content_block_stop", { type: "content_block_stop", index: 1 });
    abschluss(send, "tool_use");
    res.end();
    return;
  }

  // Ohne Werkzeuge: schlichte Antwort.
  await textBlock(send, 0, CHUNKS, 120);
  abschluss(send, "end_turn");
  res.end();
}).listen(PORT, () => console.error(`mock api auf ${PORT}`));
