# Wand für Wand

Statische Website für „Wand für Wand“ — Ratgeber und Werkzeugempfehlungen für
Trockenbau, Spachteltechnik und Raumakustik.

## Struktur

Kein Build-Schritt, keine Abhängigkeiten. Die Seiten sind reines HTML, CSS und
etwas JavaScript und lassen sich von jedem Webserver oder direkt aus dem
Dateisystem ausliefern.

```
index.html                    Startseite
ratgeber/verspachteln.html    Anleitung: Trockenbauwand verspachteln
ratgeber/akustikdecke.html    Anleitung: Akustikdecke montieren
ratgeber/werkzeug.html        Ratgeber: Werkzeug-Grundausstattung
impressum.html                Impressum — Entwurf mit Platzhaltern
datenschutz.html              Datenschutzerklärung — Entwurf mit Platzhaltern
partnerlinks.html             Interne Arbeitsliste für die Affiliate-Links
jarvis.html                   Eigenständige Chat-Oberfläche für den Assistenten „Jarvis“
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

`jarvis.html` ist eine eigenständige Einzeldatei und gehört nicht zum
Ratgeber-Auftritt — sie wird von keiner Seite verlinkt und teilt weder CSS noch
JavaScript mit dem Rest. Die Oberfläche ist für das Handy ausgelegt: Verlauf,
Spracheingabe (`SpeechRecognition`, sofern der Browser sie mitbringt) und
Vorlesefunktion (`speechSynthesis`).

Zwei Dinge liefert die Datei nicht selbst mit:

- **Das Modell.** Die Antwort kommt aus einem `POST` auf
  `https://api.anthropic.com/v1/messages` — ohne Schlüssel im Request. Direkt
  aus dem Browser eines statischen Hosts schlägt das fehl (CORS, fehlende
  Authentifizierung); die Seite zeigt dann die Fehlerblase. Sie braucht eine
  Umgebung, die diesen Aufruf serverseitig weiterreicht und dabei den API-Key
  einsetzt. Ein Schlüssel gehört nicht in diese Datei — er wäre für jeden
  Besucher lesbar.
- **Den Speicher.** Der Verlauf läuft über `window.storage`
  (`get`/`set`/`delete`), das dieselbe Umgebung bereitstellen muss. Fehlt es,
  bleibt die Oberfläche bedienbar, startet aber bei jedem Aufruf ohne Verlauf.

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
