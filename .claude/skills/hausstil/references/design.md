# Gestaltung

## Tokens

Beide Oberflächen benutzen dieselbe Palette. Sie steht in `:root` — in
`assets/css/site.css` für den Ratgeber, in `jarvis/style.css` für die App.

| Token | Wert | Wofür |
| --- | --- | --- |
| `--ink` | `#16283D` | Schrift, dunkle Flächen, Kopfzeile |
| `--ink-soft` | `#4A5C70` | Nebentext, feine Linien |
| `--paper` | `#F3EEE1` | Grundfläche — Papier, nicht Weiß |
| `--card` | `#FFFDF8` | Karten und Blasen auf dem Papier |
| `--line` | `#DCD4BE` | Ränder |
| `--accent` | `#D9631F` | Die orange Libellenblase. Sparsam. |
| `--accent-soft` | `#F3DAC4` | Hinterlegungen, Code-Auszeichnung |
| `--danger` | `#B3402A` | Fehler, Abbrechen |

Das Bild dahinter: Werkstattpapier, Bleistift, eine Wasserwaage mit oranger
Blase. Orange ist der Zeiger — wenn alles orange ist, zeigt nichts mehr.

Die drei Diagrammfarben des Ratgebers (`--serie-1/2/3`) sind gegen
Helligkeitsband, Chroma-Untergrenze, Farbfehlsichtigkeit und Kontrast geprüft.
Wer sie tauscht, prüft erneut — und behält die direkte Beschriftung der Kurven
bei, damit Farbe nie das einzige Unterscheidungsmerkmal ist.

## Schrift

Der Ratgeber lädt Archivo und Inter von Google. Das ist die eine bekannte
Datenschutzbaustelle des Projekts (steht so im README): die IP-Adresse der
Besucher geht ohne Einwilligung an Google. Die saubere Lösung ist, die Dateien
lokal auszuliefern.

Neue eigenständige Apps laden **keine** externen Schriften. Systemschriftstapel,
damit die App offline vollständig funktioniert und niemand mitliest. Jarvis macht
es so.

## Muster, die hier gelten

- **Inline-SVG statt Bilddateien.** Alle Abbildungen sind gezeichnet, nicht
  fotografiert. Das hält das Repo klein, funktioniert offline und lässt sich mit
  CSS einfärben und animieren.
- **Mobil zuerst.** Alles wird am Telefon benutzt. Feste Breite höchstens
  480 px, `100dvh` statt `100vh`, `env(safe-area-inset-*)` in Kopf- und Fußzeile.
- **Eingabefelder nie unter 16 px Schriftgröße.** iOS zoomt sonst beim Fokus
  hinein und die Seite steht schief.
- **`prefers-reduced-motion` abfangen.** Animationen sind Beiwerk; wer sie
  abgestellt hat, bekommt sie nicht.
- **Sichtbarkeit über Klassen schalten, nicht über `hidden` an SVG-Elementen.**
  `hidden` ist eine Eigenschaft von HTML-Elementen; bei einem `<svg>` setzt
  `el.hidden = true` still eine wirkungslose Eigenschaft, und beide Symbole
  stehen nebeneinander im Knopf. Das hat hier schon einmal Zeit gekostet.
- **Zustand am Wurzelelement.** Ein `data-state` am Container, CSS reagiert
  darauf. Kein Animationscode in JavaScript.
- **Beim Umfärben eines Knopfes auch `:hover` mitnehmen.** Sonst steht die
  Schrift auf dem Hover-Hintergrund in derselben Farbe wie der Hintergrund und
  das Symbol verschwindet — auf dem Telefon unsichtbar, am Notebook peinlich.

## Texte

Kurze Sätze. Zahlen mit Einheit. Keine Werbesprache. Wo die Seite in der
Ich-Form spricht, ist es Damasos Stimme — dann gehört jede fachliche Aussage
noch einmal von ihm gegengelesen, und das steht auch so im README.
