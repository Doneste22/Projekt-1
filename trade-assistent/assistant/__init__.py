"""Handelsassistent — Signale rechnen, Regeln anwenden, Rechenschaft ablegen.

Kein Orakel: Jede Entscheidung entsteht aus nachvollziehbaren Indikatorwerten
und wird mitsamt ihrer Begründung protokolliert.
"""

# Diese Datei muss auch auf alten Python-Versionen lesbar bleiben — sie ist
# die erste, die geladen wird, und soll dort eine verständliche Meldung
# ausgeben statt eines Fehlers aus den Innereien. Deshalb hier bewusst keine
# moderne Schreibweise.
import sys

MINDESTVERSION = (3, 10)

if sys.version_info < MINDESTVERSION:
    raise SystemExit(
        "\n  Der Handelsassistent braucht Python {}.{} oder neuer.\n"
        "  Gefunden: Python {}.{}.{} ({})\n\n"
        "  Grund: Die Datenklassen nutzen slots=True, das gibt es erst ab 3.10.\n\n"
        "  Abhilfe:\n"
        "    Debian/Ubuntu  sudo apt install python3.11 && python3.11 -m assistant ...\n"
        "    macOS          brew install python@3.11\n"
        "    Windows        python.org/downloads, dann 'py -3.11 -m assistant ...'\n"
        "    vorhanden?     ls /usr/bin/python3.1* \n".format(
            MINDESTVERSION[0], MINDESTVERSION[1],
            sys.version_info[0], sys.version_info[1], sys.version_info[2],
            sys.executable,
        )
    )

__version__ = "0.2.0"
