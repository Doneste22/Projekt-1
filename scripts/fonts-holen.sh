#!/usr/bin/env bash
# Lädt Archivo und Inter von Google Fonts herunter und legt sie lokal ab.
#
# Die Website braucht dieses Skript nicht — die Schriftdateien liegen im
# Repository. Es dient dazu, sie aufzufrischen (neue Schriftversion, weiterer
# Schnitt) und schreibt dabei assets/css/fonts.css neu.
#
# Aufruf:  scripts/fonts-holen.sh
set -euo pipefail

WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ZIEL="$WURZEL/assets/fonts"
CSS="$WURZEL/assets/css/fonts.css"

# Nur die Schnitte, die site.css und die Inline-SVGs tatsächlich benutzen:
# Archivo 500/700/900, Inter 400/500/600.
ANFRAGE="family=Archivo:wght@500;700;900&family=Inter:wght@400;500;600&display=swap"

# Deutsch ist von latin abgedeckt, latin-ext fängt die übrigen europäischen
# Diakritika ab. Kyrillisch, Griechisch und Vietnamesisch entfallen.
SUBSETS="latin latin-ext"

# woff2 liefert Google nur an eine User-Agent-Kennung, die es unterstützt.
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

rm -rf "$ZIEL"
mkdir -p "$ZIEL"
ARBEIT="$(mktemp -d)"
trap 'rm -rf "$ARBEIT"' EXIT

echo "Hole Stylesheet von Google Fonts …"
curl -fsS -A "$UA" "https://fonts.googleapis.com/css2?$ANFRAGE" -o "$ARBEIT/google.css"

# Das Google-CSS ist blockweise aufgebaut: ein Kommentar mit dem Subset-Namen,
# dann der @font-face-Block. awk zieht je Block Subset, Familie, Schnittstärke,
# URL und unicode-range heraus — eine Zeile pro Block.
awk '
  /^\/\*/          { subset = $2; next }
  /font-family:/   { fam = $2; gsub(/['"'"';]/, "", fam) }
  /font-weight:/   { gew = $2; sub(/;/, "", gew) }
  /src:/           { url = $0; sub(/.*url\(/, "", url); sub(/\).*/, "", url) }
  /unicode-range:/ { bereich = $0; sub(/^ *unicode-range: */, "", bereich); sub(/;$/, "", bereich)
                     print subset "\t" fam "\t" gew "\t" url "\t" bereich }
' "$ARBEIT/google.css" > "$ARBEIT/bloecke"

# Archivo und Inter sind Variable Fonts: Google liefert für alle angefragten
# Schnitte einer Familie dieselbe Datei und pinnt den Schnitt nur über die
# font-weight-Angabe im CSS. Wir laden je Familie und Subset einmal und
# deklarieren stattdessen den Bereich vom kleinsten bis größten Schnitt.
while IFS=$'\t' read -r subset fam gew url bereich; do
  case " $SUBSETS " in *" $subset "*) ;; *) continue ;; esac
  echo "$gew" >> "$ARBEIT/gew-$fam-$subset"
  if [ ! -f "$ARBEIT/url-$fam-$subset" ]; then
    printf '%s\n%s\n' "$url" "$bereich" > "$ARBEIT/url-$fam-$subset"
  fi
done < "$ARBEIT/bloecke"

{
  echo "/* Archivo und Inter, lokal ausgeliefert — kein Aufruf an Google."
  echo " *"
  echo " * Erzeugt von scripts/fonts-holen.sh. Nicht von Hand ändern: bei der"
  echo " * nächsten Auffrischung wird diese Datei überschrieben."
  echo " *"
  echo " * Beide Familien sind Variable Fonts (Achse wght). Je Familie und Subset"
  echo " * liegt deshalb genau eine Datei, der font-weight-Bereich deckt alle"
  echo " * Schnitte ab, die die Seite benutzt. */"
} > "$CSS"

ANZAHL=0
for datei_url in "$ARBEIT"/url-*; do
  schluessel="$(basename "$datei_url")"; schluessel="${schluessel#url-}"
  fam="${schluessel%-*}"; subset="${schluessel##*-}"
  # latin-ext enthält selbst einen Bindestrich — Familie/Subset neu trennen.
  case "$schluessel" in *-latin-ext) fam="${schluessel%-latin-ext}"; subset="latin-ext" ;; esac

  url="$(sed -n '1p' "$datei_url")"
  bereich="$(sed -n '2p' "$datei_url")"
  min="$(sort -n "$ARBEIT/gew-$fam-$subset" | head -1)"
  max="$(sort -n "$ARBEIT/gew-$fam-$subset" | tail -1)"

  name="$(echo "$fam" | tr '[:upper:]' '[:lower:]')-$subset.woff2"
  echo "  $name  (wght $min–$max)"
  curl -fsS -A "$UA" "$url" -o "$ZIEL/$name"

  {
    echo
    echo "@font-face {"
    echo "  font-family: '$fam';"
    echo "  font-style: normal;"
    echo "  font-weight: $min $max;"
    echo "  font-display: swap;"
    echo "  src: url('../fonts/$name') format('woff2');"
    echo "  unicode-range: $bereich;"
    echo "}"
  } >> "$CSS"
  ANZAHL=$((ANZAHL + 1))
done

echo "Fertig: $ANZAHL Schriftdateien in assets/fonts/, assets/css/fonts.css neu geschrieben."
