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
 */

import http from "node:http";

const PORT = Number(process.argv[2] || 9099);
const CHUNKS = process.env.MOCK_REPLY
  ? [process.env.MOCK_REPLY]
  : ["Kurze ", "**Testantwort** ", "aus dem Mock.\n\n", "- Punkt eins\n", "- Punkt zwei"];

http.createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const parsed = JSON.parse(body || "{}");

  console.error(`mock: ${req.method} ${req.url}`);
  console.error("mock: betas=" + (req.headers["anthropic-beta"] || "-"));
  console.error("mock: " + JSON.stringify({
    model: parsed.model,
    max_tokens: parsed.max_tokens,
    thinking: parsed.thinking,
    output_config: parsed.output_config,
    fallbacks: parsed.fallbacks,
    nachrichten: (parsed.messages || []).length,
    rollen: (parsed.messages || []).map((m) => m.role).join(",")
  }));

  res.writeHead(200, { "content-type": "text/event-stream" });
  const send = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);

  send("message_start", { type: "message_start", message: { id: "msg_mock", type: "message", role: "assistant", model: parsed.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } });
  send("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
  for (const text of CHUNKS) {
    await new Promise((r) => setTimeout(r, 120));
    send("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } });
  }
  send("content_block_stop", { type: "content_block_stop", index: 0 });
  send("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 42 } });
  send("message_stop", { type: "message_stop" });
  res.end();
}).listen(PORT, () => console.error(`mock api auf ${PORT}`));
