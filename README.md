# Wand für Wand

Statische Website für „Wand für Wand“ — Ratgeber und Werkzeugempfehlungen für
Trockenbau, Spachteltechnik und Raumakustik.

## Struktur

Kein Build-Schritt, keine Abhängigkeiten. Die Seiten sind reines HTML, CSS und
etwas JavaScript und lassen sich von jedem Webserver oder direkt aus dem
Dateisystem ausliefern.

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
assets/css/site.css           Design-System (Tokens, Komponenten, Raster)
assets/css/schriften.css      @font-face für die selbst ausgelieferten Schriften
assets/fonts/                 Archivo und Inter als woff2, latin + latin-ext
assets/js/site.js             Navigation, Diagramm-Tooltip, Schichten-Highlight, Anfrageformular
assets/js/partnerlinks.js     Alle Partnerlink-Ziele an einer Stelle
MONETARISIERUNG.md            Wie aus der Seite Einnahmen werden — Wege, Zahlen, Reihenfolge
```

**Die Seite lädt nichts von fremden Servern.** Schriften liegen lokal, alle
Abbildungen sind handgezeichnetes Inline-SVG — keine Bilddateien, keine
Bibliotheken, keine Analysewerkzeuge, keine Cookies.

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

**Erledigt:** Die Schriften werden nicht mehr von Google geladen, sondern aus
`assets/fonts/` ausgeliefert. Damit geht keine Besucher-IP an einen Dritten und
der heikelste Abschnitt der Datenschutzerklärung entfällt.

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
