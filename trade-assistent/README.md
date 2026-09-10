# Handelsassistent

Rechnet Handelssignale aus Kursdaten, prüft sie gegen die Vergangenheit und
handelt sie selbstständig — auf Papier.

Reines Python 3.11, Standardbibliothek, keine Abhängigkeiten. Wie der Rest
dieses Repositorys: kein Build-Schritt, nichts zu installieren.

```
python3 -m assistant signal        # was die Regeln gerade sagen, mit voller Begründung
python3 -m assistant backtest      # wie sich diese Regeln geschlagen hätten
python3 -m assistant vergleich     # alle Strategien nebeneinander
python3 -m assistant vorwaerts     # der Test gegen den Selbstbetrug
python3 -m assistant laufen        # selbstständiger Papierbetrieb
python3 -m assistant stand         # Zustand des laufenden Betriebs
```

## Wozu das gedacht ist — und wozu nicht

Es gibt eine Sorte Werkzeug, die Kerzencharts zeigt, „AI forecast: HIGHER"
schreibt und einen Knopf zum Broker anbietet. Dieses hier ist ausdrücklich das
Gegenteil davon. Der Unterschied liegt nicht in der Technik, sondern darin,
was verschwiegen wird.

Ein Signal ist hier **kein Urteil, sondern eine Summe benannter Einzelstimmen**.
Was angezeigt wird, ist die tatsächliche Rechnung:

```
KAUFEN  —  Neigung +89%  (ab +40% wird gekauft)
Kurs 78,281.65
Vorschlag Stop 73,836.26, Ziel 87,172.42

  + EMA20/50 6.22 — schnelle über langsamer Linie
  + Kurs zu EMA50 7.95 — Kurs über der Trendlinie
  + ADX 46.93 — Trend trägt (≥20)
  + +DI/−DI 18.64 — Käufer führen
  + RSI 59.45 — im tragfähigen Bereich
```

Jede Zeile ist nachrechenbar. Nichts daran ist eine Vorhersage — es ist eine
Beschreibung dessen, was die Kurse bisher getan haben.

Die Neigung trägt ein Vorzeichen, und das ist kein Schönheitsfehler: Ein Wert
von −45 % heisst klar „nein". Als Betrag angezeigt („Stärke 45 %") sähe
dieselbe Ablehnung aus wie ein knapp verfehltes „ja" — genau die Sorte
Unschärfe, mit der anderswo Zustimmung erzeugt wird.

**Papierbetrieb ist die Vorgabe.** Echter Handel an der Börse ist eingebaut,
aber er verlangt eine ausdrückliche Scharfschaltung und arbeitet unter
absoluten Betragsgrenzen — siehe [Echter Handel](#echter-handel) am Ende.

## Was die Prüfung ergeben hat

Ehrlichkeit fängt bei den eigenen Zahlen an. BTC/USD, Tageskerzen,
30.07.2019 bis 10.09.2026 (2600 Kerzen, zwei volle Marktzyklen), 0,1 %
Gebühren und 0,05 % Schlupf eingerechnet:

| Strategie | Rendite | je Jahr | grösster Rückgang | Trades | Trefferquote | Sharpe |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Trendfolge | +20,2 % | +2,6 % | 6,4 % | 65 | 42 % | 0,57 |
| Ausbruch | +22,3 % | +2,9 % | 8,2 % | 55 | 40 % | 0,67 |
| Mittelwert | −4,7 % | −0,7 % | 5,1 % | 14 | 36 % | −0,46 |
| **nur halten** | **+704,1 %** | | **76,7 %** | 1 | | |

Zwei der drei Strategien verdienen Geld. Keine schlägt es, die Münzen einfach
zu kaufen und liegen zu lassen — nicht annähernd.

Die Vorwärtsprüfung ist noch unbequemer. Sie optimiert die Parameter auf den
ersten 60 % der Historie und misst dann auf dem Rest, den die Optimierung nie
gesehen hat:

| Strategie | Training | ungesehen | davon übrig |
| --- | ---: | ---: | ---: |
| Trendfolge | +20,6 % | +2,2 % | 11 % |
| Ausbruch | +16,4 % | +2,7 % | 17 % |
| Mittelwert | +2,6 % | −2,8 % | — |

Vom schönen Trainingsergebnis überlebt ein Zehntel bis ein Sechstel. Das ist
die Signatur angepasster Parameter, und sie ist der Normalfall, nicht die
Ausnahme.

Eine Einschränkung gehört dazu: Die kleinen Rückgänge (6–8 % gegen 77 %) sind
nur zum Teil ein Verdienst der Regeln. Bei 1 % Risiko je Trade und höchstens
25 % Positionsanteil liegt das Kapital die meiste Zeit in bar. Wer Rendite und
Rückgang fair vergleichen will, müsste gegen eine Mischung aus Markt und
Bargeld mit gleicher Marktzeit messen — das tut dieses Werkzeug bisher nicht.

**Die naheliegende Schlussfolgerung: So wie es hier steht, gehört kein Geld
daran.** Was es leistet, ist etwas anderes — es sagt einem das, statt es zu
verschweigen.

## Aufbau

```
assistant/candles.py      Kerzenmodell, Sortierung, Lücken, laufende Kerze abschneiden
assistant/indicators.py   EMA, RSI, ATR, MACD, Bollinger, Donchian, ADX — reines Python
assistant/sources.py      Bitstamp und Kraken, mit Cache auf Platte
assistant/strategy.py     Strategien; ein Signal ist eine Liste begründeter Stimmen
assistant/risk.py         Positionsgrösse aus dem Stop, Verlustgrenzen, Abkühlung
assistant/portfolio.py    Positionen, Handelsbuch, Kapitalkurve
assistant/execution.py    Gebühren, Schlupf, Papierbroker, gesperrter Live-Broker
assistant/backtest.py     Backtest-Maschine und Kennzahlen
assistant/validate.py     Vorwärtsprüfung gegen Überanpassung
assistant/runner.py       Der selbstständige Betrieb
assistant/report.py       Textbericht und HTML mit Inline-SVG-Kapitalkurve
assistant/exchange.py     Signierter Kraken-Zugang, Nonce, Drossel, Paar-Regeln
assistant/live.py         Echte Orders, Teilausführungen, Abgleich mit der Börse
assistant/safety.py       Notbremse, absolute Grenzen, Auslöser
assistant/notify.py       Weckruf per Webhook — unbeaufsichtigt heisst nicht unbemerkt
tests/                    106 Tests
```

### Die drei Regeln der Backtest-Maschine

1. **Kein Blick nach vorn.** Entschieden wird auf der abgeschlossenen Kerze i,
   ausgeführt zur Eröffnung von i+1. Wer auf den Schlusskurs derselben Kerze
   kauft, handelt mit Kursen, die er noch nicht kennen konnte.
2. **Im Zweifel gegen sich selbst.** Trifft eine Kerze Stop und Ziel, zählt der
   Stop — welcher zuerst kam, verrät die Kerze nicht. Klafft eine Kerze unter
   den Stop, wird zur Eröffnung gefüllt, nicht zum Stopkurs.
3. **Immer gegen „kaufen und liegenlassen" messen.** Diese Zeile steht in jedem
   Bericht.

Dass die Maschine hohe Renditen überhaupt abbilden *kann*, sichert ein Test ab:
Eine Strategie, die zwei Kerzen in die Zukunft schauen darf, schlägt den Markt
in derselben Maschine deutlich (`tests/test_backtest.py`). Schwache Ergebnisse
sind also eine Aussage über die Strategie, nicht über den Prüfstand.

### Positionsgrösse

Nicht nach Bauchgefühl, sondern aus dem Stop: Es wird so viel gekauft, dass der
Weg vom Einstieg bis zum Stop genau `--risiko` des Kapitals kostet. Ein weiter
Stop ergibt eine kleine Position, ein enger eine grössere. Jeder Fehlschlag
kostet damit gleich viel, unabhängig von der Schwankungsbreite. Eine Position
ohne Stop hat kein bezifferbares Risiko und ist nicht dimensionierbar — deshalb
setzt `stop_absichern()` notfalls einen groben Notstop.

### Der selbstständige Betrieb

```
python3 -m assistant --symbol btcusd --takt 1h --strategie ausbruch \
        laufen --takt-sekunden 300
```

Wacht alle fünf Minuten auf, holt Kurse, prüft offene Positionen, bewertet die
Lage, handelt oder eben nicht — und legt sich wieder hin. Drei Eigenschaften,
ohne die „selbstständig" fahrlässig wäre:

* **Neustartfest.** Der Zustand liegt in einer JSON-Datei, atomar geschrieben.
  Ein abgestürzter Prozess setzt fort, statt eine offene Position zu vergessen.
* **Idempotent.** Neue Positionen entstehen nur auf einer neu abgeschlossenen
  Kerze. Zehn Aufwachvorgänge innerhalb einer Kerze ergeben keine zehn Orders.
  Stops dagegen werden bei *jedem* Durchlauf geprüft — ein Stop, der bis zum
  Kerzenschluss wartet, ist keiner.
* **Rechenschaftspflichtig.** Jeder Durchlauf schreibt eine Zeile ins Journal,
  auch der ohne Handlung, mitsamt Grund fürs Nichtstun und allen Einzelstimmen.

Netzfehler beenden die Schleife nicht; sie werden protokolliert und beim
nächsten Takt erneut versucht. Strg-C sichert den Zustand und beendet sauber.

## Optionen

| Option | Vorgabe | Bedeutung |
| --- | --- | --- |
| `--symbol` | `btcusd` | Handelspaar |
| `--takt` | `1t` | Kerzenlänge: `1m` bis `3t` |
| `--tage` | `730` | Historie in Tagen |
| `--strategie` | `trendfolge` | `trendfolge`, `mittelwert`, `ausbruch` |
| `--kapital` | `10000` | Startkapital |
| `--gebuehr` | `0.001` | Gebührensatz (0,1 %) |
| `--schlupf` | `0.0005` | Schlupf beim Füllen |
| `--risiko` | `0.01` | Kapitalanteil, der bei Stop verloren geht |
| `--max-anteil` | `0.25` | Obergrenze einer einzelnen Position |
| `--schwelle` | `0.4` | Mindeststärke fürs Handeln |
| `--nachziehen` | `0` | Nachgezogener Stop in ATR (0 = aus) |
| `--quelle` | `bitstamp` | `bitstamp` (tiefe Historie) oder `kraken` |
| `--offline` | | Nur Cache, kein Netz — für reproduzierbare Läufe |

## Datenquellen

Beide ohne Schlüssel abrufbar. Bitstamp blättert beliebig weit zurück und ist
deshalb die Vorgabe; Kraken liefert höchstens 720 Kerzen und dient als
Zweitmeinung. Auf gleichem Datum stimmen beide auf etwa 0,02 % überein.

Alles Geholte landet im Cache unter `daten/`. Mit `--offline` liest ein
Backtest ausschliesslich von Platte und liefert bei jedem Lauf dasselbe
Ergebnis — sonst vergleicht man Strategien gegen verschobene Daten und hält
das Rauschen für Fortschritt.

## Tests

```
python3 -m unittest discover -s tests -t .
```

106 Tests, alle ohne Netz. Die Indikatoren werden gegen Wilders
Original-Datenreihe aus *New Concepts in Technical Trading Systems* geprüft,
die Backtest-Maschine gegen konstruierte Fälle mit von Hand bekanntem
Ergebnis, der Dauerbetrieb gegen eine erfundene Kursquelle, und der echte
Handel gegen eine nachgebaute Börse, die sich auf Kommando danebenbenimmt —
teilfüllt, gar nicht füllt, mitten in der Order die Verbindung verliert.

## Was fehlt

Ehrliche Liste, keine Ausreden:

* **Nur Long, nur ein Symbol gleichzeitig.** Das Depot kann mehrere Positionen,
  die Schleife bedient bisher eine.
* **Kein Vergleich bei gleicher Marktzeit** (siehe oben).
* **Keine Berücksichtigung von Steuern.**
* **Der Papierbetrieb füllt zum letzten Kurs**, nicht gegen echte Orderbuchtiefe.
  Bei grossen Beträgen ist das zu optimistisch.
* **Kein Konto lief je damit.** Was am echten Handel geprüft ist und was nicht,
  steht in [Was geprüft ist — und was nicht](#was-geprüft-ist--und-was-nicht).

## Rechtliches

Keine Anlageberatung, keine Vorhersage. Im Papierbetrieb wird kein Geld
bewegt. Im scharfen Betrieb wird echtes Geld bewegt, und das Risiko trägt,
wer die Scharfschaltung bestätigt.

---

# Echter Handel

Ab hier wird Geld bewegt. Der Abschnitt beschreibt, was dafür eingebaut ist —
und was davon ungetestet bleibt, weil hier nie ein echtes Konto lief.

## Der Weg dorthin

```
python3 -m assistant konto                    # Zugang prüfen, bewegt nichts
python3 -m assistant live                     # Probelauf: Börse prüft jede Order, führt keine aus
python3 -m assistant live --scharf            # echte Orders, mit Rückfrage
python3 -m assistant notbremse ziehen         # sofort anhalten
python3 -m assistant notbremse schliessen     # anhalten und Position auflösen
python3 -m assistant sicherung                # Schutzschaltungen ansehen
```

Der Probelauf ist keine Simulation: Jede Order geht mit `validate=true` an
Kraken und wird dort gegen dieselben Regeln geprüft wie im Ernstfall —
Mindestmenge, Mindestwert, Nachkommastellen, Guthaben. Nur ausgeführt wird
nichts. Wer dort sauber durchläuft, scheitert später nicht an Formalien.

## Schlüssel

Niemals im Quelltext, niemals im Repository. Zwei Wege:

```
export KRAKEN_API_KEY=...
export KRAKEN_API_SECRET=...
```

oder eine Datei mit zwei Zeilen (Schlüssel, dann Geheimnis):

```
printf '%s\n%s\n' "$KEY" "$SECRET" > betrieb/kraken.key
chmod 600 betrieb/kraken.key
```

Eine Schlüsseldatei, die auch anderen lesbar ist, wird **abgelehnt** statt
benutzt. Das ist ein Vorfall, keine Unbequemlichkeit.

Bei Kraken die Berechtigungen des Schlüssels eng setzen: *Query Funds*,
*Query Open/Closed Orders*, *Create & Modify Orders*, *Cancel Orders*.
**Kein Auszahlungsrecht.** Ein Schlüssel ohne Auszahlungsrecht kann im
schlimmsten Fall schlecht handeln — aber nichts abtransportieren.

## Die Scharfschaltung

`--scharf` allein genügt nicht. Am Terminal ist ein Satz zu tippen. Für den
unbeaufsichtigten Neustart über systemd oder `nohup` dient
`HANDELSASSISTENT_SCHARF=ja-ich-will` — einmal bewusst gesetzt, nicht aus
Versehen. Ohne Terminal und ohne diese Variable bricht der Start ab.

## Was dich schützt

| Schaltung | Was sie tut |
| --- | --- |
| `--max-order` | absolute Obergrenze je Order, Vorgabe 100 |
| `--max-einsatz` | wie viel insgesamt im Markt stehen darf, Vorgabe 500 |
| `--max-tagesverlust` | Pause bis zum nächsten Tag, Vorgabe 50 |
| `--max-gesamtverlust` | dauerhafter Stopp, Vorgabe 150 |
| `--max-orders` | Orders je Tag, Vorgabe 10 — Bremse gegen Endlosschleifen |
| Kursalter | Kurse älter als 120 s → Stopp |
| Fehlerkette | 5 Fehler in Folge → Stopp |
| Guthabenabgleich | über 2 % unerklärte Abweichung → Stopp |
| Notbremse | Datei `betrieb/NOTBREMSE` — wirkt sofort, von überall |

Alle Grenzen sind **absolute Beträge**, nicht nur Prozente. Prozente skalieren
mit einem falsch gelesenen Guthaben mit; eine Zahl in Euro tut das nicht.

Ein ausgelöster Auslöser bleibt über Neustarts hinweg ausgelöst und muss von
Hand zurückgesetzt werden (`sicherung --zuruecksetzen`). Wer das automatisch
zurücksetzt, hat keine Sicherung, sondern eine Verzögerung.

## Vier Entscheidungen, die Geld kosten können

**Marktnahe Limit-Order statt Market-Order.** Eine Market-Order füllt zu jedem
Preis; bricht das Orderbuch für Sekunden ein, kauft sie das Loch. Hier geht
eine Limit-Order 0,5 % jenseits des Marktes raus (`--max-schlupf`). Sie füllt
im Normalfall genauso sofort, aber nie schlechter als die Grenze. Der Preis
dafür: In einem schnellen Markt füllt sie nicht. Für einen Assistenten, dem
niemand zusieht, ist die nicht ausgeführte Order das kleinere Übel.

**Keine Wiederholung nach Zeitüberschreitung.** Keine Antwort heisst nicht
„nicht angekommen". Wiederholen kauft im schlechten Fall doppelt. Stattdessen
trägt jede Order eine `userref`, und nach einem Abbruch wird bei der Börse
gefragt, was tatsächlich geschah. Findet sich nichts, hält der Betrieb an.

**Teilausführungen werden verbucht, wie sie sind.** Wer die gewünschte statt
der gefüllten Menge einträgt, führt ab da ein falsches Depot und verkauft
später etwas, das er nicht hat. Der Rest wird storniert, die Position trägt
die tatsächliche Menge.

**Abgleich vor der ersten Order.** Beim Start wird der eigene Zustand gegen
die Börse geprüft: hängengebliebene Orders werden storniert, der Bestand mit
dem eigenen Depot verglichen. Weicht etwas ab, wird angehalten statt geraten —
eine Abweichung heisst, dass jemand oder etwas anderes dieses Konto bewegt hat.

## Benachrichtigung

Unbeaufsichtigt darf nicht unbemerkt heissen. Mit gesetzter Variable geht bei
jedem Kauf, Verkauf und jeder Auslösung ein Weckruf raus:

```
export HANDELSASSISTENT_WEBHOOK=https://ntfy.sh/dein-geheimes-thema
```

Erkannt werden ntfy.sh, Discord, Slack und Telegram. Ein fehlgeschlagener
Weckruf stört den Handel nie — er wird geschluckt und vermerkt.

## Dauerbetrieb per systemd

```ini
# /etc/systemd/system/handelsassistent.service
[Unit]
Description=Handelsassistent
After=network-online.target

[Service]
Type=simple
User=handel
WorkingDirectory=/opt/handelsassistent
Environment=HANDELSASSISTENT_SCHARF=ja-ich-will
Environment=HANDELSASSISTENT_WEBHOOK=https://ntfy.sh/dein-geheimes-thema
EnvironmentFile=/etc/handelsassistent.env
ExecStart=/usr/bin/python3 -m assistant --paar XBTUSD --takt 1h \
          --strategie ausbruch --max-order 50 --max-einsatz 200 \
          live --scharf --takt-sekunden 60
Restart=on-failure
RestartSec=60

[Install]
WantedBy=multi-user.target
```

`/etc/handelsassistent.env` enthält die Schlüssel und gehört auf Modus 600.
`Restart=on-failure` ist hier ungefährlich: Eine ausgelöste Sicherung liegt
auf Platte, also startet der Dienst neu, sieht die Auslösung und handelt
nicht.

## Was geprüft ist — und was nicht

**Geprüft** (106 Tests, ohne Netz, gegen eine nachgebaute Börse):
die Signatur gegen Krakens veröffentlichten Testvektor; Nonce streng steigend
über Neustarts und vorgestellte Uhren; Mindestmenge und Mindestwert; volle,
teilweise und ausbleibende Ausführung; Verbindungsabbruch mitten in der Order
(es entsteht **keine** zweite Order); spurlos verlorene Order → Stopp; alle
Schutzgrenzen; Notbremse mit und ohne Auflösung; Abgleich bei fremdem,
fehlendem und passendem Bestand.

**Nicht geprüft**, weil hier nie ein echtes Konto lief:

* Das Verhalten von Krakens Schnittstelle unter Last, bei Wartung oder
  Teilausfall.
* Reale Ausführungsqualität — wie oft die Limit-Order tatsächlich nicht füllt.
* Krakens Aufruf-Zähler unter Dauerlast. Die Drossel hält 1,1 s Abstand; das
  sollte reichen, bewiesen ist es nicht.
* Rundungsverhalten bei anderen Paaren als XBTUSD.

Deshalb, in dieser Reihenfolge: `konto`, dann `live` (Probelauf) über
mindestens einen Tag, dann `live --scharf` mit `--max-order 10`. Erst wenn
das über Wochen unauffällig läuft, die Grenzen anheben.

Und der Backtest oben gilt weiter: Diese Strategien haben schlichtes Halten
nicht geschlagen.
