"""Depot: Positionen, Bargeld, Handelsbuch, Kapitalkurve."""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone


def _zeit(ts: int) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M")


@dataclass(slots=True)
class Position:
    symbol: str
    menge: float
    einstieg: float
    einstieg_ts: int
    stop: float | None = None
    ziel: float | None = None
    hoechststand: float = 0.0  # für die nachgezogene Absicherung
    gebuehr_bezahlt: float = 0.0
    begruendung: str = ""

    def __post_init__(self) -> None:
        if not self.hoechststand:
            self.hoechststand = self.einstieg

    @property
    def einsatz(self) -> float:
        return self.menge * self.einstieg

    def wert(self, kurs: float) -> float:
        return self.menge * kurs

    def gewinn(self, kurs: float) -> float:
        return (kurs - self.einstieg) * self.menge - self.gebuehr_bezahlt

    def gewinn_prozent(self, kurs: float) -> float:
        return (kurs / self.einstieg - 1.0) * 100.0 if self.einstieg else 0.0

    def als_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def aus_dict(cls, d: dict) -> "Position":
        return cls(**d)


@dataclass(slots=True)
class Trade:
    """Ein abgeschlossener Rundlauf: Einstieg bis Ausstieg."""

    symbol: str
    menge: float
    einstieg: float
    einstieg_ts: int
    ausstieg: float
    ausstieg_ts: int
    gebuehren: float
    grund: str
    einstiegsgrund: str = ""

    @property
    def brutto(self) -> float:
        return (self.ausstieg - self.einstieg) * self.menge

    @property
    def netto(self) -> float:
        return self.brutto - self.gebuehren

    @property
    def rendite(self) -> float:
        """Rendite auf den eingesetzten Betrag, nach Gebühren."""
        basis = self.einstieg * self.menge
        return self.netto / basis if basis else 0.0

    @property
    def gewonnen(self) -> bool:
        return self.netto > 0

    @property
    def dauer_sekunden(self) -> int:
        return self.ausstieg_ts - self.einstieg_ts

    def als_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def aus_dict(cls, d: dict) -> "Trade":
        return cls(**d)

    def __str__(self) -> str:
        z = "Gewinn" if self.gewonnen else "Verlust"
        return (
            f"{_zeit(self.einstieg_ts)} → {_zeit(self.ausstieg_ts)}  "
            f"{self.einstieg:.2f} → {self.ausstieg:.2f}  "
            f"{z} {self.netto:+.2f} ({self.rendite:+.2%})  [{self.grund}]"
        )


@dataclass(slots=True)
class Portfolio:
    startkapital: float
    bargeld: float = 0.0
    positionen: dict[str, Position] = field(default_factory=dict)
    trades: list[Trade] = field(default_factory=list)
    kapitalkurve: list[tuple[int, float]] = field(default_factory=list)
    gebuehren_gesamt: float = 0.0

    def __post_init__(self) -> None:
        if not self.bargeld:
            self.bargeld = self.startkapital

    def kapital(self, kurse: dict[str, float]) -> float:
        """Bargeld plus Marktwert aller offenen Positionen."""
        offen = sum(p.wert(kurse.get(s, p.einstieg)) for s, p in self.positionen.items())
        return self.bargeld + offen

    def notiere(self, ts: int, kurse: dict[str, float]) -> None:
        self.kapitalkurve.append((ts, self.kapital(kurse)))

    def eroeffne(self, pos: Position) -> None:
        if pos.symbol in self.positionen:
            raise ValueError(f"Position in {pos.symbol} ist bereits offen")
        kosten = pos.einsatz + pos.gebuehr_bezahlt
        if kosten > self.bargeld + 1e-9:
            raise ValueError(f"Bargeld reicht nicht: {kosten:.2f} > {self.bargeld:.2f}")
        self.bargeld -= kosten
        self.gebuehren_gesamt += pos.gebuehr_bezahlt
        self.positionen[pos.symbol] = pos

    def schliesse(self, symbol: str, kurs: float, ts: int, gebuehr: float, grund: str) -> Trade:
        pos = self.positionen.pop(symbol)
        erloes = pos.menge * kurs - gebuehr
        self.bargeld += erloes
        self.gebuehren_gesamt += gebuehr
        trade = Trade(
            symbol=symbol, menge=pos.menge,
            einstieg=pos.einstieg, einstieg_ts=pos.einstieg_ts,
            ausstieg=kurs, ausstieg_ts=ts,
            gebuehren=pos.gebuehr_bezahlt + gebuehr,
            grund=grund, einstiegsgrund=pos.begruendung,
        )
        self.trades.append(trade)
        return trade

    # -- Zustand sichern ----------------------------------------------------
    def als_dict(self) -> dict:
        return {
            "startkapital": self.startkapital,
            "bargeld": self.bargeld,
            "positionen": {s: p.als_dict() for s, p in self.positionen.items()},
            "trades": [t.als_dict() for t in self.trades],
            "kapitalkurve": self.kapitalkurve,
            "gebuehren_gesamt": self.gebuehren_gesamt,
        }

    @classmethod
    def aus_dict(cls, d: dict) -> "Portfolio":
        p = cls(startkapital=d["startkapital"], bargeld=d["bargeld"])
        p.positionen = {s: Position.aus_dict(v) for s, v in d.get("positionen", {}).items()}
        p.trades = [Trade.aus_dict(t) for t in d.get("trades", [])]
        p.kapitalkurve = [tuple(x) for x in d.get("kapitalkurve", [])]
        p.gebuehren_gesamt = d.get("gebuehren_gesamt", 0.0)
        return p
