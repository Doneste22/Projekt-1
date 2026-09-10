"""Backtest — die Strategie gegen die Vergangenheit, so ehrlich wie möglich.

Drei Regeln, die den Unterschied zwischen Messung und Selbstbetrug ausmachen:

1. Kein Blick nach vorn. Entschieden wird auf der *abgeschlossenen* Kerze i,
   ausgeführt wird zur Eröffnung der Kerze i+1. Wer auf den Schlusskurs
   derselben Kerze kauft, handelt mit Kursen, die er zum Zeitpunkt der
   Entscheidung noch nicht kannte.
2. Im Zweifel gegen sich selbst. Trifft eine Kerze Stop und Ziel, zählt der
   Stop — welcher zuerst kam, verrät die Kerze nicht.
3. Immer gegen "Kaufen und Liegenlassen" messen. Eine Strategie, die den
   simplen Kauf nicht schlägt, hat ihren Aufwand nicht verdient.
"""

from __future__ import annotations

import math
import statistics
from dataclasses import dataclass, field
from datetime import datetime, timezone

from .candles import Series
from .execution import CostModel
from .portfolio import Portfolio, Position, Trade
from .risk import RiskManager, RiskRules, groesse_bestimmen, stop_absichern
from .strategy import Direction, Strategy


@dataclass(slots=True)
class Metrics:
    startkapital: float
    endkapital: float
    gesamtrendite: float
    jahresrendite: float
    max_rueckgang: float
    max_rueckgang_dauer: int
    sharpe: float
    sortino: float
    trades: int
    trefferquote: float
    gewinnfaktor: float
    erwartungswert: float
    schnitt_gewinn: float
    schnitt_verlust: float
    groesster_gewinn: float
    groesster_verlust: float
    schnitt_dauer_kerzen: float
    marktzeit: float
    gebuehren: float
    vergleich_rendite: float
    vergleich_rueckgang: float
    tage: int

    @property
    def schlaegt_markt(self) -> bool:
        return self.gesamtrendite > self.vergleich_rendite

    def als_dict(self) -> dict:
        return {f: getattr(self, f) for f in self.__slots__}


@dataclass(slots=True)
class Auftrag:
    """Zur nächsten Eröffnung vorgemerkte Handlung, mitsamt ihren Vorgaben."""

    art: str  # "kaufen" oder "schliessen"
    grund: str
    stop: float | None = None
    ziel: float | None = None


@dataclass(slots=True)
class Ergebnis:
    metrics: Metrics
    portfolio: Portfolio
    series: Series
    strategie: str
    protokoll: list[str] = field(default_factory=list)

    @property
    def trades(self) -> list[Trade]:
        return self.portfolio.trades


def _max_rueckgang(kurve: list[float]) -> tuple[float, int]:
    """Grösster Rückgang vom Höchststand und seine Dauer in Kerzen."""
    if not kurve:
        return 0.0, 0
    hoch = kurve[0]
    schlimmster = 0.0
    seit_hoch = 0
    laengste = 0
    for wert in kurve:
        if wert >= hoch:
            hoch, seit_hoch = wert, 0
        else:
            seit_hoch += 1
            laengste = max(laengste, seit_hoch)
            if hoch:
                schlimmster = max(schlimmster, (hoch - wert) / hoch)
    return schlimmster, laengste


def _kennzahlen(
    portfolio: Portfolio, series: Series, kerzen_gehalten: int, startkapital: float
) -> Metrics:
    werte = [w for _, w in portfolio.kapitalkurve]
    end = werte[-1] if werte else startkapital
    schritte = series.step
    pro_jahr = 365 * 86400 / schritte if schritte else 365
    kerzen = max(len(werte), 1)
    jahre = kerzen / pro_jahr

    gesamt = end / startkapital - 1.0 if startkapital else 0.0
    jahres = ((end / startkapital) ** (1 / jahre) - 1.0) if (jahre > 0 and end > 0 and startkapital) else 0.0

    renditen = [(b - a) / a for a, b in zip(werte, werte[1:]) if a]
    if len(renditen) > 1:
        m = statistics.fmean(renditen)
        s = statistics.pstdev(renditen)
        sharpe = (m / s * math.sqrt(pro_jahr)) if s else 0.0
        runter = [r for r in renditen if r < 0]
        s_ab = statistics.pstdev(runter) if len(runter) > 1 else 0.0
        sortino = (m / s_ab * math.sqrt(pro_jahr)) if s_ab else 0.0
    else:
        sharpe = sortino = 0.0

    rueckgang, dauer = _max_rueckgang(werte)

    ts = portfolio.trades
    gewinne = [t.netto for t in ts if t.gewonnen]
    verluste = [t.netto for t in ts if not t.gewonnen]
    summe_v = abs(sum(verluste))
    gewinnfaktor = (sum(gewinne) / summe_v) if summe_v else (float("inf") if gewinne else 0.0)
    schnitt_g = statistics.fmean(gewinne) if gewinne else 0.0
    schnitt_v = statistics.fmean(verluste) if verluste else 0.0
    treffer = len(gewinne) / len(ts) if ts else 0.0
    erwartung = statistics.fmean([t.netto for t in ts]) if ts else 0.0
    dauer_kerzen = (
        statistics.fmean([t.dauer_sekunden / schritte for t in ts]) if ts and schritte else 0.0
    )

    # Vergleich: am ersten Tag alles kaufen, liegen lassen.
    kurse = series.closes()
    vergleich = kurse[-1] / kurse[0] - 1.0 if kurse and kurse[0] else 0.0
    v_rueck, _ = _max_rueckgang(kurse)

    return Metrics(
        startkapital=startkapital, endkapital=end,
        gesamtrendite=gesamt, jahresrendite=jahres,
        max_rueckgang=rueckgang, max_rueckgang_dauer=dauer,
        sharpe=sharpe, sortino=sortino,
        trades=len(ts), trefferquote=treffer, gewinnfaktor=gewinnfaktor,
        erwartungswert=erwartung, schnitt_gewinn=schnitt_g, schnitt_verlust=schnitt_v,
        groesster_gewinn=max(gewinne) if gewinne else 0.0,
        groesster_verlust=min(verluste) if verluste else 0.0,
        schnitt_dauer_kerzen=dauer_kerzen,
        marktzeit=kerzen_gehalten / kerzen if kerzen else 0.0,
        gebuehren=portfolio.gebuehren_gesamt,
        vergleich_rendite=vergleich, vergleich_rueckgang=v_rueck,
        tage=int(len(series) * schritte / 86400),
    )


def run(
    series: Series,
    strategie: Strategy,
    regeln: RiskRules | None = None,
    startkapital: float = 10_000.0,
    kosten: CostModel | None = None,
    nachziehen: float = 0.0,
    ausfuehrlich: bool = False,
) -> Ergebnis:
    """Führt die Strategie über die Serie aus.

    `nachziehen`: Vielfaches des ATR für die nachgezogene Absicherung.
    0 schaltet sie ab.
    """
    regeln = regeln or RiskRules()
    kosten = kosten or CostModel()
    strategie.prepare(series)
    depot = Portfolio(startkapital=startkapital)
    waechter = RiskManager(regeln)
    symbol = series.symbol
    atr_reihe = getattr(strategie, "atr", None)

    protokoll: list[str] = []
    auftrag: Auftrag | None = None
    gehalten = 0

    def notiz(ts: int, text: str) -> None:
        if ausfuehrlich:
            zeit = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M")
            protokoll.append(f"{zeit}  {text}")

    for i in range(1, len(series)):
        kerze = series[i]
        tag = datetime.fromtimestamp(kerze.ts, tz=timezone.utc).strftime("%Y-%m-%d")
        waechter.tageswechsel(tag, depot.kapital({symbol: kerze.open}))

        # (a) Auftrag der Vorkerze zur Eröffnung ausführen
        if auftrag:
            art, grund = auftrag.art, auftrag.grund
            if art == "kaufen" and symbol not in depot.positionen:
                kapital = depot.kapital({symbol: kerze.open})
                stop = stop_absichern(kerze.open, auftrag.stop, regeln)
                menge = groesse_bestimmen(
                    kapital, depot.bargeld, kerze.open, stop, regeln, kosten.gebuehr_satz
                )
                if menge > 0:
                    aus = kosten.kaufen(kerze.open, menge)
                    if aus.kurs * menge + aus.gebuehr <= depot.bargeld:
                        depot.eroeffne(Position(
                            symbol=symbol, menge=menge, einstieg=aus.kurs,
                            einstieg_ts=kerze.ts, stop=stop, ziel=auftrag.ziel,
                            gebuehr_bezahlt=aus.gebuehr, begruendung=grund,
                        ))
                        notiz(kerze.ts, f"KAUF {menge:.6f} zu {aus.kurs:.2f}, Stop {stop:.2f} — {grund}")
            elif art == "schliessen" and symbol in depot.positionen:
                pos = depot.positionen[symbol]
                aus = kosten.verkaufen(kerze.open, pos.menge)
                t = depot.schliesse(symbol, aus.kurs, kerze.ts, aus.gebuehr, grund)
                waechter.ausstieg_vermerken(symbol, i)
                notiz(kerze.ts, f"VERKAUF zu {aus.kurs:.2f} — {grund} ({t.netto:+.2f})")
            auftrag = None

        # (b) Stop und Ziel innerhalb der Kerze prüfen — Stop hat Vorrang
        if symbol in depot.positionen:
            pos = depot.positionen[symbol]
            pos.hoechststand = max(pos.hoechststand, kerze.high)
            if nachziehen and atr_reihe and atr_reihe[i]:
                gezogen = pos.hoechststand - nachziehen * atr_reihe[i]
                if pos.stop is None or gezogen > pos.stop:
                    pos.stop = gezogen
            if pos.stop is not None and kerze.low <= pos.stop:
                # Eröffnet die Kerze unter dem Stop, wird zur Eröffnung gefüllt.
                fuell = min(pos.stop, kerze.open)
                aus = kosten.verkaufen(fuell, pos.menge)
                t = depot.schliesse(symbol, aus.kurs, kerze.ts, aus.gebuehr, "Stop erreicht")
                waechter.ausstieg_vermerken(symbol, i)
                notiz(kerze.ts, f"STOP zu {aus.kurs:.2f} ({t.netto:+.2f})")
            elif pos.ziel is not None and kerze.high >= pos.ziel:
                fuell = max(pos.ziel, kerze.open)
                aus = kosten.verkaufen(fuell, pos.menge)
                t = depot.schliesse(symbol, aus.kurs, kerze.ts, aus.gebuehr, "Ziel erreicht")
                waechter.ausstieg_vermerken(symbol, i)
                notiz(kerze.ts, f"ZIEL zu {aus.kurs:.2f} ({t.netto:+.2f})")

        if symbol in depot.positionen:
            gehalten += 1

        # (c) Kapital zum Schlusskurs festhalten
        depot.notiere(kerze.ts, {symbol: kerze.close})

        # (d) Auf der abgeschlossenen Kerze entscheiden, für die nächste vormerken
        if i + 1 >= len(series):
            continue
        if symbol in depot.positionen:
            raus = strategie.exit_signal(i, depot.positionen[symbol].einstieg)
            if raus is not None:
                auftrag = Auftrag(
                    "schliessen",
                    raus.gruende[0].text if raus.gruende else "Strategieausstieg",
                )
        else:
            sig = strategie.evaluate(i)
            if sig.richtung is Direction.LONG:
                kapital = depot.kapital({symbol: kerze.close})
                erlaubt, warum = waechter.darf_eroeffnen(
                    symbol, i, sig.staerke, kapital, startkapital, len(depot.positionen)
                )
                if erlaubt:
                    kurz = "; ".join(g.indikator for g in sig.dafuer[:3])
                    auftrag = Auftrag(
                        "kaufen", f"Neigung {sig.neigung}: {kurz}", sig.stop, sig.ziel
                    )
                else:
                    notiz(kerze.ts, f"Signal verworfen — {warum}")

    # Offene Position am Ende zum letzten Kurs schliessen, sonst hinkt die Bilanz
    if symbol in depot.positionen:
        letzte = series[-1]
        pos = depot.positionen[symbol]
        aus = kosten.verkaufen(letzte.close, pos.menge)
        depot.schliesse(symbol, aus.kurs, letzte.ts, aus.gebuehr, "Testende")

    return Ergebnis(
        metrics=_kennzahlen(depot, series, gehalten, startkapital),
        portfolio=depot, series=series, strategie=strategie.name, protokoll=protokoll,
    )
