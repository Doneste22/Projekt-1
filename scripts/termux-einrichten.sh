#!/usr/bin/env bash
#
# Jarvis auf dem Handy einrichten — für Termux.
#
#   bash scripts/termux-einrichten.sh
#
# Installiert Node und Git, holt das Projekt, fragt nach Schlüssel, Zugangscode
# und den Ordnern, die Jarvis sehen darf, und legt den Befehl `jarvis` an.
# Danach genügt es, `jarvis` zu tippen.
#
# Das Skript lässt sich jederzeit erneut laufen: es überschreibt nichts
# ungefragt und aktualisiert eine vorhandene Einrichtung.

set -u

REPO_URL="https://github.com/Doneste22/Projekt-1"
ENV_DATEI="$HOME/.jarvis.env"
STANDARD_ORDNER="$HOME/storage/shared/DCIM,$HOME/storage/shared/Download"

sag()    { printf '\n\033[1m%s\033[0m\n' "$*"; }
zeile()  { printf '  %s\n' "$*"; }
fehler() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; }

frage() {                       # frage <text> <vorgabe>
  local text="$1" vorgabe="${2:-}" antwort
  if [ -n "$vorgabe" ]; then
    read -r -p "  $text [$vorgabe]: " antwort || true
    printf '%s' "${antwort:-$vorgabe}"
  else
    read -r -p "  $text: " antwort || true
    printf '%s' "$antwort"
  fi
}

ja() {                          # ja <frage>  → 0 wenn ja
  local antwort
  read -r -p "  $1 [J/n]: " antwort || true
  case "${antwort:-j}" in [nN]*) return 1 ;; *) return 0 ;; esac
}

# ---------- 1. Ist das überhaupt Termux? ----------

if [ -z "${PREFIX:-}" ] || [ ! -d "$PREFIX/bin" ]; then
  fehler "Das hier ist kein Termux."
  zeile "Das Skript richtet Jarvis auf dem Handy ein und braucht dafür Termux."
  zeile "Auf dem Rechner startest du Jarvis stattdessen direkt:"
  zeile "  ANTHROPIC_API_KEY=sk-ant-... node server/jarvis.mjs"
  exit 1
fi

sag "Jarvis einrichten"
zeile "Das dauert ein paar Minuten. Fragen kannst du mit Enter bestätigen."

# ---------- 2. Node und Git ----------

sag "1/6  Node und Git"
if command -v node >/dev/null && command -v git >/dev/null; then
  zeile "schon da: $(node --version), $(git --version | cut -d' ' -f3)"
else
  zeile "werden installiert …"
  pkg install -y nodejs git >/dev/null 2>&1 || {
    fehler "Die Installation ist gescheitert. Versuch es von Hand:"
    zeile "pkg update && pkg install nodejs git"
    exit 1
  }
  zeile "fertig: $(node --version)"
fi

# ---------- 3. Zugriff auf den Handyspeicher ----------

sag "2/6  Zugriff auf den Speicher"
if [ -d "$HOME/storage/shared" ]; then
  zeile "steht bereits"
else
  zeile "Android fragt gleich nach Erlaubnis — bitte zustimmen."
  termux-setup-storage || true
  sleep 3
  if [ -d "$HOME/storage/shared" ]; then
    zeile "erteilt"
  else
    zeile "noch nicht da. Ohne Zugriff läuft Jarvis, sieht aber keine Dateien."
    zeile "Du kannst später „termux-setup-storage“ nachholen."
  fi
fi

# ---------- 4. Projekt holen ----------

sag "3/6  Projekt holen"
if [ -d "$HOME/Projekt-1/.git" ]; then
  zeile "ist schon da, hole die neueste Fassung …"
  git -C "$HOME/Projekt-1" pull --quiet || zeile "Abrufen fehlgeschlagen — die vorhandene Fassung bleibt."
else
  git clone --quiet "$REPO_URL" "$HOME/Projekt-1" || {
    fehler "Das Projekt ließ sich nicht holen. Netz prüfen und nochmal versuchen."
    exit 1
  }
  zeile "geholt nach ~/Projekt-1"
fi

# ---------- 5. Schlüssel, Code, Ordner ----------

sag "4/6  Zugangsdaten"
ALT_KEY=""
[ -f "$ENV_DATEI" ] && ALT_KEY="$(grep -o 'ANTHROPIC_API_KEY=.*' "$ENV_DATEI" | cut -d= -f2- | tr -d '"')"

if [ -n "$ALT_KEY" ]; then
  zeile "Ein Schlüssel ist hinterlegt (…${ALT_KEY: -6})."
  if ja "Behalten?"; then KEY="$ALT_KEY"; else KEY="$(frage 'Neuer API-Schlüssel (sk-ant-…)')"; fi
else
  zeile "Den Schlüssel bekommst du auf console.anthropic.com."
  KEY="$(frage 'API-Schlüssel (sk-ant-…)')"
fi
if [ -z "$KEY" ]; then
  fehler "Ohne Schlüssel kann Jarvis nicht antworten. Abbruch."
  exit 1
fi

ALT_CODE=""
[ -f "$ENV_DATEI" ] && ALT_CODE="$(grep -o 'JARVIS_PASSCODE=.*' "$ENV_DATEI" | cut -d= -f2- | tr -d '"')"
CODE="$(frage 'Zugangscode (leer lassen = ohne)' "$ALT_CODE")"

ALT_ORDNER=""
[ -f "$ENV_DATEI" ] && ALT_ORDNER="$(grep -o 'JARVIS_ORDNER=.*' "$ENV_DATEI" | cut -d= -f2- | tr -d '"')"
zeile "Diese Ordner darf Jarvis ansehen und aufräumen — mit Komma trennen."
ORDNER="$(frage 'Ordner' "${ALT_ORDNER:-$STANDARD_ORDNER}")"

umask 077
cat > "$ENV_DATEI" <<ENV
# Zugangsdaten für Jarvis. Diese Datei gehört nur dir — nicht weitergeben.
export ANTHROPIC_API_KEY="$KEY"
export JARVIS_PASSCODE="$CODE"
export JARVIS_ORDNER="$ORDNER"
ENV
chmod 600 "$ENV_DATEI"
zeile "gespeichert in ~/.jarvis.env (nur für dich lesbar)"

# ---------- 6. Startbefehl ----------

sag "5/6  Startbefehl anlegen"
cat > "$PREFIX/bin/jarvis" <<'START'
#!/usr/bin/env bash
# Startet Jarvis. Angelegt von scripts/termux-einrichten.sh.
set -u
[ -f "$HOME/.jarvis.env" ] && . "$HOME/.jarvis.env"

case "${1:-}" in
  neu|update)
    echo "Hole die neueste Fassung …"
    git -C "$HOME/Projekt-1" pull
    exit $?
    ;;
  einrichten)
    exec bash "$HOME/Projekt-1/scripts/termux-einrichten.sh"
    ;;
esac

# Android schläfert Hintergrundprozesse ein; das hält Termux wach.
command -v termux-wake-lock >/dev/null && termux-wake-lock
trap 'command -v termux-wake-unlock >/dev/null && termux-wake-unlock' EXIT

cd "$HOME/Projekt-1" || exit 1
exec node server/jarvis.mjs
START
chmod +x "$PREFIX/bin/jarvis"
zeile "angelegt: der Befehl heißt jetzt „jarvis“"

# ---------- 7. Automatisch starten ----------

sag "6/6  Beim Einschalten starten"
if ja "Soll Jarvis starten, sobald du Termux öffnest?"; then
  if ! grep -q "# jarvis-autostart" "$HOME/.bashrc" 2>/dev/null; then
    cat >> "$HOME/.bashrc" <<'AUTO'

# jarvis-autostart
if [ -z "${JARVIS_LAEUFT:-}" ] && command -v jarvis >/dev/null; then
  export JARVIS_LAEUFT=1
  jarvis
fi
AUTO
    zeile "eingerichtet — beim nächsten Öffnen von Termux läuft er los"
  else
    zeile "war schon eingerichtet"
  fi
  zeile "Soll er auch nach einem Neustart des Handys von selbst laufen,"
  zeile "brauchst du zusätzlich die App „Termux:Boot“ aus F-Droid."
else
  zeile "übersprungen — du startest ihn mit „jarvis“"
fi

# ---------- Fertig ----------

sag "Fertig."
zeile "Starten:        jarvis"
zeile "Aktualisieren:  jarvis update"
zeile "Neu einrichten: jarvis einrichten"
echo
zeile "Läuft er, öffne im Browser:  http://localhost:8787/jarvis/"
zeile "Dort über das Menü „Zum Startbildschirm hinzufügen“ — dann hast du"
zeile "Jarvis als App, und er kommt an deine Dateien."
[ -n "$CODE" ] && zeile "Dein Zugangscode: $CODE"
echo
