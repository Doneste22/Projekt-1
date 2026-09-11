# Wand für Wand

Statische Website für „Wand für Wand“ — Ratgeber und Werkzeugempfehlungen für
Trockenbau, Spachteltechnik und Raumakustik.

## Struktur

Die Seiten sind reines HTML, CSS und etwas JavaScript, ohne Build-Schritt, und
lassen sich von jedem Webserver oder direkt aus dem Dateisystem ausliefern. Eine
npm-Abhängigkeit gibt es nur für die Jarvis-Function (siehe unten); der Ratgeber
selbst braucht sie nicht.

```
index.html                    Startseite
ratgeber/verspachteln.html    Anleitung: Trockenbauwand verspachteln
ratgeber/akustikdecke.html    Anleitung: Akustikdecke montieren
ratgeber/werkzeug.html        Ratgeber: Werkzeug-Grundausstattung
impressum.html                Impressum — Entwurf mit Platzhaltern
datenschutz.html              Datenschutzerklärung — Entwurf mit Platzhaltern
partnerlinks.html             Interne Arbeitsliste für die Affiliate-Links
jarvis/                       Jarvis: eigenständige Assistenz-App (installierbar)
server/core.mjs               Kern von Jarvis: Systemprompt, Prüfung, Modellaufruf
server/jarvis.mjs             Jarvis lokal starten (PC oder Termux auf dem Handy)
netlify/functions/jarvis.mts  Dasselbe im Netz — hält den API-Schlüssel
netlify.toml                  Veröffentlichung und Function-Verzeichnis
assets/css/site.css           Design-System (Tokens, Komponenten, Raster)
assets/js/site.js             Mobile Navigation, Diagramm-Tooltip, Schichten-Highlight
```

Extern geladen werden nur die Schriften (Archivo, Inter) von Google Fonts;
ohne Netz greift der System-Fallback. Alle Abbildungen sind handgezeichnetes
Inline-SVG — keine Bilddateien, keine Bibliotheken.

## Ansehen

```
python3 -m http.server 8000
```

Danach http://localhost:8000 aufrufen.

## Inhalt der Startseite

| Anker | Inhalt |
| --- | --- |
| Hero | Positionierung, Horizontalschnitt durch die Wand mit Rufnummern |
| Kennzahlen | Achsmaß, Schraubenabstand, Q-Stufen, Absorptionsgrad |
| `#aufbau` | Explosionszeichnung der fünf Schichten, mit Liste verknüpft |
| `#qualitaet` | Q1–Q4 im Streiflicht, je eine Abbildung pro Stufe |
| `#ratgeber` | Teaser der drei Anleitungen |
| `#akustik` | Absorptionsdiagramm, Deckenschnitt, Nachhall-Überschlag |
| `#empfehlungen` | 29 Produktkarten in sechs Gruppen, Vergleichstabelle, Werbekennzeichnung |
| `#experte` | Kurzprofil Dámaso Estévez |
| `#faq` | Sechs häufige Fragen |

## Design-System

Alle Farben, Schriften und Abstände liegen als Custom Properties in
`assets/css/site.css` (`:root`). Wer die Marke verschiebt, ändert dort die
Tokens — nicht die Komponenten.

Die drei Diagrammfarben (`--serie-1/2/3`) sind gegen Helligkeitsband,
Chroma-Untergrenze, Farbfehlsichtigkeit (Protan/Deutan/Tritan) und Kontrast
zum Untergrund geprüft. Wer sie austauscht, sollte das erneut prüfen: Die
Kurven sind zusätzlich direkt beschriftet und als Tabelle hinterlegt, Farbe
ist also nie das einzige Unterscheidungsmerkmal.

## Rechtliche Seiten

`impressum.html` und `datenschutz.html` sind **Entwürfe**. Jede auszufüllende Stelle
ist im Text rot markiert (`<span class="platzhalter">`), beide Seiten tragen oben
ein Entwurfs-Banner und stehen auf `noindex`. Am Ende jeder Seite steht eine
Prüfliste mit dem, was vor dem Livegang zu klären ist.

Der Entwurf folgt deutschem Recht (DDG, MStV, DSGVO, TDDDG). Wird die Seite aus der
Schweiz betrieben, gelten andere Regeln — dann ist der Text umzuschreiben, nicht nur
auszufüllen. Er ersetzt keine Rechtsberatung.

**Ein Punkt ist heute schon konkret:** Die Seite lädt die Schriften Archivo und Inter
direkt von Google. Dabei geht die IP-Adresse der Besucher an Google, ohne Einwilligung.
Die saubere Lösung ist, die Schriftdateien lokal auszuliefern und per `@font-face`
einzubinden — dann entfällt der heikelste Abschnitt der Datenschutzerklärung ersatzlos.

## Partnerlinks

`partnerlinks.html` ist die Arbeitsliste: alle 29 Produktempfehlungen in sechs
Tabellen, je Zeile Platz für Partnerprogramm und Ziel-URL, dazu ein Sprung zur
zugehörigen Karte auf der Startseite.

Jede Produktkarte in `index.html` trägt dafür eine stabile Kennung:

```html
<article class="produkt tipp" id="produkt-festool-planex-lhs-2-225-eqi"
         data-produkt="festool-planex-lhs-2-225-eqi">
  …
  <a class="link" href="#" data-affiliate="pending"
     data-produkt="festool-planex-lhs-2-225-eqi">Zum Produkt →</a>
  <span class="status">Partnerlink folgt</span>
```

Beim Eintragen eines echten Links wird `href` gesetzt, `data-affiliate` auf `aktiv`
geändert, `rel="sponsored nofollow noopener"` ergänzt und der Status von
„Partnerlink folgt“ auf „Anzeige“ gesetzt. Die Seite selbst ist nicht verlinkt und
auf `noindex` gesetzt; sie kann vor dem Livegang gelöscht werden.

## Jarvis

`jarvis/` ist eine eigenständige App und gehört nicht zum Ratgeber-Auftritt: von
keiner Seite verlinkt, auf `noindex`, eigenes CSS, eigene Schriften (nämlich
keine — nur Systemschriften, damit sie offline vollständig läuft).

```
jarvis/index.html             Gerüst
jarvis/style.css              Gestaltung und die Animationen des Gesichts
jarvis/app.js                 Verlauf, Streaming, Sprache, Installation
jarvis/sw.js                  Service Worker: App startet auch ohne Netz
jarvis/manifest.webmanifest   Name, Farben, Icons für den Startbildschirm
jarvis/icons/                 App-Icons (192, 512, maskierbar, Apple)
```

### Das Gesicht

Jarvis hat ein Gesicht aus dem Werkzeug, mit dem Damaso arbeitet: ein Kopf in
Form eines Wasserwaagen-Körpers, als Mund eine Libelle mit oranger Blase
zwischen zwei Strichen. Es reagiert auf den Zustand der App — `data-state` am
Element `.app` steuert alles, die Animationen stehen in `style.css`:

| Zustand | Was das Gesicht macht |
| --- | --- |
| `idle` | blinzelt, die Blase driftet minimal |
| `listening` | Augen etwas größer, ein Ring pulsiert (Spracheingabe läuft) |
| `thinking` | Kopf legt sich schief, die Blase wandert durch die Libelle |
| `speaking` | der Mund bewegt sich, solange Text ankommt oder vorgelesen wird |
| `offline` | alles steht still, die Blase hängt am Anschlag |

Dasselbe Gesicht ist das App-Icon. Wer es ändert, ändert `jarvis/index.html`
(das eingebettete SVG) und erzeugt die PNGs in `jarvis/icons/` neu.

Bei `prefers-reduced-motion` stehen alle Animationen still.

### Backend

Der Browser spricht nie direkt mit der Modell-API. Er ruft `/api/jarvis` auf,
und erst der Server setzt den API-Schlüssel ein. Es gibt zwei Server, die
denselben Kern (`server/core.mjs`) benutzen und sich für die Oberfläche gleich
verhalten: die Netlify-Function fürs Netz und `server/jarvis.mjs` für lokal.
Systemprompt, Modellwahl und Grenzen stehen einmal in `core.mjs` — wer etwas
daran ändert, ändert es für beide. Der Schlüssel steckt in den Umgebungsvariablen und taucht
nirgends im ausgelieferten Code auf — in eine HTML-Datei gehört er nicht, dort
könnte ihn jeder Besucher lesen.

Die Antwort kommt als Strom (`text/event-stream`) zurück und erscheint Wort für
Wort, statt dass man auf den ganzen Absatz wartet. Abbrechen bricht auch
serverseitig ab.

**Umgebungsvariablen** (Netlify: *Project configuration → Environment variables*):

| Variable | Pflicht | Wozu |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | ja | Schlüssel von console.anthropic.com. Ohne ihn antwortet die App mit einem Hinweis. |
| `JARVIS_PASSCODE` | empfohlen | Zugangscode. Ist er gesetzt, fragt die App ihn einmal ab und merkt ihn sich. Ohne ihn kann jeder, der die Adresse kennt, auf deine Rechnung Fragen stellen — die App warnt dann sichtbar. |
| `JARVIS_MODEL` | nein | Anderes Modell, Standard ist `claude-opus-5`. |

Eingestellt sind `effort: "medium"` und maximal 4000 Tokens pro Antwort — ein
Kompromiss aus Tempo, Kosten und Ausführlichkeit; beides steht oben in
`jarvis.mts`. Der Systemprompt (wer Jarvis ist, wie er antwortet) steht
ebenfalls dort und nicht im Browser, damit er von außen nicht zu ändern ist.

### Auf dem Handy installieren

1. Seite veröffentlichen, `ANTHROPIC_API_KEY` und `JARVIS_PASSCODE` setzen.
2. `https://DEINE-ADRESSE/jarvis/` im Handy-Browser öffnen.
3. **Android/Chrome:** Jarvis fragt selbst („Auf den Startbildschirm legen?“).
   **iPhone/Safari:** unten auf „Teilen“, dann „Zum Home-Bildschirm“.

Danach startet Jarvis im eigenen Fenster ohne Browserleiste, mit eigenem Icon.
Der Gesprächsverlauf liegt im Speicher des Geräts (bis zu 200 Nachrichten, an
die API gehen die letzten 24) und verlässt das Handy nur als Teil der Anfrage.

### Ohne Netz-Server: Termux auf dem Handy

Jarvis läuft auch komplett auf dem Handy — Server und alles. Das braucht keine
Veröffentlichung, kostet kein Hosting, und der Schlüssel verlässt das Gerät nie.
In Termux (Android):

```
pkg install nodejs git
git clone https://github.com/Doneste22/Projekt-1
cd Projekt-1
npm install
export ANTHROPIC_API_KEY=sk-ant-...
node server/jarvis.mjs
```

Dann im Chrome des Handys `http://localhost:8787/jarvis/` öffnen und über das
Menü „Zum Startbildschirm hinzufügen“. Chrome behandelt `localhost` als sichere
Herkunft, die Installation funktioniert also genauso wie bei einer echten
Adresse.

Was man dabei wissen muss:

- Der Server muss laufen. Ist Termux zu, kommt keine Antwort — die App startet
  zwar (der Service Worker hat sie gespeichert), aber jede Frage endet im
  Fehlerhinweis. `termux-wake-lock` hält Termux wach, `termux-boot` startet es
  nach dem Neustart des Handys.
- Den Schlüssel dauerhaft hinterlegen: die `export`-Zeile ans Ende von
  `~/.bashrc` schreiben. Er liegt dann im Klartext auf dem Handy — was in
  Ordnung ist, solange das Handy selbst gesperrt ist.
- Das gilt nur für Android. Auf dem iPhone gibt es kein Termux; dort braucht es
  den Weg über eine veröffentlichte Adresse.
- `JARVIS_PASSCODE` ist hier unnötig, solange nur `localhost` benutzt wird. Wer
  vom Notebook aus über das WLAN zugreift, sollte ihn setzen.

### Auf dem PC ausprobieren

```
npm install
ANTHROPIC_API_KEY=sk-ant-... node server/jarvis.mjs
```

Dann http://localhost:8787/jarvis/ aufrufen. Ohne Schlüssel läuft die
Oberfläche, aber jede Antwort endet im Hinweis, dass er fehlt. Wer die
Netlify-Seite mitsamt Function testen will, nimmt stattdessen `npx netlify dev`
und http://localhost:8888/jarvis/.

## Redaktionelle Hinweise

Vor dem Livegang zu klären:

- **Produktauswahl gegenlesen.** Die Empfehlungen nennen die im Gewerbe
  etablierten Geräte und Systeme (Festool, Mirka, Flex, Makita, Knauf, Rigips,
  Fermacell, Protektor, Ecophon, Heradesign u. a.). Die Seite spricht in der
  Ich-Form — jede Karte gehört daher einmal daraufhin geprüft, ob sie die
  eigene Erfahrung korrekt wiedergibt.
- **Partnerlinks eintragen** — siehe `partnerlinks.html`. Solange keine Partnerschaft
  besteht, bleiben die Links auf `href="#"` und als „Partnerlink folgt“ gekennzeichnet.
- **Technische Angaben.** Achsmaße, Schraubenabstände und Profilraster sind
  branchenübliche Regelwerte; maßgeblich bleiben die Systemdatenblätter der
  Hersteller. Die Absorptionskurven sind typische Größenordnungen, keine
  Messwerte eines konkreten Produkts.
- **Newsletter.** Das Formular ist bewusst ohne Backend und meldet das dem
  Nutzer. Beim Anschluss an einen Anbieter den Hinweistext ersetzen und die
  Einwilligung nach DSGVO ergänzen.
- **Schriften lokal ausliefern** — siehe oben.
- **Impressum und Datenschutz ausfüllen und prüfen lassen.**
- **Porträtfoto.** Der Abschnitt „Über mich“ zeigt bislang ein Signet.
