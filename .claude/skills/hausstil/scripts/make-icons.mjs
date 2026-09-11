/**
 * PWA-Icons aus einer SVG-Datei erzeugen.
 *
 *   node make-icons.mjs <motiv.svg> <zielordner> [hintergrund]
 *
 * Erzeugt icon-192.png, icon-512.png, icon-maskable-512.png und
 * apple-touch-icon.png. Das maskierbare Icon wird kleiner gerechnet, weil
 * Android rund beschneidet und sonst das Motiv anschneidet.
 *
 * Die Vorlage muss im Koordinatensystem viewBox="0 0 64 64" gezeichnet sein —
 * dasselbe Raster wie die Gesichter und Signets in diesem Repo.
 *
 * Braucht playwright-core (im Scratchpad installieren, nicht ins Projekt —
 * dann PW_MODULES auf diesen Ordner zeigen lassen) und das vorinstallierte
 * Chromium. Warum nicht Chrome direkt mit --screenshot:
 * dessen Sichtbereich ist kleiner als die angegebene Fenstergröße, das Bild
 * bekommt unten einen weißen Streifen. Mit gesetztem viewport und clip stimmt es.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

// playwright-core liegt meist nicht im Projekt, sondern dort, wo es für den
// Durchlauf installiert wurde. PW_MODULES zeigt auf diesen Ordner.
const requireFrom = createRequire(
  process.env.PW_MODULES ? path.join(process.env.PW_MODULES, "package.json") : import.meta.url
);
const { chromium } = requireFrom("playwright-core");

const CHROME = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const [, , svgPath, outDir, background = "#16283D"] = process.argv;
if (!svgPath || !outDir) {
  console.error("Aufruf: node make-icons.mjs <motiv.svg> <zielordner> [hintergrund]");
  process.exit(1);
}

const svg = fs.readFileSync(svgPath, "utf8");
fs.mkdirSync(outDir, { recursive: true });

// Datei, Kantenlänge, Skalierung des Motivs, Eckenradius (0 = vollflächig)
const JOBS = [
  ["icon-192.png", 192, 0.98, 13],
  ["icon-512.png", 512, 0.98, 13],
  ["icon-maskable-512.png", 512, 0.74, 0],
  ["apple-touch-icon.png", 180, 1.02, 0]
];

function page(size, scale, radius) {
  const inner = svg.replace(/<\?xml[\s\S]*?\?>/, "").replace(/<svg[^>]*>|<\/svg>/g, "");
  const clip = radius
    ? `<clipPath id="r"><rect x="0" y="0" width="64" height="64" rx="${radius}"/></clipPath>`
    : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0}svg{display:block}</style></head><body>
<svg width="${size}" height="${size}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs>${clip}</defs>
  <g ${radius ? 'clip-path="url(#r)"' : ""}>
    <rect x="0" y="0" width="64" height="64" fill="${background}"/>
    <g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${inner}</g>
  </g>
</svg></body></html>`;
}

const browser = await chromium.launch({ executablePath: CHROME });
for (const [name, size, scale, radius] of JOBS) {
  const tab = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await tab.setContent(page(size, scale, radius));
  await tab.screenshot({ path: path.join(outDir, name), clip: { x: 0, y: 0, width: size, height: size } });
  await tab.close();
  console.log("erzeugt:", name, `${size}×${size}`);
}
await browser.close();
