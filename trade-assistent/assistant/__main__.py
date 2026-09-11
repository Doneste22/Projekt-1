"""Kommandozeile: python3 -m assistant <befehl>"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from . import notify, sources
from .backtest import run
from .exchange import BoersenFehler, KrakenClient, schluessel_laden
from .execution import CostModel
from .report import html_bericht, text_bericht
from .risk import RiskRules
from .runner import Runner
from .safety import Angehalten, Grenzen, Sicherung
from .strategy import STRATEGIEN
from .validate import vorwaerts

SCHRITTE = {
    "1m": 60, "5m": 300, "15m": 900, "30m": 1800,
    "1h": 3600, "2h": 7200, "4h": 14400, "6h": 21600, "12h": 43200,
    "1t": 86400, "3t": 259200,
}

# Suchräume für die Vorwärtsprüfung. Bewusst klein gehalten: Je mehr
# Kombinationen, desto sicherer findet man eine, die zufällig gut aussah.
RASTER = {
    "trendfolge": {"schnell": [10, 20, 30], "langsam": [50, 100], "adx_min": [15.0, 25.0]},
    "mittelwert": {"bb_n": [14, 20, 30], "rsi_tief": [25.0, 30.0, 35.0]},
    "ausbruch": {"kanal": [10, 20, 40], "atr_stop": [1.5, 2.0, 3.0]},
}


def _regeln(a) -> RiskRules:
    return RiskRules(
        risiko_je_trade=a.risiko,
        max_positionsanteil=a.max_anteil,
        min_staerke=a.schwelle,
        abkuehlung_kerzen=a.abkuehlung,
    )


def _kosten(a) -> CostModel:
    return CostModel(gebuehr_satz=a.gebuehr, schlupf_satz=a.schlupf)


def _serie(a):
    return sources.load(
        a.symbol, SCHRITTE[a.takt], tage=a.tage, quelle=a.quelle,
        cache=sources.Cache(a.daten), offline=a.offline,
    )


def _strategie(a):
    if a.strategie not in STRATEGIEN:
        raise SystemExit(f"Unbekannte Strategie '{a.strategie}'. Bekannt: {', '.join(STRATEGIEN)}")
    return STRATEGIEN[a.strategie]


def _bauen(a):
    """Strategie mit der eingestellten Schwelle — sonst wirkt --schwelle nur
    auf die Risikoregeln und die Strategie bliebe bei ihrer Vorgabe."""
    return _strategie(a)(schwelle=a.schwelle)


# -- Befehle ----------------------------------------------------------------
def befehl_signal(a) -> int:
    reihe = _serie(a).closed()
    strat = _bauen(a)
    strat.prepare(reihe)
    sig = strat.evaluate(len(reihe) - 1)
    letzte = reihe[-1]
    print(f"\n  {a.symbol.upper()} · {a.takt} · Strategie {a.strategie}")
    print(f"  Letzte abgeschlossene Kerze: {letzte.time:%Y-%m-%d %H:%M} UTC\n")
    print(f"  {sig.richtung}  —  Neigung {sig.neigung}  "
          f"(ab {strat.schwelle:+.0%} wird gekauft)")
    print(f"  Kurs {sig.kurs:,.2f}")
    if sig.stop:
        print(f"  Vorschlag Stop {sig.stop:,.2f}" + (f", Ziel {sig.ziel:,.2f}" if sig.ziel else ""))
    print("\n  Wie das zustande kommt:")
    for g in sig.gruende:
        print(f"    {g}")
    print("\n  Das ist eine Rechnung auf vergangenen Kursen, keine Vorhersage.\n")
    return 0


def befehl_backtest(a) -> int:
    reihe = _serie(a)
    e = run(reihe, _bauen(a), regeln=_regeln(a), startkapital=a.kapital,
            kosten=_kosten(a), nachziehen=a.nachziehen, ausfuehrlich=a.ausfuehrlich)
    print(text_bericht(e))
    if a.ausfuehrlich:
        print("\n  VERLAUF")
        for zeile in e.protokoll:
            print(f"    {zeile}")
    if a.bericht:
        Path(a.bericht).write_text(html_bericht(e), encoding="utf-8")
        print(f"\n  HTML-Bericht geschrieben: {a.bericht}")
    return 0


def befehl_vergleich(a) -> int:
    reihe = _serie(a)
    print(f"\n  {reihe}\n")
    kopf = f"  {'Strategie':<13}{'Rendite':>10}{'je Jahr':>10}{'MaxDD':>9}{'Trades':>8}{'Treffer':>9}{'Faktor':>8}{'Sharpe':>8}"
    print(kopf)
    print("  " + "-" * (len(kopf) - 2))
    for name, klasse in STRATEGIEN.items():
        m = run(reihe, klasse(schwelle=a.schwelle), regeln=_regeln(a), startkapital=a.kapital,
                kosten=_kosten(a), nachziehen=a.nachziehen).metrics
        faktor = "∞" if m.gewinnfaktor == float("inf") else f"{m.gewinnfaktor:.2f}"
        print(f"  {name:<13}{m.gesamtrendite * 100:>9.1f}%{m.jahresrendite * 100:>9.1f}%"
              f"{m.max_rueckgang * 100:>8.1f}%{m.trades:>8}{m.trefferquote * 100:>8.0f}%"
              f"{faktor:>8}{m.sharpe:>8.2f}")
    m0 = run(reihe, list(STRATEGIEN.values())[0](schwelle=a.schwelle), regeln=_regeln(a),
             startkapital=a.kapital, kosten=_kosten(a)).metrics
    print("  " + "-" * (len(kopf) - 2))
    print(f"  {'nur halten':<13}{m0.vergleich_rendite * 100:>9.1f}%{'':>10}"
          f"{m0.vergleich_rueckgang * 100:>8.1f}%")
    print("\n  Wer die Zeile 'nur halten' nicht schlägt, hat keine Strategie,")
    print("  sondern eine teurere Art, dasselbe zu tun.\n")
    return 0


def befehl_vorwaerts(a) -> int:
    reihe = _serie(a)
    klasse = _strategie(a)
    raster = RASTER[a.strategie]
    print(f"\n  {reihe}")
    print(f"  Optimiert wird auf den ersten {a.training:.0%}, gemessen auf dem Rest.")
    print(f"  Suchraum: {raster}\n")
    v = vorwaerts(reihe, klasse, raster, anteil_training=a.training,
                  regeln=_regeln(a), kosten=_kosten(a), startkapital=a.kapital)
    t, p = v.training.ergebnis.metrics, v.pruefung.ergebnis.metrics
    print(f"  {v.versuche} Kombinationen geprüft, beste: {v.beste_parameter}\n")
    print(f"  {'':<22}{'Training':>14}{'ungesehen':>14}")
    print("  " + "-" * 48)
    for name, x, y in [
        ("Rendite", f"{t.gesamtrendite:+.2%}", f"{p.gesamtrendite:+.2%}"),
        ("Sharpe", f"{t.sharpe:.2f}", f"{p.sharpe:.2f}"),
        ("Grösster Rückgang", f"{t.max_rueckgang:.1%}", f"{p.max_rueckgang:.1%}"),
        ("Trades", f"{t.trades}", f"{p.trades}"),
        ("nur halten", f"{t.vergleich_rendite:+.2%}", f"{p.vergleich_rendite:+.2%}"),
    ]:
        print(f"  {name:<22}{x:>14}{y:>14}")
    print("\n  " + v.urteil() + "\n")
    return 0


def befehl_laufen(a) -> int:
    r = Runner(
        a.symbol, SCHRITTE[a.takt], _bauen(a), regeln=_regeln(a),
        kosten=_kosten(a), startkapital=a.kapital, quelle=a.quelle,
        arbeitsverzeichnis=a.betrieb, historie_tage=a.tage, nachziehen=a.nachziehen,
    )
    print(f"\n  Papierbetrieb — es wird kein Geld bewegt.")
    print(f"  {a.symbol.upper()} · {a.takt} · {a.strategie} · Takt {a.takt_sekunden}s")
    print(f"  Zustand: {r.zustand_datei}")
    print(f"  Journal: {r.journal_datei}")
    print("  Beenden mit Strg-C — der Zustand wird gesichert.\n")
    r.schleife(takt=a.takt_sekunden, max_durchlaeufe=a.durchlaeufe)
    s = r.stand()
    print(f"\n  Beendet nach {s['ticks']} Durchläufen. "
          f"Kapital {s['kapital']:,.2f} ({s['rendite']:+.2%}), "
          f"{s['abgeschlossene_trades']} Trades.\n")
    return 0


def befehl_stand(a) -> int:
    datei = Path(a.betrieb) / f"zustand_{a.symbol}_{SCHRITTE[a.takt]}.json"
    if not datei.exists():
        print(f"  Kein Zustand unter {datei}. Läuft der Assistent schon?")
        return 1
    d = json.loads(datei.read_text())
    depot = d["depot"]
    print(f"\n  {d['symbol'].upper()} · {d['strategie']} · Stand {d['aktualisiert']}")
    print(f"  Gestartet {d['gestartet']}, {d['ticks']} Durchläufe\n")
    print(f"  Startkapital {depot['startkapital']:,.2f}")
    print(f"  Bargeld      {depot['bargeld']:,.2f}")
    print(f"  Gebühren     {depot['gebuehren_gesamt']:,.2f}")
    for sym, pos in depot["positionen"].items():
        zeile = f"\n  Offen: {pos['menge']:.6f} {sym} zu {pos['einstieg']:,.2f}"
        if pos.get("stop"):
            zeile += f"  Stop {pos['stop']:,.2f}"
        if pos.get("ziel"):
            zeile += f"  Ziel {pos['ziel']:,.2f}"
        print(zeile)
        if pos.get("begruendung"):
            print(f"    Begründung beim Einstieg: {pos['begruendung']}")
    trades = depot["trades"]
    print(f"\n  {len(trades)} abgeschlossene Trades")
    for t in trades[-5:]:
        netto = (t["ausstieg"] - t["einstieg"]) * t["menge"] - t["gebuehren"]
        print(f"    {t['einstieg']:,.2f} → {t['ausstieg']:,.2f}  {netto:+,.2f}  [{t['grund']}]")
    print()
    return 0


def befehl_daten(a) -> int:
    cache = sources.Cache(a.daten)
    dateien = sorted(Path(a.daten).glob("*.csv"))
    if not dateien:
        print(f"  Cache {a.daten} ist leer.")
        return 0
    print(f"\n  Cache {a.daten}\n")
    for f in dateien:
        zeilen = sum(1 for _ in f.open()) - 1
        print(f"  {f.name:<34}{zeilen:>8} Kerzen  {f.stat().st_size / 1024:>8.1f} kB")
    print()
    return 0


SPRUCH = "JA ICH HANDLE MIT ECHTEM GELD"


def _grenzen(a) -> Grenzen:
    return Grenzen(
        max_orderwert=a.max_order,
        max_gesamteinsatz=a.max_einsatz,
        max_tagesverlust=a.max_tagesverlust,
        max_gesamtverlust=a.max_gesamtverlust,
        max_orders_pro_tag=a.max_orders,
    )


def _schluesseldatei(a) -> Path:
    return Path(a.schluesseldatei) if a.schluesseldatei else Path(a.betrieb) / "kraken.key"


def _client(a) -> KrakenClient:
    schluessel, geheimnis = schluessel_laden(_schluesseldatei(a))
    return KrakenClient(schluessel, geheimnis, nonce_datei=Path(a.betrieb) / "nonce")


def _scharfschalten(a, grenzen: Grenzen) -> bool:
    """Zwei Wege zur Scharfschaltung, beide ausdrücklich.

    Am Terminal muss der Satz getippt werden. Für den unbeaufsichtigten
    Neustart (systemd, nohup) dient die Umgebungsvariable — die setzt man
    einmal bewusst und nicht aus Versehen.
    """
    if not a.scharf:
        return False
    print("\n  " + "=" * 62)
    print("  SCHARFSCHALTUNG — ab hier wird echtes Geld bewegt.")
    print("  " + "=" * 62)
    print(f"    Einzelne Order höchstens ... {grenzen.max_orderwert:>12,.2f}")
    print(f"    Im Markt höchstens ......... {grenzen.max_gesamteinsatz:>12,.2f}")
    print(f"    Tagesverlust bis ........... {grenzen.max_tagesverlust:>12,.2f}")
    print(f"    Gesamtverlust bis .......... {grenzen.max_gesamtverlust:>12,.2f}")
    print(f"    Orders je Tag höchstens .... {grenzen.max_orders_pro_tag:>12}")
    print(f"    Notbremse .................. {Path(a.betrieb) / 'NOTBREMSE'}")
    print()
    if os.environ.get("HANDELSASSISTENT_SCHARF") == "ja-ich-will":
        print("  Scharf über HANDELSASSISTENT_SCHARF.\n")
        return True
    if not sys.stdin.isatty():
        print("  Kein Terminal für die Rückfrage. Für den unbeaufsichtigten Start:")
        print("  HANDELSASSISTENT_SCHARF=ja-ich-will setzen.\n")
        raise SystemExit(4)
    antwort = input(f'  Zum Bestätigen tippen: "{SPRUCH}"\n  > ').strip()
    if antwort != SPRUCH:
        print("\n  Nicht bestätigt. Es bleibt beim Probelauf.\n")
        return False
    print()
    return True


def befehl_konto(a) -> int:
    """Zugang prüfen, ohne irgendetwas zu bewegen."""
    client = _client(a)
    print(f"\n  Börsenstatus: {client.systemstatus()}")
    info = client.paar_info(a.paar)
    print(f"  Paar {info.altname}: mindestens {info.mindestmenge:g} {info.basis}, "
          f"mindestens {info.mindestwert:g} {info.quote}")
    print(f"  Kurs {client.letzter_kurs(a.paar):,.2f} {info.quote}")
    if not client.schluessel:
        print("\n  Kein Schlüssel gesetzt — nur öffentliche Auskünfte möglich.")
        print(f"  Erwartet: KRAKEN_API_KEY/KRAKEN_API_SECRET oder {_schluesseldatei(a)} (Modus 600).\n")
        return 0
    guthaben = {k: v for k, v in client.guthaben().items() if v}
    print("\n  Guthaben:")
    for w, betrag in sorted(guthaben.items()):
        print(f"    {w:<8}{betrag:>18,.8f}")
    offen = client.offene_orders()
    print(f"\n  Offene Orders: {len(offen)}")
    for txid, w in offen.items():
        print(f"    {txid}  {w.get('descr', {}).get('order', '?')}")
    print()
    return 0


def _pruefpunkt(nummer: int, titel: str) -> None:
    print(f"\n  {nummer}. {titel}")


def _ja(text: str) -> None:
    print(f"     [ok]      {text}")


def _nein(text: str) -> None:
    print(f"     [FEHLT]   {text}")


def _warnung(text: str) -> None:
    print(f"     [ACHTUNG] {text}")


def befehl_einrichten(a) -> int:
    """Prüft der Reihe nach alles, was der Echtbetrieb braucht.

    Bewegt nichts. Die einzige Order, die entsteht, geht mit `validate=true`
    zur Börse und wird dort nur geprüft.
    """
    print("\n  EINRICHTUNG PRÜFEN")
    print("  " + "=" * 62)
    fehler, warnungen = 0, 0

    _pruefpunkt(1, "Python")
    from . import MINDESTVERSION

    lauf = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
    if sys.version_info >= MINDESTVERSION:
        _ja(f"Python {lauf}")
    else:
        _nein(f"Python {lauf} — mindestens "
              f"{MINDESTVERSION[0]}.{MINDESTVERSION[1]} nötig")
        fehler += 1

    _pruefpunkt(2, "Schlüssel")
    datei = _schluesseldatei(a)
    if os.environ.get("KRAKEN_API_KEY") and os.environ.get("KRAKEN_API_SECRET"):
        _ja("aus der Umgebung (KRAKEN_API_KEY / KRAKEN_API_SECRET)")
    elif datei.exists():
        modus = datei.stat().st_mode & 0o777
        if modus & 0o077:
            _nein(f"{datei} ist mit Modus {modus:o} zu offen — chmod 600 {datei}")
            fehler += 1
        else:
            _ja(f"{datei} (Modus {modus:o})")
    else:
        _nein(f"weder Umgebungsvariablen noch {datei}")
        print(f"                Anlegen: printf '%s\\n%s\\n' \"$KEY\" \"$SECRET\" > {datei}")
        print(f"                         chmod 600 {datei}")
        fehler += 1
    if fehler:
        print("\n  Ohne Schlüssel geht es nicht weiter.\n")
        return 2

    client = _client(a)

    _pruefpunkt(3, "Börse erreichbar")
    status = client.systemstatus()
    (_ja if status == "online" else _warnung)(f"Kraken meldet '{status}'")
    if status != "online":
        warnungen += 1

    _pruefpunkt(4, "Schlüssel gültig und Rechte")
    try:
        guthaben = client.guthaben()
        _ja("Guthaben abrufbar (Recht: Query Funds)")
    except BoersenFehler as f:
        _nein(f"Guthaben nicht abrufbar: {f}")
        print("                Bei Kraken das Recht 'Query Funds' setzen.")
        return 2
    try:
        client.offene_orders()
        _ja("Orders abrufbar (Recht: Query Open Orders)")
    except BoersenFehler as f:
        _nein(f"Orders nicht abrufbar: {f} — Recht 'Query Open/Closed Orders' fehlt")
        fehler += 1

    _pruefpunkt(5, "Auszahlungsrecht — das darf der Schlüssel NICHT haben")
    try:
        client.privat("WithdrawMethods", asset=client.paar_info(a.paar).basis)
        _warnung("Der Schlüssel darf auszahlen. Das ist zu viel Recht für einen Handelsbot.")
        print("                Bei Kraken 'Withdraw Funds' abwählen und den Schlüssel neu erzeugen.")
        print("                Ein Schlüssel ohne dieses Recht kann schlecht handeln,")
        print("                aber nichts vom Konto transportieren.")
        warnungen += 1
    except BoersenFehler as f:
        if "permission" in str(f).lower() or "denied" in str(f).lower():
            _ja("kein Auszahlungsrecht — genau richtig")
        else:
            _ja(f"Auszahlung nicht möglich ({f})")

    _pruefpunkt(6, "Handelspaar")
    info = client.paar_info(a.paar)
    kurs = client.letzter_kurs(a.paar)
    _ja(f"{info.altname}: Kurs {kurs:,.2f} {info.quote}")
    mindestwert = max(info.mindestwert, info.mindestmenge * kurs)
    print(f"               kleinste Order: {info.mindestmenge:g} {info.basis} "
          f"≈ {mindestwert:,.2f} {info.quote}")
    if a.max_order < mindestwert:
        _nein(f"--max-order {a.max_order:,.2f} liegt unter der kleinsten möglichen Order")
        print(f"                Mindestens --max-order {mindestwert * 1.1:,.2f} setzen.")
        fehler += 1
    else:
        _ja(f"--max-order {a.max_order:,.2f} reicht für etwa "
            f"{a.max_order / mindestwert:.1f} kleinste Orders")

    _pruefpunkt(7, "Guthaben")
    frei = float(guthaben.get(info.quote, 0.0))
    bestand = float(guthaben.get(info.basis, 0.0))
    _ja(f"{frei:,.2f} {info.quote} verfügbar, {bestand:.8f} {info.basis} im Bestand")
    if frei < mindestwert:
        _nein(f"zu wenig {info.quote} für auch nur eine Order (mindestens {mindestwert:,.2f})")
        fehler += 1
    elif frei < a.max_order:
        _warnung(f"weniger als --max-order ({a.max_order:,.2f}) — Orders werden kleiner ausfallen")
        warnungen += 1
    if bestand > info.mindestmenge:
        _warnung(f"{bestand:.8f} {info.basis} liegen bereits im Konto. Der Abgleich hält "
                 "beim Start an, weil der Assistent diesen Bestand nicht kennt.")
        warnungen += 1

    _pruefpunkt(8, "Probeorder (wird nur geprüft, nicht ausgeführt)")
    menge = min(a.max_order, max(frei * 0.5, mindestwert)) / kurs
    try:
        antwort = client.order_aufgeben(
            a.paar, "buy", menge, art="limit", preis=kurs * 1.005, nur_pruefen=True
        )
        _ja(f"Börse akzeptiert: {antwort.get('descr', {}).get('order', '?')}")
        _ja("Recht 'Create & Modify Orders' vorhanden")
    except BoersenFehler as f:
        _nein(f"abgelehnt: {f}")
        if "permission" in str(f).lower():
            print("                Bei Kraken das Recht 'Create & Modify Orders' setzen.")
        fehler += 1

    _pruefpunkt(9, "Benachrichtigung")
    url = os.environ.get("HANDELSASSISTENT_WEBHOOK")
    token = os.environ.get("HANDELSASSISTENT_WEBHOOK_TOKEN")
    if url:
        schwach = notify.themenname_pruefen(url, token)
        if schwach:
            _warnung(schwach)
            print(f"                Vorschlag: https://ntfy.sh/{notify.zufaelliges_thema()}")
            print("                Oder ein ntfy-Konto anlegen und "
                  "HANDELSASSISTENT_WEBHOOK_TOKEN setzen.")
            warnungen += 1
        elif token:
            _ja("geschütztes Thema mit Zugangstoken — der Name muss dann nicht geheim sein")
        melder = notify.WebhookMelder(url, token=token)
        melder.melden("Handelsassistent", "Testnachricht aus der Einrichtungsprüfung.")
        if melder.fehler and "401" in melder.fehler:
            _nein("Zugang verweigert (401). Das Thema ist geschützt, der Token fehlt "
                  "oder stimmt nicht.")
            print("                HANDELSASSISTENT_WEBHOOK_TOKEN=tk_... setzen.")
            fehler += 1
        elif melder.fehler and "403" in melder.fehler:
            _nein("Zugang verweigert (403). Der Token darf auf diesem Thema nicht senden.")
            print("                Im ntfy-Konto dem Token Schreibrecht auf das Thema geben.")
            fehler += 1
        elif melder.fehler:
            _warnung(f"Webhook gesetzt, aber nicht erreichbar: {melder.fehler}")
            warnungen += 1
        else:
            _ja(f"Testnachricht an {melder.format} verschickt — kam sie an?")
    else:
        _warnung("HANDELSASSISTENT_WEBHOOK nicht gesetzt — du erfährst nichts, "
                 "solange du nicht ins Journal siehst")
        warnungen += 1

    _pruefpunkt(10, "Schutzschaltungen")
    sicherung = Sicherung(a.betrieb, _grenzen(a))
    if sicherung.ausgeloest:
        _nein(f"ausgelöst: {sicherung.ausgeloest}")
        print("                Zurücksetzen: python3 -m assistant sicherung --zuruecksetzen")
        fehler += 1
    elif sicherung.notbremse_gezogen:
        _warnung("Notbremse ist gezogen — es würde nicht gehandelt")
        warnungen += 1
    else:
        _ja("frei")
    print(f"               Order ≤ {a.max_order:,.2f} · Einsatz ≤ {a.max_einsatz:,.2f} · "
          f"Tagesverlust ≤ {a.max_tagesverlust:,.2f} · gesamt ≤ {a.max_gesamtverlust:,.2f}")

    print("\n  " + "=" * 62)
    if fehler:
        print(f"  {fehler} Punkt(e) fehlen, {warnungen} Warnung(en). Noch nicht bereit.\n")
        return 1
    print(f"  Bereit. {warnungen} Warnung(en).")
    print("\n  Nächster Schritt — Probelauf über mindestens einen Tag:")
    print(f"    python3 -m assistant --paar {a.paar} --takt {a.takt} "
          f"--strategie {a.strategie} live")
    print("\n  Und erst danach, mit kleiner Grenze:")
    print(f"    python3 -m assistant --paar {a.paar} --takt {a.takt} "
          f"--strategie {a.strategie} \\")
    print(f"            --max-order {max(a.max_order, 10):.0f} --max-einsatz "
          f"{max(a.max_einsatz, 30):.0f} live --scharf\n")
    return 0


def _termux_vorlage(a, arbeitsverzeichnis: Path) -> str:
    """Startskript für Termux auf Android.

    Zwei Dinge sind hier anders als auf einem Server, und beide entscheiden
    darüber, ob der Assistent überhaupt läuft:

    * `termux-wake-lock` hindert Android daran, den Prozess schlafen zu legen.
      Ohne das hält kein Durchlauf länger als ein paar Minuten durch.
    * Die Schleife läuft in einem Wiederanlauf-Rahmen. Android beendet
      Hintergrundprozesse, wann es will; der Zustand liegt auf Platte, also
      ist ein Neustart harmlos — aber er muss eben stattfinden.
    """
    takt = max(a.takt_sekunden if hasattr(a, "takt_sekunden") else 300, 300)
    return f"""#!/data/data/com.termux/files/usr/bin/bash
# ~/.termux/boot/handelsassistent.sh
# Ausführbar machen: chmod +x ~/.termux/boot/handelsassistent.sh
# Braucht die App "Termux:Boot" (F-Droid), damit es einen Neustart übersteht.

# Android darf den Prozess nicht schlafen legen.
termux-wake-lock

cd {arbeitsverzeichnis} || exit 1

# Schlüssel liegen in einer Datei mit Modus 600, nicht hier drin.
export HANDELSASSISTENT_SCHARF=ja-ich-will
# Ohne Weckruf merkst du auf dem Handy nichts. Thema durch ein eigenes ersetzen:
export HANDELSASSISTENT_WEBHOOK=https://ntfy.sh/dein-thema
# Nur nötig, wenn das Thema in deinem ntfy-Konto geschützt ist:
# export HANDELSASSISTENT_WEBHOOK_TOKEN=tk_...

# Android beendet Hintergrundprozesse ohne Vorwarnung. Der Zustand liegt auf
# Platte, ein Wiederanlauf ist also gefahrlos — eine ausgelöste Sicherung
# bleibt dabei ausgelöst und verhindert weiteren Handel.
while true; do
    python -m assistant \\
        --paar {a.paar} --takt {a.takt} --strategie {a.strategie} \\
        --max-order {a.max_order:g} --max-einsatz {a.max_einsatz:g} \\
        --max-tagesverlust {a.max_tagesverlust:g} \\
        --max-gesamtverlust {a.max_gesamtverlust:g} \\
        --betrieb {arbeitsverzeichnis / a.betrieb} \\
        live --scharf --takt-sekunden {takt} >> {arbeitsverzeichnis / a.betrieb}/termux.log 2>&1
    echo "$(date -u +%FT%TZ) Prozess beendet, Wiederanlauf in 60 s" \\
        >> {arbeitsverzeichnis / a.betrieb}/termux.log
    sleep 60
done
"""


def befehl_dienst(a) -> int:
    """Startvorlage ausgeben, passend zu den gesetzten Grenzen."""
    arbeitsverzeichnis = Path.cwd()
    if a.termux:
        vorlage = _termux_vorlage(a, arbeitsverzeichnis)
        if a.schreiben:
            ziel = Path(a.schreiben)
            ziel.write_text(vorlage)
            ziel.chmod(0o700)  # enthält womöglich einen Token
            print(f"\n  Geschrieben: {ziel}")
        else:
            print(vorlage)
        print("""
# ---------------------------------------------------------------------------
# Einrichtung auf Android, der Reihe nach
# ---------------------------------------------------------------------------
# 1. Termux und Termux:Boot aus F-DROID installieren, nicht aus dem Play Store.
#    Die Play-Store-Fassung ist veraltet und funktioniert nicht.
#      https://f-droid.org/packages/com.termux/
#      https://f-droid.org/packages/com.termux.boot/
#
# 2. Termux:Boot einmal öffnen und wieder schliessen. Ohne das startet nichts
#    nach einem Neustart.
#
# 3. In Android: Einstellungen → Apps → Termux → Akku → "Nicht eingeschränkt".
#    Sonst beendet Android den Assistenten nach wenigen Minuten.
#
# 4. In Termux:
#      pkg update && pkg upgrade -y
#      pkg install -y python git
#      git clone -b claude/video-anschauen-ejtvd9 \\
#          https://github.com/Doneste22/Projekt-1.git
#      cd Projekt-1/trade-assistent
#      python -m unittest discover -s tests -t .
#
# 5. Schlüssel ablegen (direkt auf dem Handy tippen oder einfügen):
#      mkdir -p betrieb
#      printf '%s\\n%s\\n' "DEIN_KEY" "DEIN_SECRET" > betrieb/kraken.key
#      chmod 600 betrieb/kraken.key
#
# 6. Prüfen:
#      python -m assistant einrichten
#
# 7. Erst danach dieses Skript nach ~/.termux/boot/ legen:
#      mkdir -p ~/.termux/boot
#      python -m assistant dienst --termux --schreiben \\
#          ~/.termux/boot/handelsassistent.sh
#
# Laufende Ausgabe ansehen:  tail -f betrieb/termux.log
# Sofort anhalten:           python -m assistant notbremse ziehen
# ---------------------------------------------------------------------------""")
        return 0
    einheit = f"""# /etc/systemd/system/handelsassistent.service
# Erzeugt von: python3 -m assistant dienst
[Unit]
Description=Handelsassistent ({a.paar}, {a.strategie})
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User={os.environ.get('USER', 'handel')}
WorkingDirectory={arbeitsverzeichnis}
# Schlüssel gehören in eine Datei mit Modus 600, nicht hierher:
EnvironmentFile=/etc/handelsassistent.env
Environment=HANDELSASSISTENT_SCHARF=ja-ich-will
ExecStart=/usr/bin/python3 -m assistant \\
    --paar {a.paar} --takt {a.takt} --strategie {a.strategie} \\
    --max-order {a.max_order:g} --max-einsatz {a.max_einsatz:g} \\
    --max-tagesverlust {a.max_tagesverlust:g} --max-gesamtverlust {a.max_gesamtverlust:g} \\
    --betrieb {arbeitsverzeichnis / a.betrieb} \\
    live --scharf --takt-sekunden 60
Restart=on-failure
RestartSec=60
# Eine ausgelöste Sicherung liegt auf Platte. Der Neustart sieht sie und
# handelt nicht — deshalb ist Restart hier ungefährlich.

[Install]
WantedBy=multi-user.target
"""
    if a.schreiben:
        Path(a.schreiben).write_text(einheit)
        print(f"\n  Geschrieben: {a.schreiben}")
        print("  Einrichten:")
        print(f"    sudo cp {a.schreiben} /etc/systemd/system/handelsassistent.service")
        print("    sudo systemctl daemon-reload && sudo systemctl enable --now handelsassistent")
        print("    journalctl -u handelsassistent -f\n")
    else:
        print(einheit)
        print("# /etc/handelsassistent.env (Modus 600):")
        print("#   KRAKEN_API_KEY=...")
        print("#   KRAKEN_API_SECRET=...")
        print("#   HANDELSASSISTENT_WEBHOOK=https://ntfy.sh/dein-geheimes-thema")
    return 0


def befehl_live(a) -> int:
    grenzen = _grenzen(a)
    grenzen.pruefe()
    sicherung = Sicherung(a.betrieb, grenzen)
    if sicherung.ausgeloest:
        print(f"\n  Sicherung ist ausgelöst: {sicherung.ausgeloest}")
        print("  Erst prüfen, dann zurücksetzen:")
        print("    python3 -m assistant sicherung --zuruecksetzen\n")
        return 5

    client = _client(a)
    if not client.schluessel:
        print("\n  Kein API-Schlüssel gefunden. Ohne den geht kein Handel.")
        print(f"  KRAKEN_API_KEY/KRAKEN_API_SECRET setzen oder {_schluesseldatei(a)} anlegen"
              " (zwei Zeilen, Modus 600).\n")
        return 2
    if client.systemstatus() != "online":
        print(f"\n  Börse meldet '{client.systemstatus()}' — kein Handel.\n")
        return 6

    scharf = _scharfschalten(a, grenzen)
    melder = notify.aus_umgebung()
    from .live import LiveBroker

    broker = LiveBroker(client, a.paar, sicherung, melder=melder, scharf=scharf,
                        max_schlupf=a.max_schlupf)
    r = Runner(
        a.paar, SCHRITTE[a.takt], _bauen(a), regeln=_regeln(a), kosten=_kosten(a),
        startkapital=a.kapital, quelle=a.quelle, arbeitsverzeichnis=a.betrieb,
        historie_tage=a.tage, nachziehen=a.nachziehen,
        broker=broker, sicherung=sicherung, melder=melder,
    )
    art = "SCHARF — echte Orders" if scharf else "Probelauf — Börse prüft, führt nicht aus"
    print(f"  {art}")
    print(f"  {a.paar} · {a.takt} · {a.strategie} · Takt {a.takt_sekunden}s")
    print(f"  Journal:   {r.journal_datei}")
    print(f"  Notbremse: python3 -m assistant --betrieb {a.betrieb} notbremse ziehen\n")
    melder.melden("Assistent gestartet", f"{a.paar} · {a.strategie} · {art}")
    r.schleife(takt=a.takt_sekunden, max_durchlaeufe=a.durchlaeufe)
    stand = r.stand()
    print(f"\n  Beendet nach {stand['ticks']} Durchläufen, "
          f"{stand['abgeschlossene_trades']} Trades.")
    print(sicherung.bericht() + "\n")
    melder.melden("Assistent beendet", f"{stand['ticks']} Durchläufe, "
                                       f"{stand['abgeschlossene_trades']} Trades")
    return 0


def befehl_notbremse(a) -> int:
    sicherung = Sicherung(a.betrieb)
    if a.was == "ziehen":
        sicherung.notbremse_ziehen()
        print(f"\n  Notbremse gezogen: {sicherung.notbremse}")
        print("  Keine neuen Orders. Offene Positionen bleiben stehen.\n")
    elif a.was == "schliessen":
        sicherung.notbremse_ziehen(schliessen=True)
        print(f"\n  Notbremse gezogen mit Auflösung: {sicherung.notbremse}")
        print("  Der Assistent verkauft beim nächsten Durchlauf und hält an.\n")
    else:
        sicherung.notbremse_loesen()
        print("\n  Notbremse gelöst.\n")
    return 0


def befehl_sicherung(a) -> int:
    sicherung = Sicherung(a.betrieb)
    if a.zuruecksetzen:
        vorher = sicherung.zuruecksetzen()
        print(f"\n  Zurückgesetzt: {vorher or 'es war nichts ausgelöst'}\n")
        return 0
    print()
    print(sicherung.bericht())
    print()
    return 0


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python3 -m assistant",
        description="Handelsassistent: rechnet Signale, backtestet sie und "
                    "handelt sie selbstständig auf Papier.",
        epilog="Papierbetrieb ist die Vorgabe. Echte Orders nur über 'live --scharf', "
               "mit Rückfrage und absoluten Betragsgrenzen. Notbremse: "
               "'notbremse ziehen'.",
    )
    p.add_argument("--symbol", default="btcusd", help="Handelspaar (Vorgabe: btcusd)")
    p.add_argument("--takt", default="1t", choices=list(SCHRITTE), help="Kerzenlänge")
    p.add_argument("--tage", type=int, default=730, help="Historie in Tagen")
    p.add_argument("--strategie", default="trendfolge", choices=list(STRATEGIEN))
    p.add_argument("--kapital", type=float, default=10_000.0)
    p.add_argument("--gebuehr", type=float, default=0.001, help="Gebührensatz (0,001 = 0,1 %%)")
    p.add_argument("--schlupf", type=float, default=0.0005)
    p.add_argument("--risiko", type=float, default=0.01, help="Kapitalanteil je Trade")
    p.add_argument("--max-anteil", dest="max_anteil", type=float, default=0.25)
    p.add_argument("--schwelle", type=float, default=0.4, help="Mindeststärke fürs Handeln")
    p.add_argument("--abkuehlung", type=int, default=3, help="Sperrkerzen nach einem Ausstieg")
    p.add_argument("--nachziehen", type=float, default=0.0, help="Nachgezogener Stop in ATR (0 = aus)")
    p.add_argument("--quelle", default="bitstamp", choices=list(sources.QUELLEN))
    p.add_argument("--daten", default="daten", help="Cache-Verzeichnis")
    p.add_argument("--betrieb", default="betrieb", help="Arbeitsverzeichnis des Dauerbetriebs")
    p.add_argument("--offline", action="store_true", help="Nur Cache, kein Netz")
    p.add_argument("--paar", default="XBTUSD", help="Börsenpaar für den Echtbetrieb")
    p.add_argument("--schluesseldatei", default=None,
                   help="Datei mit Schlüssel und Geheimnis (Modus 600); "
                        "Vorgabe: kraken.key im Betriebsverzeichnis")
    p.add_argument("--max-order", dest="max_order", type=float, default=100.0,
                   help="was eine einzelne Order höchstens kosten darf")
    p.add_argument("--max-einsatz", dest="max_einsatz", type=float, default=500.0,
                   help="was insgesamt im Markt stehen darf")
    p.add_argument("--max-tagesverlust", dest="max_tagesverlust", type=float, default=50.0)
    p.add_argument("--max-gesamtverlust", dest="max_gesamtverlust", type=float, default=150.0)
    p.add_argument("--max-orders", dest="max_orders", type=int, default=10,
                   help="Orders je Tag")

    u = p.add_subparsers(dest="befehl", required=True)
    u.add_parser("signal", help="aktuelles Signal mit voller Begründung")

    b = u.add_parser("backtest", help="Strategie gegen die Vergangenheit prüfen")
    b.add_argument("--bericht", help="HTML-Bericht in diese Datei schreiben")
    b.add_argument("--ausfuehrlich", action="store_true", help="jeden Handelsschritt zeigen")

    u.add_parser("vergleich", help="alle Strategien nebeneinander")

    v = u.add_parser("vorwaerts", help="Vorwärtsprüfung gegen Überanpassung")
    v.add_argument("--training", type=float, default=0.6, help="Anteil für die Optimierung")

    l = u.add_parser("laufen", help="selbstständiger Papierbetrieb")
    l.add_argument("--takt-sekunden", dest="takt_sekunden", type=int, default=300)
    l.add_argument("--durchlaeufe", type=int, help="nach so vielen Durchläufen beenden")

    u.add_parser("stand", help="Zustand des Dauerbetriebs zeigen")
    u.add_parser("daten", help="Cache-Inhalt zeigen")
    u.add_parser("konto", help="Börsenzugang und Guthaben prüfen — bewegt nichts")
    u.add_parser("einrichten", help="alles der Reihe nach prüfen, bevor scharf geschaltet wird")

    ds = u.add_parser("dienst", help="Startvorlage für den Dauerbetrieb ausgeben")
    ds.add_argument("--schreiben", help="in diese Datei schreiben statt auszugeben")
    ds.add_argument("--termux", action="store_true",
                    help="Startskript für Android/Termux statt systemd")
    ds.add_argument("--takt-sekunden", dest="takt_sekunden", type=int, default=300,
                    help="Taktabstand im erzeugten Skript")

    e = u.add_parser("live", help="Betrieb an der echten Börse")
    e.add_argument("--scharf", action="store_true",
                   help="echte Orders statt Probelauf (fragt zurück)")
    e.add_argument("--takt-sekunden", dest="takt_sekunden", type=int, default=60)
    e.add_argument("--durchlaeufe", type=int, help="nach so vielen Durchläufen beenden")
    e.add_argument("--max-schlupf", dest="max_schlupf", type=float, default=0.005,
                   help="wie weit das Limit jenseits des Marktes liegen darf")

    n = u.add_parser("notbremse", help="Handel sofort anhalten")
    n.add_argument("was", choices=["ziehen", "schliessen", "loesen"],
                   help="ziehen = keine neuen Orders; schliessen = zusätzlich auflösen")

    si = u.add_parser("sicherung", help="Schutzschaltungen zeigen oder zurücksetzen")
    si.add_argument("--zuruecksetzen", action="store_true")
    return p


def main(argv: list[str] | None = None) -> int:
    a = parser().parse_args(argv)
    befehle = {
        "signal": befehl_signal, "backtest": befehl_backtest,
        "vergleich": befehl_vergleich, "vorwaerts": befehl_vorwaerts,
        "laufen": befehl_laufen, "stand": befehl_stand, "daten": befehl_daten,
        "konto": befehl_konto, "live": befehl_live,
        "einrichten": befehl_einrichten, "dienst": befehl_dienst,
        "notbremse": befehl_notbremse, "sicherung": befehl_sicherung,
    }
    try:
        return befehle[a.befehl](a)
    except sources.QuellenFehler as f:
        print(f"\n  Datenproblem: {f}\n", file=sys.stderr)
        return 2
    except ValueError as f:
        print(f"\n  Geht nicht: {f}\n", file=sys.stderr)
        return 3
    except Angehalten as f:
        print(f"\n  ANGEHALTEN: {f}\n", file=sys.stderr)
        return 5
    except BoersenFehler as f:
        print(f"\n  Börse: {f}\n", file=sys.stderr)
        return 6
    except KeyboardInterrupt:
        print("\n  Abgebrochen.\n")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
