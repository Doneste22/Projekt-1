/**
 * Backend für Jarvis.
 *
 * Der Browser spricht nie direkt mit der Modell-API — er ruft /api/jarvis auf,
 * und erst diese Function setzt den API-Schlüssel ein. Der Schlüssel liegt in
 * den Netlify-Umgebungsvariablen und taucht nirgends im ausgelieferten Code auf.
 *
 * Antwort: text/event-stream mit drei Ereignissen
 *   meta   { model, unprotected }  einmal am Anfang
 *   delta  { text }                für jedes Stück Antworttext
 *   done   { stop_reason }         am Ende
 *   error  { message, status }     wenn unterwegs etwas schiefgeht
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "@netlify/functions";

const DEFAULT_MODEL = "claude-opus-5";
const MAX_TOKENS = 4000;
const MAX_MESSAGES = 24;
const MAX_CHARS = 60_000;

const SYSTEM_PROMPT = [
  "Du bist Jarvis, der persönliche KI-Assistent von Damaso.",
  "Damaso ist seit über zwei Jahrzehnten im Baugewerbe tätig, spezialisiert auf Verputzarbeiten, Trockenbau (Pladur) und Akustiklösungen. Er lebt in der Schweiz und plant den Umzug nach Galicien, Spanien.",
  "Antworte klar, knapp und hilfsbereit, standardmäßig auf Deutsch, außer Damaso schreibt in einer anderen Sprache.",
  "Du hast keinen Zugriff auf das Internet, Kalender, E-Mails oder Smart-Home-Geräte – sag das offen, wenn danach gefragt wird, statt zu raten.",
  "Diese Unterhaltung läuft auf dem Handy und ist auf kurze Wartezeit ausgelegt; beginne deine sichtbare Antwort sofort.",
  "Die Oberfläche zeigt einfaches Markdown: Fettdruck, Listen, Zwischentitel und Code. Keine Tabellen, keine Bilder, keine Fußnoten.",
  "Wenn du dich korrigierst, sag es in einem Satz und mach weiter — kein langes Zurückrudern."
].join("\n\n");

type ChatMessage = { role: "user" | "assistant"; content: string };

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

/** Nimmt nur, was die Messages-API akzeptiert: abwechselnde Rollen, beginnend bei "user". */
function sanitize(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const cleaned: ChatMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { role, content } = item as Record<string, unknown>;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string" || !content.trim()) continue;
    cleaned.push({ role, content });
  }
  while (cleaned.length && cleaned[0].role !== "user") cleaned.shift();
  while (cleaned.length && cleaned[cleaned.length - 1].role !== "user") cleaned.pop();
  return cleaned.slice(-MAX_MESSAGES);
}

export default async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Nur POST." });
  }

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return jsonResponse(503, {
      error: "Auf dem Server fehlt ANTHROPIC_API_KEY. In den Netlify-Variablen eintragen und neu veröffentlichen."
    });
  }

  const passcode = Netlify.env.get("JARVIS_PASSCODE");
  if (passcode && req.headers.get("x-jarvis-passcode") !== passcode) {
    return jsonResponse(401, { error: "Zugangscode fehlt oder stimmt nicht." });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(400, { error: "Ungültige Anfrage." });
  }

  const messages = sanitize((payload as Record<string, unknown>)?.messages);
  if (!messages.length) {
    return jsonResponse(400, { error: "Keine Nachricht erhalten." });
  }
  const size = messages.reduce((sum, m) => sum + m.content.length, 0);
  if (size > MAX_CHARS) {
    return jsonResponse(413, { error: "Der Verlauf ist zu lang. Lösch ihn und fang neu an." });
  }

  const client = new Anthropic({ apiKey });
  const model = Netlify.env.get("JARVIS_MODEL") || DEFAULT_MODEL;

  // fallbacks/betas sind neuer als die SDK-Typen — der Aufruf selbst stimmt.
  const stream = client.beta.messages.stream({
    model,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages
  } as any);

  const encoder = new TextEncoder();

  const body = new ReadableStream({
    async start(controller) {
      const emit = (event: string, data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      emit("meta", { model, unprotected: !passcode });

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
        const status = (error as { status?: number }).status ?? 500;
        const message =
          status === 401 ? "Der API-Schlüssel auf dem Server wird abgelehnt."
          : status === 429 ? "Das Modell ist gerade ausgelastet. Gleich nochmal versuchen."
          : status >= 500 ? "Das Modell antwortet gerade nicht. Gleich nochmal versuchen."
          : "Die Anfrage ist nicht durchgegangen.";
        console.error("jarvis:", error);
        emit("error", { message, status });
      } finally {
        controller.close();
      }
    },

    cancel() {
      // Der Browser hat abgebrochen — dann muss das Modell nicht weiterschreiben.
      stream.abort();
    }
  });

  return new Response(body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no"
    }
  });
};

export const config: Config = {
  path: "/api/jarvis"
};
