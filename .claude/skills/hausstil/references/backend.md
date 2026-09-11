# Backend für etwas, das einen Schlüssel braucht

Ein API-Schlüssel im Browser ist kein Schlüssel mehr. Wer `fetch` gegen eine
fremde API direkt aus einer HTML-Datei schreibt, hat entweder keinen Schlüssel
dabei (dann antwortet niemand) oder einen lesbaren (dann zahlt Damaso für
Fremde). Deshalb steht bei jedem solchen Vorhaben ein eigener Endpunkt davor.

## Aufbau

```
server/core.mjs                 Systemprompt, Prüfung, Modellaufruf, Strom
netlify/functions/<name>.mts    dünne Hülle fürs Netz, Schlüssel aus Netlify.env
server/<name>.mjs               dünne Hülle für lokal, Schlüssel aus process.env
```

Der Kern liegt als reines JavaScript (`.mjs`) vor, damit ihn beide Seiten laden
können — die TypeScript-Function bündelt ihn über esbuild mit, der lokale Server
startet ihn direkt mit `node`, ohne Übersetzungsschritt. Ein Systemprompt an zwei
Stellen driftet garantiert auseinander; deshalb steht er genau einmal im Kern.

Der lokale Server ist kein Spielzeug: auf Android läuft er in Termux direkt auf
dem Telefon, und weil Chrome `localhost` als sichere Herkunft behandelt, lässt
sich die App auch von dort auf den Startbildschirm legen.

## Modellaufruf

Verbindlich ist der `claude-api`-Skill — Modell-IDs und Parameter ändern sich
schneller, als ein Repo altert; niemals aus dem Gedächtnis schreiben. Stand der
letzten Arbeit hier:

```js
client.beta.messages.stream({
  model: "claude-opus-5",
  max_tokens: 4000,
  system: SYSTEM_PROMPT,
  thinking: { type: "adaptive" },
  output_config: { effort: "medium" },   // Chat auf dem Handy: Tempo vor Tiefe
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
  messages
});
```

- `fallbacks: "default"` fängt ab, dass eine Anfrage aus Sicherheitsgründen
  abgelehnt wird: die API läuft sie serverseitig auf einem anderen Modell noch
  einmal, statt mit leeren Händen zurückzukommen.
- Kommt trotzdem `stop_reason: "refusal"` ohne Text zurück, gehört ein Satz in
  die Oberfläche, statt eine leere Blase stehen zu lassen.
- `effort` und `max_tokens` sind Stellschrauben für Kosten und Tempo und stehen
  deshalb oben im Kern, nicht verstreut im Code.

## Verlauf

Die Messages-API nimmt nur abwechselnde Rollen, beginnend und endend beim
Nutzer. Eine Begrüßung, die die Oberfläche selbst erzeugt hat, darf also nicht
mitgeschickt werden — sonst beginnt der Verlauf mit `assistant` und die Anfrage
wird abgelehnt. Zwei Sicherungen, weil eine davon irgendwann vergessen wird:
die Oberfläche markiert solche Nachrichten als lokal, und der Server wirft
führende Assistenz-Nachrichten weg.

Dazu serverseitig: Zahl der Nachrichten deckeln, Gesamtlänge deckeln. Beides
kostet sonst Geld, das niemand ausgeben wollte.

## Protokoll zur Oberfläche

`text/event-stream`, vier Ereignisse:

```
event: meta    data: {"model":"…","unprotected":true|false}
event: delta   data: {"text":"…"}
event: done    data: {"stop_reason":"end_turn"}
event: error   data: {"message":"…","status":429}
```

Streamen ist hier kein Schmuck: eine Antwort, die wortweise erscheint, fühlt
sich an wie ein Gespräch, eine, die nach zehn Sekunden am Stück erscheint, wie
ein Formular. Abbrechen im Browser muss den Strom auch serverseitig abbrechen
(`cancel()` der `ReadableStream`, bzw. `res.on("close")`), sonst schreibt das
Modell auf Damasos Rechnung weiter.

## Schutz

`ANTHROPIC_API_KEY` liegt in den Netlify-Variablen (offenbar auf Team-Ebene, er
gilt damit für neue Projekte mit). Ein Endpunkt ohne weiteren Schutz steht
offen im Netz — jeder, der die Adresse kennt, fragt auf seine Rechnung. Also:

- `JARVIS_PASSCODE`-Muster: ist die Variable gesetzt, muss der Kopf
  `x-…-passcode` stimmen, sonst 401. Die Oberfläche fragt den Code einmal ab und
  merkt ihn sich.
- Ist sie nicht gesetzt, meldet das `meta`-Ereignis `unprotected: true` und die
  Oberfläche zeigt eine sichtbare Warnung. Schweigen wäre die schlechteste
  Lösung.
