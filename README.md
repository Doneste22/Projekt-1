# Wand für Wand

Statische Website für „Wand für Wand“ — Ratgeber und Werkzeugempfehlungen für
Trockenbau, Spachteltechnik und Raumakustik.

## Struktur

Die Seiten sind reines HTML, CSS und etwas JavaScript, ohne Build-Schritt, und
lassen sich von jedem Webserver oder direkt aus dem Dateisystem ausliefern. Auch
Jarvis und sein Server brauchen zur Laufzeit kein einziges Paket — `npm install`
ist nur für die Typprüfung beim Entwickeln nötig.

```
index.html                    Startseite
angebot.html                  Beratungsangebot mit Preisen — die verkaufende Seite
ratgeber/verspachteln.html    Anleitung: Trockenbauwand verspachteln
ratgeber/akustikdecke.html    Anleitung: Akustikdecke montieren
ratgeber/werkzeug.html        Ratgeber: Werkzeug-Grundausstattung
impressum.html                Impressum nach Schweizer Recht — Entwurf mit Platzhaltern
datenschutz.html              Datenschutzerklärung nach DSG — Entwurf mit Platzhaltern
partnerlinks.html             Interne Arbeitsliste für die Affiliate-Links
robots.txt, sitemap.xml       Für Suchmaschinen — Domain ist noch Platzhalter
jarvis/                       Jarvis: eigenständige Assistenz-App (installierbar)
server/core.mjs               Kern von Jarvis: Systemprompt, Prüfung, Modellaufruf
server/jarvis.mjs             Jarvis lokal starten (PC oder Termux auf dem Handy)
netlify/edge-functions/       Dasselbe im Netz — hält den Schlüssel
netlify.toml                  Veröffentlichung, Kopfzeilen, Sperren
assets/css/site.css           Design-System (Tokens, Komponenten, Raster)
assets/css/fonts.css          @font-face für Archivo und Inter — erzeugt, nicht von Hand ändern
assets/fonts/*.woff2          Die Schriftdateien selbst (Variable Fonts, latin + latin-ext)
assets/js/site.js             Navigation, Diagramm-Tooltip, Schichten-Highlight, Anfrageformular
assets/js/partnerlinks.js     Alle Partnerlink-Ziele an einer Stelle
scripts/fonts-holen.sh        Frischt die Schriften auf und schreibt fonts.css neu
MONETARISIERUNG.md            Wie aus der Seite Einnahmen werden — Wege, Zahlen, Reihenfolge
```

**Die Seite lädt nichts von fremden Servern.** Die Schriften Archivo und Inter
liegen als woff2 im Repository und werden über `assets/css/fonts.css` lokal
eingebunden; ohne Netz greift der System-Fallback. Alle Abbildungen sind
handgezeichnetes Inline-SVG — keine Bilddateien, keine Bibliotheken, keine
Analysewerkzeuge, keine Cookies.

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
| `#experte` | Kurzprofil Dámaso Estévez, mit Verweis auf die Beratung |
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

## Schriften

Archivo und Inter liegen als Variable Fonts im Repository — je Familie eine
Datei für `latin` und eine für `latin-ext`, zusammen rund 200 KB. Die
`@font-face`-Regeln stehen in `assets/css/fonts.css` und decken über einen
`font-weight`-Bereich alle benutzten Schnitte ab (Archivo 500–900, Inter
400–600). Jede Seite lädt zusätzlich die beiden `latin`-Dateien per
`rel="preload"` vor.

Zum Auffrischen — neue Schriftversion oder ein weiterer Schnitt:

```
scripts/fonts-holen.sh
```

Das Skript lädt von Google Fonts, legt die Dateien in `assets/fonts/` ab und
schreibt `assets/css/fonts.css` neu. Wer einen Schnitt ergänzt, ändert vorher
die Variable `ANFRAGE` im Skript. `fonts.css` selbst nicht von Hand bearbeiten —
der nächste Lauf überschreibt sie. Das Skript gehört zur Wartung; für das
Ausliefern der Seite wird es nicht gebraucht.

## Rechtliche Seiten

`impressum.html` und `datenschutz.html` sind **Entwürfe nach Schweizer Recht**.
Jede auszufüllende Stelle ist im Text rot markiert (`<span class="platzhalter">`),
beide Seiten tragen oben ein Entwurfs-Banner und stehen auf `noindex`. Am Ende
jeder Seite steht eine Prüfliste mit dem, was vor dem Livegang zu klären ist.

Grundlage sind Art. 3 Abs. 1 lit. s UWG (Anbieterkennzeichnung im elektronischen
Geschäftsverkehr) und Art. 19 ff. DSG (Informationspflicht). Beide Texte ersetzen
keine Rechtsberatung.

Ein Punkt gehört früh entschieden: Die Beratungsseite bietet ihre Leistungen
ausdrücklich auch in Deutschland und Österreich an. Richtet sich das Angebot an
EU-Kundschaft, können DDG, Widerrufsrecht und DSGVO zusätzlich greifen. Wer den
Aufwand nicht will, beschränkt die Beratung auf die Schweiz — dann ist der Satz
in `angebot.html` zu ändern. Unentschieden bleiben sollte es nicht.

**Erledigt:** Die Schriften wurden von Google Fonts gelöst und werden aus
`assets/fonts/` ausgeliefert. Damit geht keine Besucher-IP an einen Dritten, der
Abschnitt „Schriftarten“ der Datenschutzerklärung ist entsprechend umgeschrieben,
und ein Einwilligungsbanner wird dafür nicht gebraucht. Die Seite ruft überhaupt
keine fremden Server mehr auf.

## Partnerlinks

Alle Ziel-URLs stehen an **einer** Stelle: `assets/js/partnerlinks.js`. Dort ist
jede der 29 Produktkennungen mit leerem Wert vorbereitet:

```js
'festool-planex-lhs-2-225-eqi': '',
```

Sobald eine URL eingetragen ist, setzt die Seite beim Laden selbstständig

- `href` auf die Ziel-URL,
- `rel="sponsored nofollow noopener"` und `target="_blank"`,
- den Status der Karte von „Partnerlink folgt" auf **„Anzeige"**.

Damit sitzt die Werbekennzeichnung immer am bezahlten Link und kann nicht
vergessen werden. Nicht ausgefüllte Zeilen bleiben tot und gekennzeichnet — die
Seite ist also auch halb ausgefüllt jederzeit veröffentlichbar. Wie viele Karten
schon verdienen, meldet die Browserkonsole beim Laden.

`partnerlinks.html` bleibt die Arbeitsliste zum Nachschlagen: alle 29
Empfehlungen in sechs Tabellen, je Zeile Platz für Partnerprogramm und Ziel-URL,
dazu ein Sprung zur zugehörigen Karte auf der Startseite. Die Seite ist nicht
verlinkt, steht auf `noindex` und ist in `robots.txt` ausgeschlossen; sie kann
vor dem Livegang gelöscht werden.

Welche Programme in Frage kommen und was sie realistisch einbringen, steht in
[`MONETARISIERUNG.md`](MONETARISIERUNG.md).

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
und erst der Server setzt den Schlüssel ein. Es gibt zwei Server, die denselben
Kern (`server/core.mjs`) benutzen und sich für die Oberfläche gleich verhalten:
die Netlify-Edge-Function fürs Netz und `server/jarvis.mjs` für lokal.
Systemprompt, Modellwahl und Grenzen stehen einmal in `core.mjs` — wer etwas
daran ändert, ändert es für beide.

Zwei Entscheidungen, die dahinter stecken und die man sonst schmerzhaft neu
lernt:

- **Edge-Function statt normaler Function.** Eine normale Netlify-Function wird
  nach rund 26 Sekunden abgeschnitten. Eine längere Antwort brach damit mitten
  im Wort ab, ohne jede Fehlermeldung. Bei einer Edge-Function zählt nur, dass
  die Kopfzeilen innerhalb von 40 Sekunden kommen.
- **Der Server rührt den Antwortstrom nicht an.** Eine Edge-Function darf pro
  Anfrage 50 Millisekunden *rechnen*. Wartezeit zählt nicht, eigene Arbeit
  schon — und ein SDK, das jedes einzelne Token auswertet, ist nach etwa
  sechstausend Zeichen am Ende des Budgets. Deshalb reicht der Server den Strom
  unverändert durch; ausgewertet wird er im Browser, wo niemand die Rechenzeit
  zählt. Nebenwirkung: keine Pakete zur Laufzeit. Der Schlüssel steckt in den Umgebungsvariablen und taucht
nirgends im ausgelieferten Code auf — in eine HTML-Datei gehört er nicht, dort
könnte ihn jeder Besucher lesen.

Die Antwort kommt als Strom (`text/event-stream`) zurück und erscheint Wort für
Wort, statt dass man auf den ganzen Absatz wartet. Abbrechen bricht auch
serverseitig ab.

**Umgebungsvariablen** (Netlify: *Project configuration → Environment variables*):

| Variable | Pflicht | Wozu |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | ja | Schlüssel von console.anthropic.com — oder das Token, das Netlifys AI-Gateway selbst hinterlegt. |
| `ANTHROPIC_BASE_URL` | nur mit Gateway | Setzt Netlify selbst, wenn das AI-Gateway aktiv ist. Der Server benutzt die Adresse, sobald sie da ist; wer sie ignoriert, bekommt ein 401 und sucht den Fehler beim Schlüssel. |
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
export ANTHROPIC_API_KEY=sk-ant-...
node server/jarvis.mjs
```

Kein `npm install` — der Server kommt mit dem aus, was Node mitbringt.

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
ANTHROPIC_API_KEY=sk-ant-... node server/jarvis.mjs
```

Dann http://localhost:8787/jarvis/ aufrufen. Ohne Schlüssel läuft die
Oberfläche, aber jede Antwort endet im Hinweis, dass er fehlt. Wer die ganze
Kette prüfen will, ohne etwas auszugeben, startet zusätzlich den Nachbau der
Modell-API und schickt den Server dorthin:

```
node .claude/skills/hausstil/scripts/mock-anthropic.mjs 9099
ANTHROPIC_API_KEY=sk-test JARVIS_API_URL=http://localhost:9099/v1/messages \
  node server/jarvis.mjs
```

## Redaktionelle Hinweise

Vor dem Livegang zu klären — die vollständige Reihenfolge steht in
[`MONETARISIERUNG.md`](MONETARISIERUNG.md):

- **Domain eintragen.** `wandfuerwand.ch` ist ein Platzhalter und steht in
  `robots.txt`, `sitemap.xml` und den `canonical`- sowie JSON-LD-Angaben aller
  Seiten. Ein Suchen-und-Ersetzen über das Repository genügt.
- **E-Mail-Adresse eintragen** — in `angebot.html` (das Anfrageformular liest die
  Adresse aus dem Ausweichlink darunter, sie steht dort genau einmal),
  `impressum.html` und `datenschutz.html`.
- **Preise der Beratung prüfen.** CHF 90 / 180 / 240 / ab 320 sind Vorschläge,
  angesetzt zwischen Handwerker-Stundenansatz und Planerhonorar. Sie stehen in
  `angebot.html` und einmal im Textbaustein im Abschnitt „Über mich".
- **Produktauswahl gegenlesen.** Die Empfehlungen nennen die im Gewerbe
  etablierten Geräte und Systeme (Festool, Mirka, Flex, Makita, Knauf, Rigips,
  Fermacell, Protektor, Ecophon, Heradesign u. a.). Die Seite spricht in der
  Ich-Form — jede Karte gehört daher einmal daraufhin geprüft, ob sie die
  eigene Erfahrung korrekt wiedergibt.
- **Partnerlinks eintragen** — siehe oben, eine Zeile je Produkt.
- **Technische Angaben.** Achsmaße, Schraubenabstände und Profilraster sind
  branchenübliche Regelwerte; maßgeblich bleiben die Systemdatenblätter der
  Hersteller. Die Absorptionskurven sind typische Größenordnungen, keine
  Messwerte eines konkreten Produkts.
- **Newsletter.** Das Formular im Fußbereich ist bewusst ohne Backend und meldet
  das dem Nutzer. Beim Anschluss an einen Anbieter den Hinweistext ersetzen und
  die Einwilligung ergänzen — nach Art. 3 Abs. 1 lit. o UWG ist Massenwerbung per
  E-Mail ohne vorherige Einwilligung unlauter.
- **Impressum und Datenschutz ausfüllen und prüfen lassen.**
- **Porträtfoto.** Der Abschnitt „Über mich" zeigt bislang ein Signet. Für eine
  Seite, die Beratung verkauft, ist ein Gesicht mehr wert als ein Logo.

### Eine offene Frage zur Rechtschreibung

Die Seite schreibt durchgehend deutsch mit ß („Achsmaß", „Stöße"), die neuen
Rechtstexte tun das aus Konsistenzgründen auch. Für einen Schweizer Auftritt wäre
ss richtig. Die Umstellung ist mechanisch — in der Schweizer Rechtschreibung wird
ß ausnahmslos zu ss:

```
find . -name '*.html' -o -name '*.md' | xargs sed -i 's/ß/ss/g'
```

Das ist eine Entscheidung über die Ansprache, nicht über den Code: Mit ss klingt
die Seite schweizerisch, mit ß erreicht sie den grösseren deutschen Lesermarkt
ohne Stolperstelle. Die Beratung wird in Franken verkauft, die Ratgeber richten
sich an beide Märkte — deshalb ist die Frage hier notiert und nicht entschieden.
