"""Vorwärtsprüfung — der Test gegen den Selbstbetrug.

Wer Parameter so lange dreht, bis der Backtest glänzt, hat nichts über den
Markt gelernt, sondern eine Kurve auswendig gelernt. Diese Rechnung ist bei
genug Versuchen immer zu gewinnen und im Betrieb immer verloren.

Das Gegenmittel: Teile die Historie. Optimiere nur im vorderen Abschnitt und
miss im hinteren, den die Optimierung nie gesehen hat. Fällt das Ergebnis
danach zusammen, war der schöne Backtest angepasstes Rauschen.
"""

from __future__ import annotations

import itertools
from dataclasses import dataclass

from .backtest import Ergebnis, run
from .candles import Series
from .execution import CostModel
from .risk import RiskRules
from .strategy import Strategy


@dataclass(slots=True)
class Abschnitt:
    name: str
    ergebnis: Ergebnis

    @property
    def rendite(self) -> float:
        return self.ergebnis.metrics.gesamtrendite


@dataclass(slots=True)
class Vorwaertsergebnis:
    training: Abschnitt
    pruefung: Abschnitt
    beste_parameter: dict
    versuche: int

    @property
    def zusammenbruch(self) -> float:
        """Wie viel der Trainingsrendite im ungesehenen Teil übrig bleibt."""
        if self.training.rendite <= 0:
            return 0.0
        return self.pruefung.rendite / self.training.rendite

    def urteil(self) -> str:
        t, p = self.training.rendite, self.pruefung.rendite
        if t <= 0:
            return ("Schon im Trainingsabschnitt kein Gewinn — hier ist nichts,\n"
                    "  was sich zu prüfen lohnte.")
        if p <= 0:
            return ("Im Training Gewinn, im ungesehenen Abschnitt Verlust.\n"
                    "  Das ist das übliche Bild angepasster Parameter. Nicht verwenden.")
        anteil = self.zusammenbruch
        if anteil < 0.3:
            return (f"Vom Trainingsergebnis bleiben nur {anteil:.0%} übrig.\n"
                    "  Starkes Anzeichen für Überanpassung.")
        if anteil < 0.7:
            return (f"Es bleiben {anteil:.0%} des Trainingsergebnisses — spürbarer\n"
                    "  Rückgang, aber im erwartbaren Rahmen.")
        return (f"Das Ergebnis hält sich im ungesehenen Abschnitt ({anteil:.0%}).\n"
                "  Der seltene gute Fall. Trotzdem: erst Vorwärtsbetrieb, dann Urteil.")


def teile(series: Series, anteil_training: float = 0.6) -> tuple[Series, Series]:
    """Zeitlich teilen — niemals zufällig. Kursreihen haben eine Richtung."""
    if not 0.2 <= anteil_training <= 0.9:
        raise ValueError("Trainingsanteil gehört zwischen 0,2 und 0,9")
    schnitt = int(len(series) * anteil_training)
    return series[:schnitt], series[schnitt:]


def raster_suche(
    series: Series,
    klasse: type[Strategy],
    raster: dict[str, list],
    regeln: RiskRules | None = None,
    kosten: CostModel | None = None,
    startkapital: float = 10_000.0,
    mindest_trades: int = 10,
) -> tuple[dict, Ergebnis | None, int]:
    """Alle Kombinationen durchprobieren, beste nach Sharpe.

    Bewusst nach Sharpe und nicht nach Rendite: Der höchste Endstand stammt
    oft von einem einzigen Glückstreffer. Zusätzlich gilt eine Mindestzahl an
    Trades — was zweimal funktioniert hat, hat gar nichts gezeigt.
    """
    namen = list(raster)
    bestes: Ergebnis | None = None
    beste_werte: dict = {}
    versuche = 0
    for werte in itertools.product(*(raster[n] for n in namen)):
        kombination = dict(zip(namen, werte))
        versuche += 1
        try:
            e = run(series, klasse(**kombination), regeln=regeln,
                    startkapital=startkapital, kosten=kosten)
        except (ValueError, TypeError):
            continue
        if e.metrics.trades < mindest_trades:
            continue
        if bestes is None or e.metrics.sharpe > bestes.metrics.sharpe:
            bestes, beste_werte = e, kombination
    return beste_werte, bestes, versuche


def vorwaerts(
    series: Series,
    klasse: type[Strategy],
    raster: dict[str, list],
    anteil_training: float = 0.6,
    regeln: RiskRules | None = None,
    kosten: CostModel | None = None,
    startkapital: float = 10_000.0,
) -> Vorwaertsergebnis:
    """Im vorderen Abschnitt optimieren, im hinteren messen."""
    trainieren, pruefen = teile(series, anteil_training)
    beste, bestes, versuche = raster_suche(
        trainieren, klasse, raster, regeln, kosten, startkapital
    )
    if bestes is None:
        raise ValueError(
            "Keine Kombination erreichte die Mindestzahl an Trades. "
            "Mehr Historie oder ein feineres Zeitraster nehmen."
        )
    nachher = run(pruefen, klasse(**beste), regeln=regeln,
                  startkapital=startkapital, kosten=kosten)
    return Vorwaertsergebnis(
        training=Abschnitt("Training", bestes),
        pruefung=Abschnitt("ungesehen", nachher),
        beste_parameter=beste,
        versuche=versuche,
    )
