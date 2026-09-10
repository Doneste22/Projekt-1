# Wand für Wand

Statische Landingpage für „Wand für Wand“ — Ratgeber und Werkzeugempfehlungen
für Trockenbau und Akustik.

## Aufbau

Die Seite ist eine einzelne, eigenständige HTML-Datei ohne Build-Schritt:

- `index.html` — komplette Seite inklusive CSS und Inline-SVG des Wandaufbaus.
  Extern geladen werden nur die Schriften (Archivo, Inter) von Google Fonts.

## Ansehen

Datei direkt im Browser öffnen, oder lokal ausliefern:

```
python3 -m http.server 8000
```

Danach http://localhost:8000 aufrufen.

## Abschnitte

| Anker | Inhalt |
| --- | --- |
| Hero | Positionierung, zwei CTAs, Schnittzeichnung des Wandaufbaus |
| `#aufbau` | Die fünf Schichten einer Trockenbauwand |
| `#ratgeber` | Anleitungs-Teaser (Trockenbau, Akustik, Werkzeug) |
| `#empfehlungen` | Produktkarten in drei Gruppen, inkl. Werbekennzeichnung |
| `#experte` | Kurzprofil Dámaso Estévez |
| Footer | Newsletter-Anmeldung (noch ohne Backend) |

## Status

Prototyp. Offen:

- Ratgeber-Links (`href="#"`) auf echte Artikelseiten zeigen lassen
- Produktkarten: Platzhalter durch echte Partnerprodukte und Affiliate-Links ersetzen
- Newsletter-Formular an einen Anbieter anbinden (aktuell `onsubmit="return false;"`)
- Mobile Navigation (Menü ist unter 640px ausgeblendet)
- Impressum und Datenschutzerklärung
