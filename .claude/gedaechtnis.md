# Gedächtnis

Was eine neue Sitzung nicht von selbst sieht. Kurz halten: Erledigtes löschen,
nicht durchstreichen. Was dauerhaft gilt, gehört in `CLAUDE.md` oder in den
Hausstil-Skill, nicht hierher.

## Zustand

- Hauptlinie ist `claude/wand-fuer-wand-site-p6psyv`. Gearbeitet wird auf dem
  zugewiesenen Zweig, danach vorspulen — ohne zu fragen, so abgemacht.
- Nicht enthalten und nicht zu löschen: `claude/setup-pm-4a2y52`,
  `claude/video-anschauen-ejtvd9`.
- Vier Plugins sind in `.claude/settings.json` eingeschaltet. Der fremde Skill
  `task-observer` liegt bei, läuft aber nicht in jeder Sitzung mit.
- Die Website hat keinen Build-Schritt, `publish = "."`. Gebaut wird nur die
  Edge-Function für Jarvis.

## Offen (Stand 18.09.2026)

- Domain `wandfuerwand.ch` ist überall Platzhalter.
- E-Mail-Adresse fehlt in `angebot.html`, `impressum.html`, `datenschutz.html`.
- ß oder ss — nicht entschieden. Begründung beider Seiten im README.
- Partnerlinks sind leer, Porträtfoto fehlt.

Die vollständige Liste steht im README unter „Redaktionelle Hinweise", die
Reihenfolge in `MONETARISIERUNG.md`.

## Was hier schon Zeit gekostet hat

- **Der Browser dieser Sandbox kommt nicht an die Live-Adresse** — der Proxy
  lässt ihn nicht durch. Brücke: lokaler Server, der die Dateien ausliefert und
  `/api/…` per `curl` an die Live-Adresse weiterreicht.
- **Umgebungsvariablen bei Netlify wirken erst nach einem neuen Deploy.** Wer
  das vergisst, hält einen offenen Endpunkt für geschützt.
- **Als geheim markierte Variablen sind beim Anlegen schon stillschweigend
  verschwunden.** Danach die Liste abfragen und wirklich hinsehen.
- **`--screenshot` von Chrome direkt liefert unten weiße Bilder.** Über
  `playwright-core` mit gesetztem `viewport` und `clip` stimmt es.
- **TikTok ist in Sitzungen im Netz komplett gesperrt** (403 schon beim
  Verbindungsaufbau, nicht umgehbar). Video als Datei hochladen; zerlegen mit
  `npm i ffmpeg-static`, dann `fps=1` und `tile=4x3` zu Kontaktbögen — die
  lassen sich lesen. Der `drawtext`-Filter fehlt in dem Build.
- **Fremden Code ins Projekt kopieren lehnt die Schutzschaltung ab**, bis
  Damaso ausdrücklich zustimmt. Kein Grund, es über Umwege zu versuchen —
  fragen.

## Regel

Am Ende einer Sitzung, in der etwas entschieden wurde oder etwas nicht
funktioniert hat: hier eine Zeile dazu. Sonst nichts.
