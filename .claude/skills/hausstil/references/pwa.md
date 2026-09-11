# Aufs Handy bringen

Ziel ist immer dasselbe: ein Symbol auf dem Startbildschirm, eigenes Fenster,
keine Browserleiste. Das geht ohne App-Store, wenn vier Dinge stimmen.

## 1. Eigener Ordner

Die App bekommt einen eigenen Unterordner (`jarvis/`). Der Service Worker
erhält damit automatisch den Geltungsbereich `/jarvis/` und fasst den Rest der
Seite nicht an. Liegt er im Wurzelverzeichnis, kontrolliert er alles.

## 2. manifest.webmanifest

Relative Pfade (`"start_url": "./"`, `"scope": "./"`), damit die App unter
jeder Adresse funktioniert. Dazu `display: "standalone"`, `background_color`
und `theme_color` auf `--ink`, `lang: "de"`.

## 3. Service Worker

- Gerüst beim Installieren in den Cache, alte Caches beim Aktivieren löschen,
  `skipWaiting()` und `clients.claim()`, damit eine neue Fassung beim nächsten
  Start wirklich ankommt.
- Seitenaufrufe: erst Netz, dann Cache — sonst sieht Damaso nach einer Änderung
  tagelang die alte Fassung.
- Dateien: aus dem Cache, im Hintergrund erneuern.
- `/api/` niemals zwischenspeichern. Eine gecachte Modellantwort ist ein Fehler,
  kein Gewinn.

## 4. Icons und Meta-Angaben

Nötig sind 192, 512, ein maskierbares 512 (Motiv auf etwa 75 % verkleinern, weil
Android rund beschneidet) und ein Apple-Touch-Icon 180. Erzeugen mit
`scripts/make-icons.mjs` — das Skript nimmt eine SVG-Datei und rendert die
vier PNGs.

Dazu im `<head>`:

```html
<meta name="theme-color" content="#16283D">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="…">
```

`black-translucent` setzt den Inhalt unter die Statusleiste — nur zusammen mit
`padding-top: max(…, env(safe-area-inset-top))` in der Kopfzeile benutzen.

## Installieren anbieten

Android/Chrome schickt `beforeinstallprompt`: abfangen, aufheben, eine eigene
Leiste zeigen, beim Tippen `prompt()` aufrufen. iOS/Safari schickt gar nichts —
dort stattdessen den Weg beschreiben („Teilen → Zum Home-Bildschirm"). Erkennen
lässt sich das an `navigator.userAgent` und daran, dass
`window.navigator.standalone` bzw. `matchMedia('(display-mode: standalone)')`
noch nicht gesetzt ist. Ein einmal weggeklickter Hinweis bleibt weg
(`localStorage`).

## Was der Nutzer wissen muss

Eine installierte App ohne Server antwortet nicht. Das Gerüst startet (der
Service Worker hat es), aber jede Anfrage läuft in den Fehlerhinweis. Wer die
App lokal betreibt (Termux), muss den Server laufen lassen — das gehört ins
README und in die Antwort an Damaso, nicht ins Kleingedruckte.
