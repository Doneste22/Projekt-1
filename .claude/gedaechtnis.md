# Gedächtnis

Was eine neue Sitzung nicht von selbst sieht. Kurz halten: Erledigtes löschen.
Was dauerhaft gilt, gehört in `CLAUDE.md` oder den Hausstil-Skill.

## Zustand

- Hauptlinie `claude/wand-fuer-wand-site-p6psyv`. Nicht löschen, nicht
  enthalten: `claude/setup-pm-4a2y52`, `claude/video-anschauen-ejtvd9`.
- Eingeschaltet: `security-guidance` (0 Zeichen Kontext), `claude-code-setup`
  (354). Der fremde Skill `task-observer` liegt bei, läuft nicht mit, kostet
  aber 1 046 Zeichen Beschreibung pro Sitzung.
- Website ohne Build-Schritt, `publish = "."`. Gebaut wird nur die
  Edge-Function für Jarvis.
- Offen vor dem Livegang: Domain, E-Mail, Partnerlinks, Porträtfoto — Liste im
  README unter „Redaktionelle Hinweise", Reihenfolge in `MONETARISIERUNG.md`.
  Nicht entschieden: ß oder ss (Begründung beider Seiten im README).

## Was hier schon Zeit gekostet hat

- **Der Browser dieser Sandbox kommt nicht an die Live-Adresse** (Proxy).
  Brücke: lokaler Server, der die Dateien ausliefert und `/api/…` per `curl`
  an die Live-Adresse weiterreicht.
- **Netlify-Umgebungsvariablen wirken erst nach einem neuen Deploy.** Sonst
  hält man einen offenen Endpunkt für geschützt.
- **Als geheim markierte Variablen sind beim Anlegen schon stillschweigend
  verschwunden.** Danach die Liste abfragen und hinsehen.
- **Chromes `--screenshot` liefert unten weiße Bilder.** `playwright-core` mit
  gesetztem `viewport` und `clip` nehmen.
- **TikTok ist gesperrt** (403 beim Verbindungsaufbau, nicht umgehbar). Video
  als Datei hochladen, mit `npm i ffmpeg-static` zerlegen: `fps=1` und
  `tile=4x3` ergibt lesbare Kontaktbögen. `drawtext` fehlt in dem Build.
- **Fremden Code ins Projekt kopieren und Hooks eintragen** lehnt die
  Schutzschaltung ab, bis Damaso ausdrücklich zustimmt. Nicht über Umwege
  versuchen — fragen.
- **Plugins vor dem Einschalten messen.** Beschreibungen stehen in *jeder*
  Sitzung im Kontext, auch ungenutzt. `netlify-skills` kostete so 25 302
  Zeichen und flog raus. Faustregel: Skills kosten immer, Hooks nur im
  Einsatz.

## Regel

Am Ende einer Sitzung, in der etwas entschieden wurde oder etwas nicht ging:
hier eine Zeile. Sonst nichts.
