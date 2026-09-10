"""Ausführung: Gebühren, Schlupf, Broker-Anbindung.

Der Unterschied zwischen einer Strategie auf dem Papier und einer im Markt ist
fast immer die Ausführung. Wer ohne Gebühren und Schlupf backtestet, misst eine
Strategie, die es nicht gibt.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class Execution:
    kurs: float     # tatsächlicher Ausführungskurs inklusive Schlupf
    gebuehr: float
    richtkurs: float

    @property
    def schlupf(self) -> float:
        return abs(self.kurs - self.richtkurs)


class CostModel:
    """Gebühren als Anteil des Volumens, Schlupf als Anteil des Kurses.

    Vorgabewerte orientieren sich am Taker-Tarif gängiger Kryptobörsen
    (0,1 %) und einem halben Basispunkt Schlupf bei liquiden Paaren.
    """

    def __init__(self, gebuehr_satz: float = 0.001, schlupf_satz: float = 0.0005):
        if gebuehr_satz < 0 or schlupf_satz < 0:
            raise ValueError("Gebühr und Schlupf dürfen nicht negativ sein")
        self.gebuehr_satz = gebuehr_satz
        self.schlupf_satz = schlupf_satz

    def kaufen(self, richtkurs: float, menge: float) -> Execution:
        kurs = richtkurs * (1.0 + self.schlupf_satz)  # Kauf füllt schlechter, also höher
        return Execution(kurs, kurs * menge * self.gebuehr_satz, richtkurs)

    def verkaufen(self, richtkurs: float, menge: float) -> Execution:
        kurs = richtkurs * (1.0 - self.schlupf_satz)  # Verkauf füllt tiefer
        return Execution(kurs, kurs * menge * self.gebuehr_satz, richtkurs)


class Broker(Protocol):
    name: str

    def kurs(self, symbol: str) -> float: ...
    def kaufen(self, symbol: str, menge: float, richtkurs: float) -> Execution: ...
    def verkaufen(self, symbol: str, menge: float, richtkurs: float) -> Execution: ...


class PaperBroker:
    """Simulierte Ausführung gegen echte Kurse. Es fliesst kein Geld."""

    name = "papier"
    echt = False

    def __init__(self, kosten: CostModel | None = None, kursquelle=None):
        self.kosten = kosten or CostModel()
        self.kursquelle = kursquelle

    def kurs(self, symbol: str) -> float:
        if self.kursquelle is None:
            raise RuntimeError("Keine Kursquelle gesetzt")
        return self.kursquelle(symbol)

    def kaufen(self, symbol: str, menge: float, richtkurs: float) -> Execution:
        return self.kosten.kaufen(richtkurs, menge)

    def verkaufen(self, symbol: str, menge: float, richtkurs: float) -> Execution:
        return self.kosten.verkaufen(richtkurs, menge)


class LiveBroker:
    """Absichtlich nicht implementiert.

    Für echte Orders fehlt hier alles, was dafür nötig wäre: geprüfte
    Schlüsselverwaltung, Auftragsabgleich nach Verbindungsabbruch, Umgang mit
    Teilausführungen, Notabschaltung. Diese Klasse existiert als Platzhalter
    und als Sperre — damit niemand versehentlich echtes Geld bewegt, weil ein
    Schalter zu leicht umzulegen war.
    """

    name = "live"
    echt = True

    def __init__(self, *_, **__):
        raise NotImplementedError(
            "Echter Handel ist in diesem Werkzeug nicht implementiert.\n"
            "Erst müssten Schlüsselverwaltung, Auftragsabgleich, Teilausführungen und\n"
            "eine Notabschaltung gebaut und geprüft werden. Bis dahin: Papierbetrieb.\n"
            "Und davor gehört ein Backtest über mehrere Marktphasen plus ein\n"
            "Vorwärtstest über Monate — nicht ein guter Wochenverlauf."
        )
