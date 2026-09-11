---
name: hausstil
description: Hausstil und bewährte Muster für Damasos Webprojekte (Repo Projekt-1 — Wand für Wand, Jarvis). Nutze diesen Skill bei jeder Arbeit in diesem Repo: neue Seite oder Unterseite, Änderung an Gestaltung oder Texten, neue kleine App, ein Backend für einen API-Schlüssel, etwas installierbar aufs Handy bringen, Veröffentlichung bei Netlify, oder wenn gefragt wird „wie machen wir das hier üblicherweise". Auch dann heranziehen, wenn der Auftrag knapp ist („bau mir X", „mach Y schöner") — die Entscheidungen über Sprache, Farben, Abhängigkeiten und Geheimnisse sind hier schon getroffen und müssen nicht neu erfunden werden.
---

# Hausstil

Dieses Repo gehört Damaso Estévez — Trockenbauer, Verputzer, Akustiker, seit über
zwanzig Jahren auf dem Bau, in der Schweiz, mit Plänen für Galicien. Er liest und
schreibt Deutsch. Er ist kein Entwickler: was er bekommt, muss ohne Werkzeugkette
laufen und muss sich erklären, ohne dass er nachfragen muss.

Daraus folgt fast alles Weitere.

## Die fünf Regeln, die hier gelten

**1. Alles Sichtbare ist auf Deutsch.** Oberflächen, Fehlermeldungen, README,
Code-Kommentare, Commit-Nachrichten (Imperativ: „Füge … hinzu", „Mache …").
Bezeichner im Code bleiben englisch, wie in jeder Codebasis üblich — der Bruch
dazwischen stört niemanden, gemischte Kommentare schon.

**2. Kein Build-Schritt für das, was der Browser lädt.** Die Seiten sind HTML,
CSS und etwas JavaScript, direkt ausgeliefert. Keine Frameworks, keine
Bundler, keine CSS-Bibliothek, keine Icon-Pakete. Abbildungen sind Inline-SVG,
keine Bilddateien. Eine npm-Abhängigkeit gibt es nur dort, wo sie
unvermeidlich ist (das Anthropic-SDK im Backend) — und nie im Browser.

Das ist keine Askese: Damaso soll eine Datei öffnen und lesen können, was drin
steht, auch in zwei Jahren, auch ohne dass jemand `npm install` erklärt.

**3. Geheimnisse kommen nie in den Browser.** Ein API-Schlüssel in einer
HTML-Datei ist für jeden Besucher lesbar. Wenn etwas einen Schlüssel braucht,
kommt eine Netlify-Function davor. Muster und fertiger Code:
`references/backend.md`.

**4. Farben, Abstände und Schriften stehen als Tokens in `:root`.** Wer die
Marke verschiebt, ändert die Tokens, nicht die Komponenten. Die Palette und
was sie bedeutet: `references/design.md`.

**5. Geprüft wird, bevor ausgeliefert wird.** Nicht „sieht plausibel aus",
sondern: Seite im Browser geöffnet, Knopf gedrückt, Ergebnis gesehen. Wie das
hier ohne Netz und ohne Geld geht: unten unter *Prüfen*.

## Aufbau des Repos

```
index.html, ratgeber/, impressum.html …   Ratgeber-Auftritt „Wand für Wand"
assets/css/site.css                       Tokens und Komponenten der Seite
jarvis/                                   Jarvis: installierbare Assistenz-App
server/core.mjs                           Kern von Jarvis (Prompt, Modellaufruf)
server/jarvis.mjs                         Jarvis lokal starten (PC, Termux)
netlify/edge-functions/                   dasselbe im Netz
netlify.toml                              Veröffentlichung, Kopfzeilen, Sperren
```

Jede eigenständige App bekommt einen eigenen Ordner mit eigenem CSS und teilt
sich bewusst nichts mit dem Ratgeber-Auftritt. Das kostet ein paar doppelte
Zeilen und spart, dass eine Änderung an der Seite die App zerlegt.

## Wenn du etwas Neues baust

| Auftrag | Wo nachlesen |
| --- | --- |
| Seite, Abschnitt, Gestaltung, Texte | `references/design.md` |
| Backend, API-Schlüssel, Modellaufruf, Streaming | `references/backend.md` |
| Aufs Handy installierbar, Icons, offline | `references/pwa.md` |

Lies die passende Datei, bevor du anfängst — sie enthält jeweils die bereits
getroffenen Entscheidungen samt Begründung und die Fallen, die hier schon einmal
Zeit gekostet haben.

## Prüfen

Reihenfolge, vom Billigsten zum Teuersten:

```bash
node --check datei.js                                  # Syntax
node --experimental-strip-types --check datei.mts      # dasselbe für TypeScript
```

Dann im Browser. Chromium liegt unter
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`; mit `playwright-core`
(im Scratchpad installieren, nicht ins Projekt) lässt sich die Seite öffnen,
bedienen und fotografieren. Zwei Dinge, die sonst Zeit kosten:

- `--screenshot` von Chrome direkt liefert ein Bild in Fenstergröße, aber einen
  kleineren Sichtbereich — das Bild ist unten weiß. Über `playwright-core` mit
  gesetztem `viewport` und `clip` stimmt es.
- Auf `pageerror` und `console` hören und am Ende ausgeben. Ein stiller
  JS-Fehler sieht auf dem Bild aus wie eine funktionierende Seite.

Was ans Modell geht, lässt sich ohne einen Rappen Kosten prüfen: den Aufruf auf
einen eigenen kleinen Server zeigen lassen, der das Antwortformat nachspielt
(`JARVIS_API_URL`). Fertig dafür: `scripts/mock-anthropic.mjs`. Das prüft die
ganze Kette — Parameter, Weiterleitung, Oberfläche — und zeigt im Protokoll,
welches Modell und welche Parameter tatsächlich gesendet wurden.

Und was veröffentlicht ist, muss *veröffentlicht* geprüft werden, nicht nur
lokal: die Grenzen der Plattform (Zeit, Rechenzeit) zeigen sich erst dort, und
zwar als stillschweigend abgeschnittene Antwort, nicht als Fehler. Also nach
jedem Deploy einmal etwas Langes fragen und nachsehen, ob der Abschluss
(`message_stop`) wirklich ankommt. Kommt der Browser dieser Sandbox nicht an die
Live-Adresse (der Proxy lässt ihn nicht durch), hilft eine Brücke: ein lokaler
Server, der die Dateien ausliefert und `/api/…` per `curl` an die Live-Adresse
weiterreicht — dann testet der Browser echtes Verhalten über localhost.

## Ausliefern

Entwickelt wird auf dem zugewiesenen Zweig, gepusht wird dorthin. Ein Pull
Request nur, wenn Damaso ihn verlangt.

Veröffentlicht wird über Netlify (MCP-Werkzeuge: Projekt anlegen,
Umgebungsvariablen setzen, `deploy-site`). Drei Dinge, die dabei zählen:

- **Nichts überschreiben.** Vor einem Deploy prüfen, ob das Zielprojekt
  überhaupt zu diesem Repo gehört (`deploy_source: "drop"` und `branch: null`
  heißen: das ist eine von Hand hochgeladene Seite, ein Deploy löscht sie).
  Im Zweifel ein neues Projekt anlegen und fragen.
- **Umgebungsvariablen wirken erst nach einem neuen Deploy.** Variable setzen,
  dann erneut veröffentlichen, dann prüfen — sonst hält man einen offenen
  Endpunkt für geschützt. Geheim markierte Variablen (`envVarIsSecret`) sind
  beim Anlegen schon mal stillschweigend verschwunden; danach die Liste
  abfragen und wirklich hinsehen.
- **Ein offener Endpunkt kostet ihn Geld.** Wer die Adresse kennt, fragt auf
  seine Rechnung. Also entweder Zugangscode setzen oder ihm klar sagen, dass
  er offen steht.

## Wie mit Damaso geredet wird

Kurz, konkret, ohne Fachjargon, und an einem Beispiel, das er kennt. „Der
Schlüssel wäre für jeden Besucher lesbar" versteht er sofort; „client-side
exposure of credentials" nicht.

Was nicht funktioniert, wird beim Namen genannt — mit dem, was er dagegen tun
kann. Er hat zwanzig Jahre lang Wände abgenommen, die nicht im Lot waren; er
will wissen, was schiefsteht, nicht, dass alles schön ist.
