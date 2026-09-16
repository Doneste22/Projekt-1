#!/usr/bin/env python3
"""Mark LIV („Jarvis") auf dem eigenen Rechner einrichten.

    python scripts/mark-einrichten.py

Macht in einem Durchgang das, was im Video einzeln von Hand gemacht wird:
Code holen, entpacken, `setup.py` laufen lassen, Startdatei anlegen. Danach
genügt ein Doppelklick auf die Startdatei.

Läuft auf Windows, macOS und Linux und braucht nichts ausser Python selbst —
keine zusätzlichen Pakete, keine Werkzeugkette.

Das Skript lässt sich jederzeit erneut laufen: ein vorhandener Ordner wird
nie ungefragt überschrieben.

Mark LIV ist fremde Software von FatihMakes und steht unter CC BY-NC 4.0 —
erlaubt ist damit nur die private, nicht-gewerbliche Nutzung.
"""
import os
import platform
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

# Quelle. Der Kanal lädt neue Ausgaben unter neuem Namen hoch (LII, LIII, LIV …);
# wer auf eine neuere wechseln will, ändert genau diese Zeile.
REPO = "FatihMakes/Mark-LIV"
ZWEIG = "main"
ZIP_URL = f"https://codeload.github.com/{REPO}/zip/refs/heads/{ZWEIG}"

MIN_PY = (3, 11)   # darunter läuft Mark nicht
MAX_PY = (3, 13)   # darüber ist es vom Hersteller nicht geprüft

WINDOWS = platform.system() == "Windows"


def sag(text):
    print(f"\n\033[1m{text}\033[0m")


def zeile(text):
    print(f"  {text}")


def fehler(text):
    print(f"\n\033[31m{text}\033[0m", file=sys.stderr)


def frage(text, vorgabe=""):
    antwort = input(f"  {text} [{vorgabe}]: ").strip() if vorgabe else input(f"  {text}: ").strip()
    return antwort or vorgabe


def ja(text):
    return not input(f"  {text} [J/n]: ").strip().lower().startswith("n")


def pruefe_python():
    """Die häufigste Stolperstelle zuerst — und mit dem Hinweis, der hilft."""
    v = sys.version_info[:2]
    if v < MIN_PY:
        fehler(f"Dieses Python ist {v[0]}.{v[1]} — Mark braucht mindestens "
               f"{MIN_PY[0]}.{MIN_PY[1]}.")
        zeile("Hole dir eine neuere Version von python.org.")
        if WINDOWS:
            zeile("Wichtig beim Installieren: den Haken bei")
            zeile("„Add python.exe to PATH“ setzen — sonst findet Windows")
            zeile("Python später nicht, und nichts davon läuft.")
        sys.exit(1)
    if v > MAX_PY:
        zeile(f"Hinweis: Python {v[0]}.{v[1]} ist neuer als die "
              f"{MAX_PY[0]}.{MAX_PY[1]}, mit der Mark geprüft ist.")
        zeile("Das geht meistens gut. Klemmt ein Paket, nimm 3.13.")
    print(f"  Python {v[0]}.{v[1]} — passt.")


def hole_zip(ziel_datei):
    """Lädt das Archiv und zeigt dabei, dass etwas passiert."""
    def fortschritt(block, blockgroesse, gesamt):
        geladen = block * blockgroesse
        if gesamt > 0:
            print(f"\r  {geladen * 100 // gesamt:3d} %  "
                  f"({geladen // 1_048_576} von {gesamt // 1_048_576} MB)", end="")
        else:
            print(f"\r  {geladen // 1_048_576} MB", end="")

    try:
        urllib.request.urlretrieve(ZIP_URL, ziel_datei, fortschritt)
    except urllib.error.HTTPError as e:
        print()
        fehler(f"Der Download wurde abgelehnt (Code {e.code}).")
        zeile(f"Sieh im Browser nach, ob es {REPO} noch gibt:")
        zeile(f"https://github.com/{REPO}")
        zeile("Heisst die neue Ausgabe anders, ändere REPO oben im Skript.")
        sys.exit(1)
    except urllib.error.URLError as e:
        print()
        fehler(f"Keine Verbindung zu GitHub: {e.reason}")
        sys.exit(1)
    print()


def entpacke(zip_datei, ziel):
    """Entpackt und hebt den einen Ordner aus dem Archiv heraus.

    GitHub packt alles in einen Unterordner mit Zweignamen (Mark-LIV-main).
    Den will niemand im Pfad haben.
    """
    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(zip_datei) as archiv:
            archiv.extractall(tmp)
        inhalt = [p for p in Path(tmp).iterdir() if p.is_dir()]
        if len(inhalt) != 1:
            fehler("Das Archiv sieht anders aus als erwartet.")
            sys.exit(1)
        shutil.move(str(inhalt[0]), str(ziel))


def lege_startdatei_an(ordner):
    """Damit der nächste Start ein Doppelklick ist und kein Terminal."""
    if WINDOWS:
        datei = ordner / "Jarvis starten.cmd"
        datei.write_text(
            "@echo off\r\n"
            "rem Startet Jarvis (Mark LIV).\r\n"
            f'cd /d "{ordner}"\r\n'
            f'"{sys.executable}" main.py\r\n'
            "pause\r\n",
            encoding="utf-8",
        )
    else:
        datei = ordner / "jarvis-starten.sh"
        datei.write_text(
            "#!/usr/bin/env bash\n"
            "# Startet Jarvis (Mark LIV).\n"
            f'cd "{ordner}" || exit 1\n'
            f'"{sys.executable}" main.py\n',
            encoding="utf-8",
        )
        datei.chmod(0o755)
    return datei


def main():
    sag("Jarvis (Mark LIV) einrichten")
    zeile(f"Quelle: https://github.com/{REPO}")
    zeile("Fremde Software von FatihMakes, CC BY-NC 4.0 —")
    zeile("erlaubt ist die private Nutzung, nicht die gewerbliche.")

    sag("1. Python prüfen")
    pruefe_python()

    sag("2. Wohin soll es?")
    ziel = Path(frage("Ordner", str(Path.home() / "Jarvis-Mark"))).expanduser()
    if ziel.exists():
        zeile(f"{ziel} gibt es schon.")
        if not ja("Ordner löschen und neu holen?"):
            zeile("Abgebrochen — nichts verändert.")
            return
        shutil.rmtree(ziel)
    ziel.parent.mkdir(parents=True, exist_ok=True)

    sag("3. Code holen")
    with tempfile.TemporaryDirectory() as tmp:
        zip_datei = Path(tmp) / "mark.zip"
        hole_zip(zip_datei)
        entpacke(zip_datei, ziel)
    zeile(f"Liegt in {ziel}")

    sag("4. Bibliotheken installieren")
    zeile("Das dauert und schreibt viel Text — einfach laufen lassen.")
    ergebnis = subprocess.run([sys.executable, "setup.py"], cwd=ziel)
    if ergebnis.returncode != 0:
        fehler("Die Installation ist nicht sauber durchgelaufen.")
        zeile("Versuch es von Hand noch einmal:")
        zeile(f'  cd "{ziel}"')
        zeile(f'  "{sys.executable}" setup.py')
        sys.exit(1)

    startdatei = lege_startdatei_an(ziel)

    sag("Fertig. Was jetzt noch fehlt:")
    zeile("1. Einen Gemini-Schlüssel holen — kostenlos:")
    zeile("   https://aistudio.google.com/app/apikey")
    zeile("2. Jarvis starten:")
    zeile(f"   {startdatei.name}  (im Ordner {ziel})")
    zeile("3. Beim ersten Start fragt er nach dem Schlüssel")
    zeile("   und nach deinem Betriebssystem.")
    print()
    zeile("Den Schlüssel gibst du niemandem weiter. Er liegt danach")
    zeile(f"im Klartext in {os.path.join('config', 'api_keys.json')} —")
    zeile("wer an deinen Rechner kommt, kann ihn lesen und auf deine")
    zeile("Rechnung Anfragen stellen.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n  Abgebrochen.")
        sys.exit(1)
