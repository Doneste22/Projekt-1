# Gedächtnis

Was eine neue Sitzung nicht von selbst sieht. Kurz halten: Erledigtes löschen.
Was dauerhaft gilt, gehört in `CLAUDE.md` oder den Hausstil-Skill.

## Zustand

- Hauptlinie `claude/wand-fuer-wand-site-p6psyv`. Nicht löschen, nicht
  enthalten: `claude/setup-pm-4a2y52`, `claude/video-anschauen-ejtvd9`.
- Eingeschaltet: `security-guidance` (~0 Token), `session-report` (~70),
  `claude-code-setup` (~139) und `ponytail` (7 885 Zeichen — Skills plus Hook,
  Stufe `full`). Feste Last dadurch 13 855 statt 5 970. `/ponytail lite`
  drosselt, `/ponytail off` schaltet ab. Marktplatz noch nicht im Repo
  verdrahtet, siehe README. `task-observer` wurde am 18.09.2026 wieder entfernt — 1 046 Zeichen
  pro Sitzung ohne mitzulaufen. In der Historie unter `669067d`.
- Website ohne Build-Schritt, `publish = "."`. Gebaut wird nur die
  Edge-Function für Jarvis.
- Offen vor dem Livegang: Domain, E-Mail, Partnerlinks, Porträtfoto — Liste im
  README unter „Redaktionelle Hinweise", Reihenfolge in `MONETARISIERUNG.md`.

## Wartet auf Damaso (aus älteren Sitzungen, Stand 18.09.2026)

Vier Sitzungen stecken fest, weil etwas im Browser erledigt werden muss. Kommt
eine davon zur Sprache, hier nachsehen statt neu herleiten:

- **Netlify-Anbindung.** `jarvis-damaso` → Project configuration → Build &
  deploy → Link repository → GitHub → `Doneste22/Projekt-1`, dann
  Branch `claude/wand-fuer-wand-site-p6psyv`, Publish `.`, Build und Functions
  leer lassen.
- **ElevenLabs-Schlüssel.** Der hinterlegte ist maskiert (`*8H…`). Neuen unter
  elevenlabs.io → Settings → API Keys anlegen, mit dem Kopiersymbol kopieren
  (nicht den angezeigten Text), bei Netlify als `ELEVENLABS_API_KEY` setzen.
  Muss mit `sk_` anfangen, nicht mit `*`.
- **Kraken-Ausweisprüfung** für den Trading-Assistenten (Zweig
  `claude/video-anschauen-ejtvd9`). Bis dahin nur Papierhandel.
- **Partnerlink-Ziele** für 29 Produkte. (Die Frage schweizerisch oder deutsch
  ist am 18.09.2026 entschieden: Schweiz. Rechtstexte bleiben nach Schweizer
  Recht und DSG, die Schreibweise ist auf ss umgestellt.)

## Was hier schon Zeit gekostet hat

- **Der Browser dieser Sandbox kommt nicht an die Live-Adresse** (Proxy).
  Brücke: lokaler Server, der die Dateien ausliefert und `/api/…` per `curl`
  an die Live-Adresse weiterreicht.
- **Netlify-Umgebungsvariablen wirken erst nach einem neuen Deploy.** Sonst
  hält man einen offenen Endpunkt für geschützt.
- **Als geheim markierte Variablen sind beim Anlegen schon stillschweigend
  verschwunden.** Danach die Liste abfragen und hinsehen.
- **Chromes `--screenshot` liefert unten weisse Bilder.** `playwright-core` mit
  gesetztem `viewport` und `clip` nehmen.
- **TikTok ist gesperrt** (403 beim Verbindungsaufbau, nicht umgehbar). Video
  als Datei hochladen, mit `npm i ffmpeg-static` zerlegen: `fps=1` und
  `tile=4x3` ergibt lesbare Kontaktbögen. `drawtext` fehlt in dem Build.
- **Fremden Code ins Projekt kopieren und Hooks eintragen** lehnt die
  Schutzschaltung ab, bis Damaso ausdrücklich zustimmt. Nicht über Umwege
  versuchen — fragen.
- **Pluginkosten gibt es fertig**, kein eigenes Messskript nötig:
  `claude plugin details <name>@<markt>` nennt die Always-on-Token. Es geht nur
  für installierte Plugins — also auf `--scope user` installieren (ändert das
  Repo nicht), messen, wieder deinstallieren.
- **Globales Suchen-und-Ersetzen frisst den eigenen Abschnitt.** Beim Umstellen
  auf ss wurde auch der README-Abschnitt umgeschrieben, der die Regel erklärt —
  aus „ss statt scharfem s" wurde „ss statt ss". Solche Stellen vorher
  umformulieren, damit sie das Zeichen gar nicht brauchen.
- **Plugins vor dem Einschalten messen.** Beschreibungen stehen in *jeder*
  Sitzung im Kontext, auch ungenutzt. `netlify-skills` kostete so 25 302
  Zeichen und flog raus. Faustregel: Skills kosten immer, Hooks nur im
  Einsatz.

- **Zweites Video vom selben Kanal (19.09.2026) ist abgearbeitet:** ponytail,
  OmniRoute, Graphify, Agent Skills — gemessen; drei abgelehnt, ponytail auf
  Damasos Ansage doch eingeschaltet. Zahlen im README. Nicht neu bewerten.

## Regel

Am Ende einer Sitzung, in der etwas entschieden wurde oder etwas nicht ging:
hier eine Zeile. Sonst nichts.
