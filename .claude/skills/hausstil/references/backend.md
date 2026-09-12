# Backend für etwas, das einen Schlüssel braucht

Ein API-Schlüssel im Browser ist kein Schlüssel mehr. Wer `fetch` gegen eine
fremde API direkt aus einer HTML-Datei schreibt, hat entweder keinen Schlüssel
dabei (dann antwortet niemand) oder einen lesbaren (dann zahlt Damaso für
Fremde). Deshalb steht bei jedem solchen Vorhaben ein eigener Endpunkt davor.

## Aufbau

```
server/core.mjs                     Systemprompt, Prüfung, Aufruf an die Modell-API
netlify/edge-functions/<name>.ts    dünne Hülle fürs Netz, Schlüssel aus Netlify.env
server/<name>.mjs                   dünne Hülle für lokal, Schlüssel aus process.env
```

Der Kern liegt als reines JavaScript (`.mjs`) vor, damit ihn beide Seiten laden
können. Ein Systemprompt an zwei Stellen driftet garantiert auseinander; deshalb
steht er genau einmal im Kern.

## Drei Dinge, die hier bereits Zeit gekostet haben

Sie sehen alle gleich aus — „es lief, dann war die Antwort komisch" — und haben
völlig verschiedene Ursachen. In dieser Reihenfolge prüfen:

**1. Eine normale Function schneidet nach rund 26 Sekunden ab.** Keine
Fehlermeldung, kein Ereignis, der Text endet mitten im Wort. Für alles, was
streamt, gehört der Endpunkt in `netlify/edge-functions/`: dort muss nur die
Kopfzeile innerhalb von 40 Sekunden raus, der Strom darf danach laufen.

**2. Eine Edge-Function darf 50 Millisekunden rechnen.** Wartezeit zählt nicht
mit, eigene Arbeit schon. Ein SDK, das jedes Token auswertet, ist damit nach
etwa sechstausend Zeichen Antwort am Ende — und schneidet wieder mitten im Wort
ab, diesmal später, was die Suche nicht leichter macht. Deshalb: **den
Antwortstrom nicht anfassen.** Der Server prüft die Anfrage, ruft die API mit
`stream: true` auf und gibt `upstream.body` unverändert zurück; die Ereignisse
wertet der Browser aus, wo niemand die Rechenzeit zählt. Nebenwirkung: kein
SDK, keine Pakete zur Laufzeit.

Die Oberfläche liest damit unmittelbar das Format der Messages-API:
`content_block_delta` mit `delta.type === "text_delta"` für den Text,
`message_delta` für `stop_reason`, `message_stop` als Abschluss, `error` für
Fehler unterwegs. **Ohne `message_stop` ist die Antwort unvollständig** — das
muss in der Oberfläche dranstehen, sonst liest sich eine halbe Antwort wie eine
ganze.

**3. Die Gegenstelle ist nicht immer api.anthropic.com.** Netlify legt Projekten
ein eigenes AI-Gateway davor: `ANTHROPIC_API_KEY` enthält dann kein `sk-ant-…`,
sondern ein langes JWT, und die Adresse steht in `ANTHROPIC_BASE_URL`. Ein SDK
liest beides von selbst aus der Umgebung — ein roher Aufruf nicht, und das
Ergebnis ist ein 401, bei dem man den Fehler beim Schlüssel sucht. Also immer
`ANTHROPIC_BASE_URL` bevorzugen, wenn gesetzt. Wenn ein 401 kommt: nicht raten,
sondern die Klartextmeldung der API ansehen (vorübergehend durchreichen, hinter
dem Zugangscode) — sie sagt „Invalid bearer token" statt „invalid x-api-key"
und nennt damit die Ursache.

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

`text/event-stream` — unverändert das, was die Modell-API schickt (siehe Punkt 2
oben). Was nicht im Strom steht, kommt als Kopfzeile mit, weil Kopfzeilen nichts
kosten:

```
x-jarvis-model         welches Modell geantwortet hat
x-jarvis-unprotected   "1", wenn kein Zugangscode gesetzt ist
```

Fehler *vor* dem Strom (kein Schlüssel, falscher Code, abgelehnte Anfrage) sind
ein gewöhnliches JSON mit passendem Statuscode — die Oberfläche kann dann noch
sinnvoll reagieren, etwa die Code-Abfrage öffnen.

Streamen ist hier kein Schmuck: eine Antwort, die wortweise erscheint, fühlt
sich an wie ein Gespräch, eine, die nach dreißig Sekunden am Stück erscheint,
wie ein Formular. Abbrechen im Browser muss den Strom auch serverseitig
abbrechen (`req.signal` weiterreichen bzw. `res.on("close")`), sonst schreibt
das Modell auf Damasos Rechnung weiter.

## Werkzeuge (nur lokal)

Soll das Modell etwas *tun* statt nur zu reden, braucht der Server eine
Schleife: fragen → Modell will ein Werkzeug → ausführen → `tool_result`
zurückgeben → Modell schreibt weiter. Das geht nur dort, wo der Server den
Strom auswerten darf — also **nicht** in der Edge-Function (50 ms Rechenzeit),
sondern im lokalen Server. `server/gespraech.mjs` macht das; nach außen sieht
es aus wie eine einzige Antwort, weil `message_stop` genau einmal gesendet wird,
wenn wirklich alles gesagt ist.

Was man dabei aus dem Strom zusammensetzen muss: Text kommt als `text_delta`,
die Werkzeug-Eingabe stückweise als `input_json_delta` (erst am Ende mit
`JSON.parse` lesen, nie auf dem Rohtext herumschneiden), Denkblöcke als
`thinking_delta` plus `signature_delta`. **Die Denkblöcke gehören unverändert
in die nächste Runde zurück**, sonst lehnt die API ab. Mehrere `tool_use`-Blöcke
einer Runde werden ausgeführt und ihre Ergebnisse zusammen in *einer* Nachricht
zurückgeschickt — getrennt verschickt gewöhnt sich das Modell ab, mehrere
Werkzeuge auf einmal zu nehmen.

Drei Regeln machen Werkzeuge am fremden Gerät erst vertretbar. Sie stehen nicht
im Prompt, sondern im Code — ein Prompt ist eine Bitte, keine Sperre:

1. **Nichts wird gelöscht**, nur in einen datierten Papierkorb verschoben.
2. **Jeder Pfad wird gegen eine Freigabeliste geprüft**, nach dem Auflösen von
   `..`. Heimatverzeichnis und Systemordner sind gesperrt.
3. **Das schreibende Werkzeug nimmt keine Dateiliste entgegen.** Es sucht selbst
   nach dem, was eindeutig weg kann. Damit kann auch ein Dateiname, der wie eine
   Anweisung klingt, nichts auslösen — das ist der eigentliche Angriffsweg bei
   Werkzeugen, die fremde Daten sehen.

Prüfen lässt sich die ganze Schleife ohne Modell: `scripts/mock-anthropic.mjs`
spielt eine Werkzeug-Runde nach, wenn die Anfrage `tools` mitschickt
(`MOCK_WERKZEUG` und `MOCK_EINGABE` bestimmen, was aufgerufen wird). Damit
lassen sich auch die Abweisungen testen — etwa ein Werkzeugaufruf auf `/etc`.

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
