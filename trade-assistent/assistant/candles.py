"""Kerzendaten: Modell und Serie.

Eine Kerze ist ein abgeschlossenes Zeitintervall mit Open/High/Low/Close/Volume.
Wichtig: Die jüngste Kerze einer Live-Abfrage ist noch offen. Ihre Werte ändern
sich bis zum Intervallende, Indikatoren darauf "repainten". Entscheidungen
fallen deshalb ausschliesslich auf `Series.closed()`.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable, Iterator, Sequence


@dataclass(frozen=True, slots=True)
class Candle:
    ts: int  # Unix-Sekunden, Beginn des Intervalls
    open: float
    high: float
    low: float
    close: float
    volume: float

    @property
    def time(self) -> datetime:
        return datetime.fromtimestamp(self.ts, tz=timezone.utc)

    @property
    def typical(self) -> float:
        return (self.high + self.low + self.close) / 3.0

    @property
    def span(self) -> float:
        return self.high - self.low

    def as_row(self) -> list:
        return [self.ts, self.open, self.high, self.low, self.close, self.volume]

    @classmethod
    def from_row(cls, row: Sequence) -> "Candle":
        return cls(
            int(row[0]),
            float(row[1]),
            float(row[2]),
            float(row[3]),
            float(row[4]),
            float(row[5]),
        )


class Series:
    """Aufsteigend sortierte, duplikatfreie Kerzenfolge fester Schrittweite."""

    __slots__ = ("symbol", "step", "candles")

    def __init__(self, symbol: str, step: int, candles: Iterable[Candle]):
        self.symbol = symbol
        self.step = int(step)  # Intervallänge in Sekunden
        seen: dict[int, Candle] = {}
        for c in candles:
            seen[c.ts] = c
        self.candles: list[Candle] = [seen[k] for k in sorted(seen)]

    # -- Sequenzprotokoll ---------------------------------------------------
    def __len__(self) -> int:
        return len(self.candles)

    def __iter__(self) -> Iterator[Candle]:
        return iter(self.candles)

    def __getitem__(self, i):
        if isinstance(i, slice):
            return Series(self.symbol, self.step, self.candles[i])
        return self.candles[i]

    def __repr__(self) -> str:
        if not self.candles:
            return f"<Series {self.symbol} leer>"
        return (
            f"<Series {self.symbol} {self.step}s {len(self)} Kerzen "
            f"{self.candles[0].time:%Y-%m-%d} .. {self.candles[-1].time:%Y-%m-%d}>"
        )

    # -- Spalten ------------------------------------------------------------
    def closes(self) -> list[float]:
        return [c.close for c in self.candles]

    def highs(self) -> list[float]:
        return [c.high for c in self.candles]

    def lows(self) -> list[float]:
        return [c.low for c in self.candles]

    def volumes(self) -> list[float]:
        return [c.volume for c in self.candles]

    # -- Hygiene ------------------------------------------------------------
    def closed(self, now: float | None = None) -> "Series":
        """Ohne die noch laufende Kerze.

        Eine Kerze gilt als abgeschlossen, wenn ihr Intervallende erreicht ist.
        """
        import time as _time

        jetzt = _time.time() if now is None else now
        fertig = [c for c in self.candles if c.ts + self.step <= jetzt]
        return Series(self.symbol, self.step, fertig)

    def gaps(self) -> list[tuple[int, int]]:
        """Fehlende Intervalle als (nach_ts, fehlende_anzahl).

        Börsen liefern Lücken bei Ausfällen oder umsatzlosen Intervallen. Wer
        sie nicht kennt, rechnet Indikatoren über Zeitsprünge hinweg.
        """
        luecken = []
        for a, b in zip(self.candles, self.candles[1:]):
            fehlend = (b.ts - a.ts) // self.step - 1
            if fehlend > 0:
                luecken.append((a.ts, int(fehlend)))
        return luecken

    def tail(self, n: int) -> "Series":
        return Series(self.symbol, self.step, self.candles[-n:] if n else [])

    def between(self, start: int | None = None, end: int | None = None) -> "Series":
        sel = [
            c
            for c in self.candles
            if (start is None or c.ts >= start) and (end is None or c.ts < end)
        ]
        return Series(self.symbol, self.step, sel)

    def returns(self) -> list[float]:
        """Einfache Renditen von Schluss zu Schluss."""
        cl = self.closes()
        return [(b - a) / a for a, b in zip(cl, cl[1:]) if a]

    def stdev_of_returns(self) -> float:
        r = self.returns()
        return statistics.pstdev(r) if len(r) > 1 else 0.0
