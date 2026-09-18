#!/bin/bash
# Legt beim Start jeder Sitzung das Gedächtnis (.claude/gedaechtnis.md) in den
# Kontext. Schlägt der Versuch fehl, startet die Sitzung trotzdem — ein
# fehlendes Gedächtnis ist ärgerlich, eine kaputte Sitzung schlimmer.
set -uo pipefail

verzeichnis="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
datei="$verzeichnis/.claude/gedaechtnis.md"

[ -r "$datei" ] || exit 0
command -v node >/dev/null 2>&1 || exit 0

node -e '
const fs = require("fs");
const text = fs.readFileSync(process.argv[1], "utf8").trim();
if (!text) process.exit(0);
process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext:
      "Gedächtnis dieses Projekts (.claude/gedaechtnis.md). Am Ende der " +
      "Sitzung fortschreiben, wenn etwas entschieden wurde oder etwas nicht " +
      "ging.\n\n" + text
  }
}));
' "$datei" || exit 0
