# Für Claude

Kurznotizen zu diesem Repo. Wie hier gebaut wird — Sprache, Farben,
Abhängigkeiten, Backend-Muster, Veröffentlichung — steht ausführlich im Skill
`.claude/skills/hausstil/`; der wird bei Arbeit in diesem Repo herangezogen.

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
