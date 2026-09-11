/**
 * Gemeinsamer Kern für Jarvis.
 *
 * Wird von zwei Seiten benutzt:
 *   netlify/functions/jarvis.mts   — im Netz, Schlüssel in den Netlify-Variablen
 *   server/jarvis.mjs              — lokal (PC oder Termux auf dem Handy)
 *
 * Beide sprechen dasselbe Protokoll mit der Oberfläche:
 *   meta   { model, unprotected }  einmal am Anfang
 *   delta  { text }                für jedes Stück Antworttext
 *   done   { stop_reason }         am Ende
 *   error  { message, status }     wenn unterwegs etwas schiefgeht
 */

import Anthropic from "@anthropic-ai/sdk";

export const DEFAULT_MODEL = "claude-opus-5";
export const MAX_TOKENS = 4000;
export const MAX_MESSAGES = 24;
export const MAX_CHARS = 60000;

export const SYSTEM_PROMPT = [
  "Du bist Jarvis, der persönliche KI-Assistent von Damaso.",
  "Damaso ist seit über zwei Jahrzehnten im Baugewerbe tätig, spezialisiert auf Verputzarbeiten, Trockenbau (Pladur) und Akustiklösungen. Er lebt in der Schweiz und plant den Umzug nach Galicien, Spanien.",
  "Antworte klar, knapp und hilfsbereit, standardmäßig auf Deutsch, außer Damaso schreibt in einer anderen Sprache.",
  "Du hast keinen Zugriff auf das Internet, Kalender, E-Mails oder Smart-Home-Geräte – sag das offen, wenn danach gefragt wird, statt zu raten.",
  "Diese Unterhaltung läuft auf dem Handy und ist auf kurze Wartezeit ausgelegt; beginne deine sichtbare Antwort sofort.",
  "Die Oberfläche zeigt einfaches Markdown: Fettdruck, Listen, Zwischentitel und Code. Keine Tabellen, keine Bilder, keine Fußnoten.",
  "Wenn du dich korrigierst, sag es in einem Satz und mach weiter — kein langes Zurückrudern."
].join("\n\n");

/** Nimmt nur, was die Messages-API akzeptiert: Rollen abwechselnd, Anfang und Ende beim Nutzer. */
export function sanitize(raw) {
  if (!Array.isArray(raw)) return [];
  const cleaned = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { role, content } = item;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string" || !content.trim()) continue;
    cleaned.push({ role, content });
  }
  while (cleaned.length && cleaned[0].role !== "user") cleaned.shift();
  while (cleaned.length && cleaned[cleaned.length - 1].role !== "user") cleaned.pop();
  return cleaned.slice(-MAX_MESSAGES);
}

/** Prüft die Anfrage, bevor irgendetwas Geld kostet. Gibt einen Fehler oder die Nachrichten zurück. */
export function check(payload) {
  const messages = sanitize(payload && payload.messages);
  if (!messages.length) return { error: "Keine Nachricht erhalten.", status: 400 };
  const size = messages.reduce((sum, m) => sum + m.content.length, 0);
  if (size > MAX_CHARS) return { error: "Der Verlauf ist zu lang. Lösch ihn und fang neu an.", status: 413 };
  return { messages };
}

export function startStream({ apiKey, model, messages }) {
  const client = new Anthropic({ apiKey });
  // fallbacks/betas sind neuer als die SDK-Typen — der Aufruf selbst stimmt.
  return client.beta.messages.stream({
    model: model || DEFAULT_MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages
  });
}

function describe(status) {
  if (status === 401) return "Der API-Schlüssel wird abgelehnt.";
  if (status === 429) return "Das Modell ist gerade ausgelastet. Gleich nochmal versuchen.";
  if (status >= 500) return "Das Modell antwortet gerade nicht. Gleich nochmal versuchen.";
  return "Die Anfrage ist nicht durchgegangen.";
}

/**
 * Fährt den Strom ab und meldet jedes Stück über `emit(event, data)`.
 * Gibt zurück, wenn die Antwort fertig ist — Fehler landen als error-Ereignis.
 */
export async function pump(stream, emit) {
  try {
    let produced = false;
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        produced = true;
        emit("delta", { text: event.delta.text });
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal" && !produced) {
      emit("delta", { text: "Dazu kann ich nichts sagen. Frag mich etwas anderes." });
    }
    emit("done", { stop_reason: final.stop_reason });
  } catch (error) {
    const status = (error && error.status) || 500;
    console.error("jarvis:", error);
    emit("error", { message: describe(status), status });
  }
}

export const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-store",
  "x-accel-buffering": "no"
};
