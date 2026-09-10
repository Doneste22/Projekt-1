"""Kommandozeile: python3 -m assistant <befehl>"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import sources
from .backtest import run
from .execution import CostModel
from .report import html_bericht, text_bericht
from .risk import RiskRules
from .runner import Runner
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


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python3 -m assistant",
        description="Handelsassistent: rechnet Signale, backtestet sie und "
                    "handelt sie selbstständig auf Papier.",
        epilog="Papierbetrieb. Echter Handel ist nicht implementiert.",
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
    return p


def main(argv: list[str] | None = None) -> int:
    a = parser().parse_args(argv)
    befehle = {
        "signal": befehl_signal, "backtest": befehl_backtest,
        "vergleich": befehl_vergleich, "vorwaerts": befehl_vorwaerts,
        "laufen": befehl_laufen, "stand": befehl_stand, "daten": befehl_daten,
    }
    try:
        return befehle[a.befehl](a)
    except sources.QuellenFehler as f:
        print(f"\n  Datenproblem: {f}\n", file=sys.stderr)
        return 2
    except ValueError as f:
        print(f"\n  Geht nicht: {f}\n", file=sys.stderr)
        return 3
    except KeyboardInterrupt:
        print("\n  Abgebrochen.\n")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
