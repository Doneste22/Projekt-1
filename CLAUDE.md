# Für Claude

Kurznotizen zu diesem Repo. Wie hier gebaut wird — Sprache, Farben,
Abhängigkeiten, Backend-Muster, Veröffentlichung — steht ausführlich im Skill
`.claude/skills/hausstil/`; der wird bei Arbeit in diesem Repo herangezogen.

## Gedächtnis

`.claude/gedaechtnis.md` ist das Gedächtnis dieses Projekts: was offen ist, was
schon einmal Zeit gekostet hat, wie der Stand ist. **Zu Beginn jeder Sitzung
lesen.** Am Ende einer Sitzung, in der etwas entschieden wurde oder etwas nicht
funktioniert hat, dort eine Zeile ergänzen — und Erledigtes löschen, damit die
Datei kurz bleibt.

Was dauerhaft gilt, gehört nicht ins Gedächtnis, sondern hierher oder in den
Hausstil-Skill.

## Sparsam arbeiten

Die feste Last pro Sitzung ist klein — rund 7 000 Zeichen. Teuer wird, was
*während* der Arbeit hereingeholt wird; das ist leicht das Zehnfache. Vier
Regeln, alle nachgemessen:

- **Erst das Werkzeug fragen, dann die Doku.** `claude plugin install --help`
  sind 2 214 Zeichen, die passende Doku-Seite rund 22 000 — zehnfach teurer
  für dieselbe Antwort.
- **Große Dateien gezielt lesen.** `README.md` hat 56 000 Zeichen. Erst
  `grep -n`, dann `sed -n 'a,bp'`. Nie ganz.
- **Bilder einzeln.** Ein Kontaktbogen kostet rund 1 500 Token. Aufhören,
  sobald die Frage beantwortet ist.
- **Listen filtern, bevor sie im Kontext landen.** Den Plugin-Katalog lokal
  mit `node` aus `marketplace.json` filtern (rund 2 000 Zeichen) statt die
  Katalogsuche aufzurufen (rund 18 000).

## Zweige

Entwickelt wird auf dem zugewiesenen Arbeitszweig.

**Damaso hat am 12.09.2026 dauerhaft erlaubt, den Arbeitszweig ohne Rückfrage in
die Hauptlinie `claude/wand-fuer-wand-site-p6psyv` zu ziehen** — auf seine
ausdrückliche Ansage „immer". Vorher galt: nur auf Zuruf. Also: Arbeit fertig,
geprüft, gepusht → Hauptlinie vorspulen und ebenfalls pushen, ohne zu fragen.

Was dabei weiterhin gilt:

- Vor dem Zusammenführen prüfen, dass es ein reines Vorspulen ist. Gibt es
  eigene Commits auf der Hauptlinie, ist das ein echter Merge — dann erst
  ansehen, was kollidiert, und im Zweifel fragen.
- Ein Pull Request nur, wenn er ihn verlangt.
- Zweige, die *nicht* in der Hauptlinie enthalten sind, werden nicht gelöscht.
  Aktuell draußen: `claude/setup-pm-4a2y52` (Paketmanager-Skript) und
  `claude/video-anschauen-ejtvd9` (Trading-Assistent, eigenes Programm).

## Wie er arbeitet

Damaso ist Trockenbauer, kein Entwickler, und schreibt kurz. Knappe Aufträge
(„bau mir X", „räum auf") sind vollwertige Aufträge — die Entscheidungen über
Sprache, Gestaltung und Technik sind im Hausstil-Skill schon getroffen und
müssen nicht erfragt werden. Was er wissen muss, gehört in die Antwort; was
nicht funktioniert, wird beim Namen genannt.
