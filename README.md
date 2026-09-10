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

## Redaktionelle Hinweise

Vor dem Livegang zu klären:

- **Produktauswahl gegenlesen.** Die Empfehlungen nennen die im Gewerbe
  etablierten Geräte und Systeme (Festool, Mirka, Flex, Makita, Knauf, Rigips,
  Fermacell, Protektor, Ecophon, Heradesign u. a.). Die Seite spricht in der
  Ich-Form — jede Karte gehört daher einmal daraufhin geprüft, ob sie die
  eigene Erfahrung korrekt wiedergibt.
- **Partnerlinks.** Alle Produktlinks stehen auf `href="#"` und sind mit
  `data-affiliate="pending"` sowie sichtbarem Hinweis „Partnerlink folgt“
  markiert. Beim Eintragen der echten Links den Hinweis entfernen.
- **Technische Angaben.** Achsmaße, Schraubenabstände und Profilraster sind
  branchenübliche Regelwerte; maßgeblich bleiben die Systemdatenblätter der
  Hersteller. Die Absorptionskurven sind typische Größenordnungen, keine
  Messwerte eines konkreten Produkts.
- **Newsletter.** Das Formular ist bewusst ohne Backend und meldet das dem
  Nutzer. Beim Anschluss an einen Anbieter den Hinweistext ersetzen und die
  Einwilligung nach DSGVO ergänzen.
- **Impressum und Datenschutzerklärung fehlen** und sind für einen
  gewerblichen Auftritt Pflicht — sie brauchen echte Anbieterdaten.
- **Porträtfoto.** Der Abschnitt „Über mich“ zeigt bislang ein Signet.
