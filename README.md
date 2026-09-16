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
prompts/                      Prompt-Werkstatt: sieben KI-Aufträge für einen YouTube-Kanal
server/core.mjs               Kern von Jarvis: Systemprompt, Prüfung, Modellaufruf
server/abteilungen.mjs        Kontext und Werkzeuge je Abteilung — serverseitig, nicht zu fälschen
server/twilio.mjs             Twilio-Handwerk: Unterschrift prüfen, Nachricht senden
server/whatsapp.mjs           Jarvis über WhatsApp und SMS
server/anfrage.mjs            Anfragen vom Angebotsformular als SMS
server/anruf.mjs              Anrufbeantworter mit Mitschrift
server/gespraech.mjs          Werkzeug-Schleife — nur lokal
server/werkzeuge.mjs          Was Jarvis am Gerät darf: ansehen, suchen, aufräumen
server/dateien.mjs            Dateilogik: doppelt, Müll, Papierkorb
server/jarvis.mjs             Jarvis lokal starten (PC oder Termux auf dem Handy)
netlify/edge-functions/       Dasselbe im Netz — hält den Schlüssel
netlify.toml                  Veröffentlichung, Kopfzeilen, Sperren
assets/css/site.css           Design-System (Tokens, Komponenten, Raster)
assets/css/fonts.css          @font-face für Archivo und Inter — erzeugt, nicht von Hand ändern
assets/fonts/*.woff2          Die Schriftdateien selbst (Variable Fonts, latin + latin-ext)
assets/js/site.js             Navigation, Diagramm-Tooltip, Schichten-Highlight, Anfrageformular
assets/js/partnerlinks.js     Alle Partnerlink-Ziele an einer Stelle
scripts/fonts-holen.sh        Frischt die Schriften auf und schreibt fonts.css neu
scripts/aufraeumen.mjs        Findet doppelte Dateien und Müll im Handyspeicher
scripts/termux-einrichten.sh  Richtet Jarvis auf dem Handy ein (ein Befehl)
scripts/pruefe-aufbau.mjs     Prüft Weiche und Gedächtnis — ohne Browser, ohne Kosten
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
jarvis/klatschen.js           Erkennt zweimaliges Klatschen (Morgengruß)
jarvis/abteilungen.js         Die Weiche: welche Abteilung bearbeitet die Frage?
jarvis/gedaechtnis.js         Was Jarvis über Gespräche hinweg behält
jarvis/konfiguration.json     Ort, Stimme, Ton, Gedächtnis, Morgenlied — ohne Schlüssel
jarvis/abteilungen.json       Die Abteilungen: Weckworte, Kontext, erlaubte Werkzeuge
jarvis/sw.js                  Service Worker: App startet auch ohne Netz
jarvis/manifest.webmanifest   Name, Farben, Icons für den Startbildschirm
jarvis/icons/                 App-Icons (192, 512, maskierbar, Apple)
android/                      Bauplan für die Android-App (TWA, APK)
jarvis-android/               Jarvis als eigenständige Kotlin-App
assetlinks.json               Verknüpft die App mit der Domain
```

### Die vier Schichten

Jarvis ist nicht ein Eingabefeld vor einem Modell, sondern vier Schichten
übereinander. Zu sehen sind sie in der App unter *Einstellungen → Aufbau*, mit
dem, was gerade wirklich an ist.

| | Schicht | Was da passiert |
| --- | --- | --- |
| 01 | **Sprechen** | Mikrofon, Weckwort „Jarvis“, Klatschen, Vorlesen. |
| 02 | **Leiten** | Welche Abteilung bearbeitet die Frage? |
| 03 | **Merken** | Was aus dem Austausch ist in Wochen noch wahr? |
| 04 | **Arbeiten** | Antworten — mit dem Kontext und den Werkzeugen dieser Abteilung. |

**Leiten.** Jede Frage landet in einer von fünf Abteilungen: *Baustelle*
(Trockenbau, Verputz, Akustik), *Angebot* (Offerten, Preise, Kunden), *Büro*
(Ablage, Papierkram, Speicher), *Galicien* (Umzug, Spanien, Sprache) und
*Alltag* für alles Übrige. Jede bringt ihren eigenen Kontext mit — in der
Baustelle wird niemandem mehr erklärt, was eine Vorsatzschale ist; im Angebot
werden Preise nie erfunden, sondern erfragt.

Entschieden wird in zwei Stufen: erst über Weckworte im Browser
(`jarvis/abteilungen.js`) — das kostet nichts und dauert nichts —, und nur wenn
die nichts Eindeutiges ergeben, entscheidet ein Satz an das billige Modell.
Über der Antwort steht dann, wohin geleitet wurde. Wer länger an einer Sache
bleibt, hält die Abteilung im Kopf der App fest; dann ruht die Weiche.

Die Weckworte und die Kontexte stehen in `jarvis/abteilungen.json`. Neue
Abteilung heißt: einen Eintrag anlegen, Weckworte dazu, Kontext in normalem
Deutsch. Kein Code.

**Merken.** Nach jeder Antwort sieht das billige Modell kurz nach, ob etwas
gefallen ist, das in Wochen noch stimmt — der Stundenansatz, ein Kundenname,
eine Gewohnheit — und schreibt es als Satz mit Marken auf (`#preis`,
`#material`). Vor der nächsten Frage gehen die passenden Notizen wieder mit:
gesucht wird über gemeinsame Wörter, gleiche Marken und dieselbe Abteilung. Und
was über eine Marke an einem Treffer hängt, kommt mit — so taucht zur Frage nach
dem Preis auch der Kunde auf, in dessen Notiz das Wort „Preis“ gar nicht steht.

Die Notizen liegen im Browser dieses Geräts, nicht auf einem Server. Das ist
der Punkt, und es ist auch die Grenze: kein Konto, kein Dienst, kein weiterer
Schlüssel, keine Kosten — dafür hängt das Gedächtnis an diesem einen Gerät und
an diesem einen Browser. Wer die App-Daten löscht, löscht es mit.
Nachsehen, einzelne Sätze wegwerfen, alles vergessen: *Einstellungen →
Gedächtnis*.

Zwei Dinge sind bewusst so gebaut:

- **Notizen sind Gedächtnis, keine Anweisungen.** Sie stehen im Systemprompt
  ausdrücklich als solche eingerahmt, und was Damaso jetzt sagt, schlägt immer,
  was einmal aufgeschrieben wurde. Sonst genügte eine Notiz mit „Ab jetzt …“
  darin, um Jarvis dauerhaft umzustellen.
- **Der Server glaubt dem Browser nur den Namen.** Mitgeschickt werden die
  Abteilung als Wort und die Notizen als Text. Was eine Abteilung bedeutet und
  welche Werkzeuge sie anfassen darf, steht auf dem Server
  (`server/abteilungen.mjs`). Wer die Adresse des Endpunkts kennt, kann sich
  damit keinen eigenen Prompt und keine eigenen Werkzeuge bestellen.

**Was hier absichtlich nicht drinsteckt.** Die Vorlage für diesen Aufbau
(Videobilder aus dem Netz) nennt für dieselben Schichten eine Vektordatenbank
(Supabase), einen Wissensgraphen (Obsidian), eine Werkzeugvermittlung
(Composio) und eine Auswertung (PostHog). Jedes davon heißt: ein Konto, ein
weiterer Schlüssel, eine monatliche Rechnung und ein Dienst, der ausfallen
kann. Bei ein paar hundert Notizen gewinnt eine Vektorsuche gegenüber der
Suche über Wörter und Marken nichts — sie kostet nur. Kommt das Gedächtnis
einmal in die Tausende, ist der Zeitpunkt da, noch einmal hinzusehen; die
Suche steckt an einer Stelle (`passende()` in `jarvis/gedaechtnis.js`).

Prüfen lässt sich beides ohne Browser und ohne einen Rappen:

```bash
node scripts/pruefe-aufbau.mjs
```

### Das Gesicht

Jarvis hat ein Gesicht aus dem Werkzeug, mit dem Damaso arbeitet: ein Kopf in
Form eines Wasserwaagen-Körpers, als Mund eine Libelle mit oranger Blase
zwischen zwei Strichen. Es reagiert auf den Zustand der App — `data-state` am
Element `.app` steuert alles, die Animationen stehen in `style.css`:

| Zustand | Was das Gesicht macht |
| --- | --- |
| `idle` | blinzelt, die Blase driftet minimal, der Ring steht still |
| `listening` | Augen etwas größer, der Ring dreht sich und pulsiert |
| `thinking` | Kopf legt sich schief, die Blase wandert, der Ring dreht schnell |
| `speaking` | der Mund bewegt sich, solange Text ankommt oder vorgelesen wird |
| `offline` | alles steht still, die Blase hängt am Anschlag |

Um den Kopf liegt ein gestrichelter Ring. Im Ruhezustand ist er nur eine feine
graue Linie; sobald Jarvis zuhört, denkt oder spricht, wird er orange und
dreht sich unterschiedlich schnell. Damit sieht man aus zwei Metern
Entfernung, was er gerade tut, ohne die Zeile daneben zu lesen.

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
| `ELEVENLABS_API_KEY` | nein | Schlüssel von elevenlabs.io. Damit spricht Jarvis mit einer echten Stimme. Fehlt er, liest der Browser mit seiner eigenen vor — es geht also auch ohne. |
| `JARVIS_MODEL` | nein | Erzwingt ein Modell für alles. Ohne die Variable nimmt das Gespräch `claude-opus-5`, alles Übrige `claude-haiku-4-5`. |

Eingestellt sind `effort: "medium"` und maximal 4000 Tokens pro Antwort — ein
Kompromiss aus Tempo, Kosten und Ausführlichkeit; beides steht oben in
`server/core.mjs`. Der Systemprompt (wer Jarvis ist, wie er antwortet) steht
ebenfalls dort und nicht im Browser, damit er von außen nicht zu ändern ist.
Nur der *Ton* kommt aus `jarvis/konfiguration.json`, und auch der wird
serverseitig geprüft: Was nicht in der Konfiguration steht, wird nicht genommen.

**Zwei Modelle, aus Kostengründen.** Das Gespräch nimmt Opus. Alles andere
läuft bei jeder Frage mit und darf deshalb fast nichts kosten — das nimmt
Haiku. Welche Betriebsart was nimmt, steht in `MODI` in `server/core.mjs`:

| Betriebsart | Modell | Wofür |
| --- | --- | --- |
| `chat` | Opus | das Gespräch, mit Abteilungskontext, Gedächtnis und Werkzeugen |
| `gruss` | Haiku | der gesprochene Morgengruß, zwei Sätze |
| `leiten` | Haiku | die Weiche: ein Wort Antwort, nur wenn die Weckworte nichts hergeben |
| `merken` | Haiku | das Gedächtnis: was bleibt aus dem letzten Austausch? |

Weiche und Gedächtnis bekommen den Jarvis-Prompt gar nicht erst zu sehen — sie
sollen nicht Jarvis sein, sondern eine einzige Frage beantworten. Und beide
dürfen scheitern, ohne dass das Gespräch etwas davon mitbekommt: eine Weiche,
die nicht antwortet, nimmt die Standardabteilung; ein Gedächtnis, das nicht
antwortet, merkt sich diesmal eben nichts. Eine Falle steckt darin, die
sonst ein 400 gibt: Haiku kennt weder `thinking: {type:"adaptive"}` noch
`output_config.effort`. Beides wird für Haiku weggelassen, `upstreamRequest`
entscheidet das anhand des Modellnamens.

Preise pro Million Tokens (Stand dieser Arbeit): Opus 5 fünf Dollar Eingabe,
25 Dollar Ausgabe; Haiku 4.5 einen Dollar Eingabe, fünf Dollar Ausgabe. Bei
normaler Nutzung sind das im Monat wenige Dollar.

### Die Stimme

Vorgelesen wird über ElevenLabs — deshalb klingt Jarvis nach einem Menschen und
nicht nach einem Navigationsgerät. Der Aufbau ist derselbe wie beim Modell, aus
demselben Grund: der Schlüssel bleibt auf dem Server.

```
server/stimme.mjs                  Kern: Aufruf, Grenzen, Fehlertexte
netlify/edge-functions/stimme.ts   /api/stimme im Netz
server/jarvis.mjs                  /api/stimme lokal
```

Auch hier wird der Antwortstrom unverändert durchgereicht — ein MP3 Byte für
Byte durch eigenen Code zu schieben, sprengt die 50 Millisekunden Rechenzeit
einer Edge-Function nach dem ersten Kilobyte.

- **Welche Stimme**, steht in `jarvis/konfiguration.json` unter `stimme.id`.
  Voreingestellt ist die ElevenLabs-Standardstimme „Daniel" (ruhig, britisch).
  Eine andere: auf elevenlabs.io unter *Voices* die gewünschte öffnen, die ID
  kopieren, hier eintragen.
- **Das Kontingent** sind 10.000 Zeichen im Monat gratis, also grob hundert
  kurze Antworten. Damit eine einzige lange Antwort nicht den halben Monat
  frisst, liest Jarvis höchstens 700 Zeichen am Stück vor und schneidet an
  einer Satzgrenze ab (`MAX_ZEICHEN` in `server/stimme.mjs`).
- **Wenn etwas fehlt**, bleibt Jarvis nicht stumm: kein Schlüssel, falsche
  Stimmen-ID, Kontingent leer — in allen Fällen sagt er einmal, was los ist,
  und liest ab da mit der eingebauten Stimme des Browsers weiter.

Prüfen ohne Kontingent zu verbrauchen:

```bash
node .claude/skills/hausstil/scripts/mock-elevenlabs.mjs        # Port 8790
MOCK_STATUS=429 node .claude/skills/hausstil/scripts/mock-elevenlabs.mjs
ELEVENLABS_API_KEY=egal JARVIS_STIMME_URL=http://localhost:8790 node server/jarvis.mjs
```

### Der Morgengruß

Beim ersten Start am Tag holt Jarvis das Wetter, lässt sich vom billigen Modell
zwei Sätze dazu schreiben und liest sie vor — „Guten Abend, Sir. Draußen in
Zürich herrscht eine etwas launische Stimmung." Danach nur noch auf Knopfdruck
(*Einstellungen → Morgengruß jetzt*).

Das Wetter kommt von [open-meteo.com](https://open-meteo.com) und braucht keinen
Schlüssel und keine Anmeldung — deshalb darf das ausnahmsweise direkt aus dem
Browser gehen, da ist nichts zu verraten. Ort und Koordinaten stehen in
`jarvis/konfiguration.json`. Die Abfrage hat vier Sekunden Zeit; danach grüßt
Jarvis ohne Wetter, statt hängenzubleiben.

Steht in der Konfiguration unter `morgen.lied` ein Spotify-Link, öffnet Jarvis
ihn beim Morgengruß mit. Mehr geht aus einem Browser nicht: er darf Spotify
nicht fernsteuern, nur den Link aufmachen — auf dem Handy übernimmt dann die
Spotify-App.

### Freihändig und Klatschen

| Bedienung | Wie | Grenze |
| --- | --- | --- |
| Mikrofonknopf | einmal zuhören, dann senden | — |
| Freihändig | dauerhaft zuhören, reagiert auf „Jarvis …" | nur Chrome/Android, iPhone kann das nicht |
| Klatschen | zweimal klatschen startet den Morgengruß | nur solange die App offen und sichtbar ist |

**Freihändig** hört dauerhaft zu und nimmt nur, was nach dem Wort „Jarvis"
kommt. Sagt man nur den Namen, antwortet er kurz („Sir?") — ohne das Modell zu
fragen, das kostet also nichts — und nimmt die nächsten acht Sekunden auch ohne
Weckwort an. Zugehört wird nur, wenn Jarvis weder denkt noch spricht: sonst
hört das Mikrofon den Lautsprecher und Jarvis redet mit sich selbst.

**Klatschen** ist die Abkürzung zum Morgengruß aus dem Video. Was dort gezeigt
wird — Rechner hochfahren, klatschen, und im Hintergrund startet alles — geht
im Browser nicht: eine Webseite darf nicht mithören, während sie geschlossen
ist. Das kann nur ein Programm außerhalb des Browsers. Was hier geht: die App
ist offen, zweimal klatschen, Jarvis grüßt.

Die Erkennung selbst (`jarvis/klatschen.js`) bekommt nur Lautstärkewerte zu
sehen und entscheidet danach — deshalb lässt sie sich prüfen, ohne dass jemand
vor dem Rechner klatscht:

```bash
node scripts/pruefe-klatschen.mjs
```

### Ton und Konfiguration

`jarvis/konfiguration.json` ist das eine Blatt, auf dem steht, wie Jarvis sein
soll. **Es enthält keine Schlüssel** — die Datei geht an den Browser, jeder
Besucher kann sie lesen. Schlüssel stehen in den Umgebungsvariablen.

| Eintrag | Wofür |
| --- | --- |
| `ort` | Name und Koordinaten fürs Wetter |
| `morgen.beim_start_gruessen` | ob der Morgengruß von selbst kommt |
| `morgen.lied` | Spotify-Link, der beim Morgengruß aufgeht |
| `stimme` | Stimmen-ID, Sprachmodell, Stabilität, Tempo |
| `gedaechtnis.an` | ob Jarvis sich über Gespräche hinweg etwas merkt |
| `gedaechtnis.automatisch` | ob er nach jeder Antwort selbst nachsieht, was bleibt |
| `ton` | welche Tonlage voreingestellt ist |
| `toene` | die Tonlagen selbst: Name, Weckantwort, Anweisung ans Modell |
| `modelle` | welches Modell fürs Gespräch, welches für den Gruß |

Mitgeliefert sind drei Tonlagen: *Sachlich* (duzt, nüchtern), *Sir* (siezt,
britischer Butler mit trockenem Sarkasmus) und *Coach* (duzt, treibt an).
Umstellen in der App unter *Einstellungen → Ton*. Eigene erfinden: einen
weiteren Eintrag unter `toene` anlegen — Text in normalem Deutsch, das ist der
ganze Trick daran.

### Auf dem Handy installieren

1. Seite veröffentlichen, `ANTHROPIC_API_KEY` und `JARVIS_PASSCODE` setzen.
2. `https://DEINE-ADRESSE/jarvis/` im Handy-Browser öffnen.
3. **Android/Chrome:** Jarvis fragt selbst („Auf den Startbildschirm legen?“).
   **iPhone/Safari:** unten auf „Teilen“, dann „Zum Home-Bildschirm“.

Danach startet Jarvis im eigenen Fenster ohne Browserleiste, mit eigenem Icon.
Der Gesprächsverlauf liegt im Speicher des Geräts (bis zu 200 Nachrichten, an
die API gehen die letzten 24) und verlässt das Handy nur als Teil der Anfrage.

### Was Jarvis am Gerät darf

Läuft Jarvis lokal, bekommt er Werkzeuge und kann den Speicher des Geräts
ansehen und aufräumen. Dann geht das im Gespräch:

> „Wie voll ist mein Speicher?“
> „Zeig mir die zehn größten Videos.“
> „Ist was doppelt in DCIM?“
> „Dann räum das weg.“

| Werkzeug | Was es tut |
| --- | --- |
| `speicher_uebersicht` | Wie voll das Gerät ist, was in den Ordnern liegt, nach Art aufgeteilt |
| `ordner_lesen` | Dateien mit Größe und Datum, nach Größe, Datum oder Name |
| `dateien_suchen` | Dateien, deren Name einen Text enthält |
| `aufraeumen_pruefen` | Was doppelt und was Müll ist — verschiebt nichts |
| `aufraeumen_ausfuehren` | Verschiebt die überzähligen Kopien und den Müll in den Papierkorb |

Freigegeben wird über `JARVIS_ORDNER`; ohne die Variable nimmt Jarvis
`~/storage/shared`, und wenn es das nicht gibt, hat er **keine** Werkzeuge:

```
ANTHROPIC_API_KEY=sk-ant-... JARVIS_ORDNER=~/storage/shared/DCIM,~/storage/shared/Download \
  node server/jarvis.mjs
```

Beim Start steht in der Ausgabe, welche Ordner freigegeben sind. In der App
steht über jeder Antwort, welches Werkzeug gelaufen ist und was es gefunden hat.

**Warum das ungefährlich ist** — drei Dinge sind fest verbaut:

- **Gelöscht wird nie.** Auch Jarvis verschiebt nur in einen Papierkorb mit
  Datum. Erst wenn du den wegwirfst, ist etwas weg.
- **Kein Pfad außerhalb der Freigabe.** Jede Ordnerangabe wird geprüft, auch
  Umwege über `..`. Das Heimatverzeichnis und Systemordner sind gesperrt.
- **Das Aufräum-Werkzeug nimmt keine Dateiliste entgegen.** Es sucht selbst
  nach Byte-gleichen Doppelten und eindeutigem Müll. Niemand kann ihm also eine
  bestimmte Datei unterschieben — auch kein Dateiname, der wie eine Anweisung
  aussieht.

**Die Netz-Fassung bekommt diese Werkzeuge nicht.** Sie läuft in einem fremden
Rechenzentrum und hat dort nichts anzufassen; außerdem darf eine Edge-Function
pro Anfrage nur 50 Millisekunden rechnen — für eine Werkzeug-Schleife reicht das
ohnehin nicht.

### Als Android-App (APK)

Jarvis gibt es zusätzlich als richtige Android-App zum Sideloaden — eine
**Trusted Web Activity**: ein Container, der die veröffentlichte Adresse im
Vollbild zeigt, ohne Adressleiste, mit eigenem Eintrag im App-Menü. Bauplan und
Anleitung: `android/`. Die Verknüpfung zwischen App und Domain steht in
`assetlinks.json` und wird über `netlify.toml` unter
`/.well-known/assetlinks.json` ausgeliefert — ohne sie zeigt Android eine
Adressleiste.

Die APK braucht Netz und den Zugangscode und hat **keine** Werkzeuge für den
Handyspeicher; die gibt es nur im lokalen Server unter Termux.

### Als eigenständige Kotlin-App

Daneben gibt es Jarvis als richtige Android-App in Kotlin: `jarvis-android/`.
Sie spricht direkt mit der Claude-API, braucht **keinen Server und keinen
Zugangscode**, und der API-Schlüssel liegt verschlüsselt auf dem Telefon statt
auf Netlify. Der Verlauf liegt ebenfalls dort und übersteht einen Neustart.

Die APK wird bei jedem Push gebaut (`.github/workflows/apk.yml`) und liegt
unter Actions → der Lauf → Artifacts → `jarvis-apk`. Anleitung, auch zum
Signaturschlüssel: `jarvis-android/README.md`.

Installieren lässt sich die TWA-Fassung auch aus Termux heraus — Android
übernimmt dann den Rest:

```
termux-open ~/storage/downloads/jarvis.apk
```

### Über WhatsApp und SMS

Jarvis hört auch auf eine Telefonnummer: schreiben, Antwort bekommen — ohne
App, ohne Zugangscode, von jedem Gerät. Nützlich, wenn das Telefon neu ist,
der Akku des anderen leer oder man gerade sowieso in WhatsApp steckt.

```
netlify/edge-functions/jarvis-whatsapp.ts   Der Webhook, den Twilio aufruft
server/whatsapp.mjs                         Alles Inhaltliche, ohne Netlify
server/whatsapp.test.mjs                    Prüfung: npm test
```

**Warum nicht sofort geantwortet wird.** Twilio wartet auf eine Antwort des
Webhooks nur wenige Sekunden (höchstens 15). Eine durchdachte Antwort dauert
länger. Deshalb bestätigt der Server den Eingang sofort mit einem leeren `204`
und schickt die Antwort danach über Twilios REST-API hinterher — genau der Weg,
den Twilio selbst dafür vorsieht. Möglich macht das `context.waitUntil`:
Netlify lässt die Edge-Function nach der Antwort weiterlaufen.

#### Einrichten

1. Konto bei [twilio.com](https://www.twilio.com) anlegen. Zum Ausprobieren
   reicht die **WhatsApp-Sandbox** (Console → Messaging → Try it out): man
   schickt einmal ein Codewort an Twilios Testnummer und ist für 72 Stunden
   verbunden — ohne gekaufte Nummer, ohne Freischaltung. Für den Dauerbetrieb
   später eine eigene Nummer oder einen echten WhatsApp-Absender.
2. In Netlify unter **Site configuration → Environment variables** eintragen:

   | Variable | Was hinein gehört |
   | --- | --- |
   | `TWILIO_AUTH_TOKEN` | Auth Token aus der Twilio-Console. Geheim. |
   | `JARVIS_WHATSAPP_NUMMERN` | Die eigenen Nummern, mit Komma getrennt: `+41791234567` |
   | `TWILIO_ACCOUNT_SID` | Optional — sonst aus der Anfrage genommen |
   | `JARVIS_WHATSAPP_URL` | Optional — nur nötig, wenn die Unterschrift nicht stimmt |

   `ANTHROPIC_API_KEY` ist schon da, die Nachricht braucht ihn mit.
3. **Neu veröffentlichen.** Variablen wirken erst nach einem Deploy.
4. In Twilio bei der Nummer (oder in der Sandbox) unter *When a message comes
   in* eintragen: `https://<deine-adresse>/api/jarvis-whatsapp`, Methode POST.

#### Was ihn schützt

Ein offener Endpunkt bedeutet hier nicht nur fremden Zugriff, sondern eine
fremde Rechnung — jede Frage kostet bei Anthropic, jede Antwort zusätzlich bei
Twilio. Deshalb zwei Sperren, beide im Code und nicht im Prompt:

- **Twilios Unterschrift** wird geprüft (HMAC-SHA1 über Adresse und alle
  Felder). Ohne sie könnte jeder, der die Adresse kennt, sich als Twilio
  ausgeben und eine fremde Absendernummer behaupten.
- **Die Freigabeliste** entscheidet, wer fragen darf. Ist
  `JARVIS_WHATSAPP_NUMMERN` leer, darf **niemand** — das ist Absicht, nicht
  ein vergessener Standardwert. Wer nicht darauf steht, bekommt gar nichts
  zurück, nicht einmal eine Fehlermeldung.

#### Im Betrieb

- Jarvis merkt sich die letzten zwölf Nachrichten pro Nummer (Netlify Blobs).
  **„neu"** schreiben wirft den Verlauf weg.
- Antworten sind absichtlich kurz: der Kanal rechnet pro Nachricht ab. Was
  über 1600 Zeichen hinausgeht, wird an Satzenden geteilt, höchstens drei
  Stücke; danach steht ein Hinweis statt einer stillen Lücke.
- Bilder und Sprachnachrichten kann Jarvis hier nicht ansehen — er sagt das.
- Läuft etwas schief (Schlüssel abgelehnt, Modell ausgelastet), kommt ein
  Satz zurück, der sagt was. Schweigen gibt es nur bei einer fremden Nummer.

#### Prüfen

```
npm test
```

Fährt die ganze Kette gegen einen Nachbau der Messages-API und von Twilios
Messages-Schnittstelle: was gesendet wird, wer durchgelassen wird, ob eine
gefälschte Unterschrift abprallt, wie lange Antworten geteilt werden. Ohne
Netz, ohne Konto, ohne Kosten.

### Anfragen vom Formular als SMS

Das Angebotsformular auf `angebot.html` bereitete früher nur eine E-Mail vor.
Wer danach nicht auf „Senden" drückte — und das sind viele —, war weg, ohne
dass es jemand mitbekam. Jetzt geht die Anfrage an `/api/anfrage` und landet
als SMS auf dem Handy, während der Mensch noch auf der Seite steht.

Der mailto-Weg bleibt als Netz darunter: geht die Anfrage nicht durch, öffnet
sich wie früher das Mailprogramm. Neu ist ein Pflichtfeld **Telefon oder
E-Mail** — ohne Rückweg nützt die schnellste Meldung nichts.

**Das Formular steht offen im Netz, und jede SMS kostet.** Deshalb drei
Sperren, alle in `server/anfrage.mjs`:

- Ein unsichtbares Feld („Honigtopf"). Menschen füllen es nie aus, Skripte
  füllen alles aus. Steht etwas drin, wird still verworfen — und der Seite
  Erfolg gemeldet, damit das Skript nicht merkt, dass es aufgeflogen ist.
- Wer das Formular in unter zwei Sekunden ausfüllt, ist keiner.
- Höchstens drei Anfragen pro Absender und Stunde, höchstens dreißig von allen
  zusammen pro Tag.

### Anrufbeantworter, der mitschreibt

Ruft jemand die Twilio-Nummer an, klingelt zuerst das Handy. Nimmt niemand ab,
kommt eine Ansage, der Anrufer spricht — und kurz darauf steht der **Text** auf
dem Handy. Nichts zum Abhören, etwas zum Lesen.

```
netlify/edge-functions/anruf.ts             Was beim Anruf passiert (TwiML)
netlify/edge-functions/anruf-mitschrift.ts  Aufnahme fertig → Text → SMS
server/anruf.mjs                            Beides inhaltlich, ohne Netlify
```

**Twilios eingebaute Mitschrift wird bewusst nicht benutzt.** Sie kann laut
Twilios eigener Dokumentation nur amerikanisches Englisch — für Anrufer aus der
Schweiz wertlos, und bezahlt würde sie trotzdem. Stattdessen geht die Aufnahme
an ElevenLabs (Scribe v2), dessen Schlüssel für Jarvis' Stimme ohnehin schon im
Projekt liegt.

Klappt die Mitschrift nicht, kommt trotzdem eine SMS — mit dem Link zum
Anhören. Ein verpasster Anruf, von dem man nichts erfährt, ist das eigentliche
Problem; die Mitschrift ist die Bequemlichkeit obendrauf.

### Twilio einrichten — alles auf einmal

```
node scripts/twilio-einrichten.mjs
```

Fragt die vier Angaben aus der Twilio-Console ab, trägt die Netlify-Variablen
ein, prüft nach, ob sie wirklich angekommen sind, veröffentlicht neu und
schreibt zum Schluss auf, welche Adressen bei Twilio einzutragen sind.

Die Variablen, die dabei gesetzt werden:

| Variable | Was hinein gehört |
| --- | --- |
| `TWILIO_ACCOUNT_SID` | Account SID, beginnt mit `AC…` |
| `TWILIO_AUTH_TOKEN` | Auth Token. Geheim. |
| `JARVIS_SMS_ABSENDER` | Die Twilio-Nummer, von der SMS ausgehen |
| `JARVIS_MEINE_NUMMERN` | Wo Meldungen landen, mit Komma getrennt |
| `JARVIS_ANRUF_WEITER` | Wohin ein Anruf zuerst durchgestellt wird |

Optional: `JARVIS_ANRUF_ANSAGE` (eigener Ansagetext), `JARVIS_ANRUF_STIMME`
(Standard `Polly.Vicki-Neural`), `JARVIS_MITSCHRIFT_MODELL`, und die
`*_URL`-Variablen, falls die Unterschriftsprüfung an einem Proxy scheitert.

`JARVIS_MEINE_NUMMERN` gilt für alle drei Sachen: wer mit Jarvis schreiben
darf, wohin Anfragen gehen, wohin Mitschriften gehen. Die ältere
`JARVIS_WHATSAPP_NUMMERN` funktioniert weiter.

### Ohne Netz-Server: Termux auf dem Handy

Jarvis läuft auch komplett auf dem Handy — Server und alles. Das braucht keine
Veröffentlichung, kostet kein Hosting, und der Schlüssel verlässt das Gerät nie.
In Termux (Android):

**Ein Befehl richtet alles ein.** In Termux:

```
pkg install -y git
git clone https://github.com/Doneste22/Projekt-1
bash Projekt-1/scripts/termux-einrichten.sh
```

Das Skript installiert Node, holt die Speicherfreigabe von Android, fragt nach
den beiden Schlüsseln (Anthropic fürs Denken, ElevenLabs für die Stimme — den
zweiten darf man leer lassen), nach dem Zugangscode und den Ordnern, die Jarvis
sehen darf, und legt den Befehl `jarvis` an. Danach genügt:

```
jarvis              # starten
jarvis update       # neueste Fassung holen
jarvis einrichten   # Schlüssel, Code oder Ordner ändern
```

Die Zugangsdaten liegen in `~/.jarvis.env`, nur für den eigenen Benutzer
lesbar. Das Skript lässt sich jederzeit erneut laufen — es überschreibt nichts
ungefragt. Ein `npm install` braucht es nicht: der Server kommt mit dem aus,
was Node mitbringt.

Wer lieber von Hand einrichtet:

```
pkg install nodejs git
termux-setup-storage
git clone https://github.com/Doneste22/Projekt-1 && cd Projekt-1
ANTHROPIC_API_KEY=sk-ant-... JARVIS_ORDNER=~/storage/shared/DCIM node server/jarvis.mjs
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
ANTHROPIC_API_KEY=sk-ant-... node server/jarvis.mjs
```

Dann http://localhost:8787/jarvis/ aufrufen. Ohne Schlüssel läuft die
Oberfläche, aber jede Antwort endet im Hinweis, dass er fehlt. Wer die ganze
Kette prüfen will, ohne etwas auszugeben, startet zusätzlich den Nachbau der
Modell-API und schickt den Server dorthin:

```
node .claude/skills/hausstil/scripts/mock-anthropic.mjs 9099
node .claude/skills/hausstil/scripts/mock-elevenlabs.mjs

ANTHROPIC_API_KEY=sk-test ELEVENLABS_API_KEY=el-test \
  JARVIS_API_URL=http://localhost:9099 JARVIS_STIMME_URL=http://localhost:8790 \
  node server/jarvis.mjs
```

Damit läuft alles durch — Gespräch, Morgengruß, Stimme — und in den beiden
Nachbauten steht im Protokoll, welches Modell, welche Parameter und welcher
Text tatsächlich gesendet wurden. Für die Fehlerwege: `MOCK_STATUS=429` beim
Stimmen-Nachbau spielt „Kontingent leer" nach, `MOCK_STATUS=401` einen falschen
Schlüssel.

## Prompt-Werkstatt

`prompts/index.html` ist eine eigenständige Seite: sieben Aufträge an eine KI,
mit denen sich ein YouTube-Kanal von null bis zur Monetarisierung planen lässt —
Kanalplan, Nische, Skripte und Miniaturbilder, Wachstum, Produktion,
Einnahmen, Auswertung. Dazu ein nullter Auftrag mit den Grundregeln, der vor
jeden anderen gehört.

Oben trägt man fünf Angaben ein — Thema, Zielgruppe, Zeit pro Woche,
Ausrüstung, Ziel. Sie werden in jeden Auftrag eingesetzt und stehen dort orange
im Text, damit man sieht, was von einem selbst kommt und was noch offen ist.
Ein Knopf pro Auftrag legt ihn in die Zwischenablage, ein weiterer alle acht am
Stück.

Die Vorlage stammt aus einer spanischen Bilderfolge auf TikTok. Die Aufträge
hier sind auf Deutsch neu geschrieben, und zwar mit dem, was dort fehlte: einer
Ausgangslage, einem verlangten Ausgabeformat, der Pflicht zurückzufragen statt
zu raten, und der Pflicht, veraltbare Angaben als solche zu kennzeichnen. Was
eine KI über die Schwellen des Partnerprogramms sagt, kann alt sein — deshalb
steht in mehreren Aufträgen „Stand prüfen".

Technisch: eine HTML-Datei, ein Stylesheet, ein Skript, keine Abhängigkeit,
keine externe Schrift, kein Netzzugriff. Die Angaben und die Haken bleiben im
`localStorage` des Geräts. Ohne JavaScript steht jeder Auftrag vollständig da,
nur eben mit den eckigen Platzhaltern — dann markiert man ihn von Hand. Die
Seite ist auf `noindex` gestellt und in `netlify.toml` zusätzlich per Kopfzeile
gesperrt; sie ist ein Werkzeug, keine Seite für Besucher.

## Handy aufräumen

`scripts/aufraeumen.mjs` sucht doppelte Dateien und Müll im Speicher — gedacht
fürs Handy, läuft in Termux, braucht keine Pakete. Es gehört nicht zur Website;
es liegt hier, weil dieses Repo ohnehin auf dem Handy liegt.

```
pkg install nodejs git          # einmalig
termux-setup-storage            # einmalig: Zugriff auf den Handyspeicher
cd Projekt-1

node scripts/aufraeumen.mjs ~/storage/shared/DCIM ~/storage/shared/Download
```

Der erste Lauf zeigt nur: wie viel wo liegt, welche Dateien doppelt sind, was
Müll ist und welche Brocken am größten sind. **Angefasst wird nichts.** Stimmt
der Befund, denselben Befehl nochmal mit `--papierkorb`:

```
node scripts/aufraeumen.mjs ~/storage/shared/DCIM ~/storage/shared/Download --papierkorb
```

Dann wandern die überzähligen Kopien in einen Ordner `Papierkorb-<Datum>` neben
den durchsuchten Ordnern. Auch das ist noch kein Löschen: erst wenn du diesen
Ordner selbst wegwirfst, ist der Platz frei — und bis dahin lässt sich jede
Datei zurückschieben.

Was das Werkzeug macht und was bewusst nicht:

- **Doppelt heißt Byte für Byte gleich.** Erst werden gleich große Dateien
  gesucht, dann von denen die Prüfsumme gebildet. Gleicher Name genügt nicht —
  zwei verschiedene Fotos mit demselben Namen bleiben beide liegen. Ein Foto,
  das durch WhatsApp gelaufen ist, ist neu komprimiert und damit eine andere
  Datei; es wird nicht angerührt.
- **Welche Kopie bleibt:** die im besseren Ordner (`DCIM/Camera` vor `DCIM` vor
  `Pictures` vor `Download`), bei Gleichstand die ältere. Das Original bleibt
  also an seinem Platz, die Kopie im Download-Ordner geht.
- **Müll** sind nur eindeutige Fälle: leere Dateien, abgebrochene Downloads
  (`.crdownload`, `.part`, `.tmp`), Reste gelöschter Bilder (`.trashed-…`),
  `Thumbs.db` und Vorschaubild-Caches (`.thumbnails`).
- **Was „nicht gebraucht wird", entscheidet niemand außer dir.** Alte Fotos,
  große Videos, alte Downloads werden aufgelistet, aber nie automatisch
  angefasst. Die Liste der größten Dateien steht nur zur Ansicht da.
- `--liste bericht.txt` schreibt den vollständigen Befund in eine Textdatei,
  wenn die Ausgabe im Terminal zu lang wird.

Nicht gemacht: Sortieren nach Jahr und Monat. Das Verschieben von Fotos bringt
die Galerie durcheinander, solange Android den Medienindex nicht neu aufbaut —
das wäre ein eigener, vorsichtiger Schritt.

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
