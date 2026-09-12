/**
 * Jarvis lokal — auf dem PC oder direkt auf dem Handy in Termux.
 *
 *   ANTHROPIC_API_KEY=sk-ant-... node server/jarvis.mjs
 *
 * Danach im Browser des Geräts http://localhost:8787/jarvis/ öffnen. Chrome
 * behandelt localhost als sichere Herkunft: Service Worker und "Zum
 * Startbildschirm hinzufügen" funktionieren also auch ohne Netzadresse.
 *
 * Braucht keine Pakete — nur Node. Es wird nichts protokolliert und nichts
 * gespeichert; der Verlauf liegt ausschließlich im Browser.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { check, sseHeaders, DEFAULT_MODEL } from "./core.mjs";
import { fuehren } from "./gespraech.mjs";
import { wurzeln } from "./werkzeuge.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.JARVIS_PORT || process.env.PORT || 8787);
const API_KEY = process.env.ANTHROPIC_API_KEY;
const PASSCODE = process.env.JARVIS_PASSCODE;
const MODEL = process.env.JARVIS_MODEL || DEFAULT_MODEL;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2"
};

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("zu groß");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function handleChat(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Nur POST." });

  if (!API_KEY) {
    return sendJson(res, 503, {
      error: "ANTHROPIC_API_KEY ist nicht gesetzt. Server mit gesetztem Schlüssel neu starten."
    });
  }
  if (PASSCODE && req.headers["x-jarvis-passcode"] !== PASSCODE) {
    return sendJson(res, 401, { error: "Zugangscode fehlt oder stimmt nicht." });
  }

  let payload;
  try {
    payload = await readBody(req);
  } catch {
    return sendJson(res, 400, { error: "Ungültige Anfrage." });
  }

  const checked = check(payload);
  if (checked.error) return sendJson(res, checked.status, { error: checked.error });

  // Browser weggeklickt oder abgebrochen: dann muss das Modell nicht weiterschreiben.
  const controller = new AbortController();
  res.on("close", () => controller.abort());

  res.writeHead(200, sseHeaders({ model: MODEL, unprotected: !PASSCODE, lokal: true }));
  const sende = (ereignis, daten) => {
    if (!res.writableEnded) res.write(`event: ${ereignis}\ndata: ${JSON.stringify(daten)}\n\n`);
  };

  try {
    await fuehren({
      apiKey: API_KEY,
      model: MODEL,
      messages: checked.messages,
      signal: controller.signal,
      // Gateway-Adresse, falls eine gesetzt ist; JARVIS_API_URL zum Prüfen gegen den Mock
      url: process.env.JARVIS_API_URL || process.env.ANTHROPIC_BASE_URL,
      sende
    });
  } catch (error) {
    if (controller.signal.aborted) return;                         // Browser hat abgebrochen
    console.error("jarvis:", error);
    // Eigener Fehlertyp: die Oberfläche zeigt bei dem den Text im Klartext an,
    // weil er schon auf Deutsch und für Damaso geschrieben ist.
    sende("error", { type: "error", error: { type: "jarvis_fehler", message: error.message } });
  }
  res.end();
}

async function serveFile(res, pathname) {
  let file = path.join(ROOT, decodeURIComponent(pathname));
  if (!file.startsWith(ROOT)) {                 // kein Ausbruch aus dem Ordner
    res.writeHead(403).end("verboten");
    return;
  }
  try {
    if ((await fs.promises.stat(file)).isDirectory()) file = path.join(file, "index.html");
  } catch {
    res.writeHead(404).end("nicht gefunden");
    return;
  }
  try {
    const data = await fs.promises.readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[path.extname(file)] || "application/octet-stream",
      "cache-control": "no-cache"
    });
    res.end(data);
  } catch {
    res.writeHead(404).end("nicht gefunden");
  }
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/jarvis") {
    handleChat(req, res).catch((error) => {
      console.error("jarvis:", error);
      if (!res.headersSent) sendJson(res, 500, { error: "Serverfehler." });
      else res.end();
    });
    return;
  }
  if (url.pathname === "/") {
    res.writeHead(302, { location: "/jarvis/" }).end();
    return;
  }
  serveFile(res, url.pathname);
}).listen(PORT, "0.0.0.0", () => {
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((n) => n && n.family === "IPv4" && !n.internal)
    .map((n) => `  http://${n.address}:${PORT}/jarvis/   (im selben WLAN)`);

  console.log("Jarvis läuft.");
  console.log(`  http://localhost:${PORT}/jarvis/   (auf diesem Gerät)`);
  addresses.forEach((line) => console.log(line));
  console.log(`Modell: ${MODEL}`);
  const ordner = wurzeln();
  if (ordner.length) {
    console.log(`Werkzeuge an — Jarvis darf ansehen und aufräumen: ${ordner.join(", ")}`);
  } else {
    console.log("Werkzeuge aus — kein Ordner freigegeben. Mit JARVIS_ORDNER=~/storage/shared starten.");
  }
  if (!API_KEY) console.log("ACHTUNG: ANTHROPIC_API_KEY fehlt — die Oberfläche läuft, Antworten nicht.");
  if (!PASSCODE) console.log("Hinweis: kein JARVIS_PASSCODE gesetzt. Lokal in Ordnung, im WLAN offen.");
});
