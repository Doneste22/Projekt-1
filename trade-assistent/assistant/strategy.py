"""Strategien: aus Indikatorwerten wird eine begründete Stimme.

Aufbau bewusst so, dass sich jede Entscheidung zerlegen lässt. Eine Strategie
liefert kein "HIGHER", sondern eine Liste von Stimmen — Indikator, gemessener
Wert, Richtung, Gewicht. Die Summe ergibt den Ausschlag, die Liste die
Begründung. Was im Protokoll steht, ist damit die tatsächliche Rechnung und
keine nachträgliche Erzählung.

Zur Vorausschau-Freiheit: `prepare()` rechnet die Indikatorreihen einmal über
die ganze Serie. Das ist erlaubt, weil jeder Indikator hier kausal ist — der
Wert an Position i hängt nur von Kursen bis i ab. `evaluate(i)` liest
ausschliesslich Position i und früher.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

from . import indicators as ind
from .candles import Series


class Direction(Enum):
    LONG = "long"
    FLAT = "flat"
    EXIT = "exit"

    def __str__(self) -> str:
        return {"long": "KAUFEN", "flat": "ABWARTEN", "exit": "SCHLIESSEN"}[self.value]


@dataclass(frozen=True, slots=True)
class Reason:
    """Eine Einzelstimme mit ihrem gemessenen Wert."""

    indikator: str
    wert: float | None
    stimme: float  # -1 (dagegen) .. +1 (dafür)
    gewicht: float
    text: str

    @property
    def beitrag(self) -> float:
        return self.stimme * self.gewicht

    def __str__(self) -> str:
        w = "—" if self.wert is None else f"{self.wert:.2f}"
        zeichen = "+" if self.beitrag > 0 else ("−" if self.beitrag < 0 else "·")
        return f"{zeichen} {self.indikator} {w} — {self.text}"


@dataclass(slots=True)
class Signal:
    richtung: Direction
    punkte: float  # -1 (klar dagegen) .. +1 (klar dafür)
    kurs: float
    ts: int
    gruende: list[Reason] = field(default_factory=list)
    stop: float | None = None
    ziel: float | None = None

    @property
    def staerke(self) -> float:
        """Wie stark der Fall *für* einen Kauf ist — nie der Betrag.

        Der Betrag wäre irreführend: Eine Bewertung von −0,64 heisst klar
        "nein" und sähe als "Stärke 64 %" aus wie ein knapp verfehltes "ja".
        """
        return max(self.punkte, 0.0)

    @property
    def neigung(self) -> str:
        return f"{self.punkte:+.0%}"

    @property
    def dafuer(self) -> list[Reason]:
        return [g for g in self.gruende if g.beitrag > 0]

    @property
    def dagegen(self) -> list[Reason]:
        return [g for g in self.gruende if g.beitrag < 0]

    def erklaerung(self) -> str:
        kopf = f"{self.richtung} (Neigung {self.neigung}) bei {self.kurs:.2f}"
        zeilen = [f"    {g}" for g in self.gruende]
        return "\n".join([kopf] + zeilen)


class Strategy:
    """Basisklasse. Ableitungen füllen `_stimmen()`."""

    name = "basis"

    def __init__(self, schwelle: float = 0.4):
        # Ab welcher normierten Summe überhaupt gehandelt wird.
        self.schwelle = schwelle
        self.series: Series | None = None

    # -- Vorbereitung -------------------------------------------------------
    def prepare(self, series: Series) -> None:
        self.series = series
        self._rechne(series)

    def _rechne(self, series: Series) -> None:  # pragma: no cover - Basis
        raise NotImplementedError

    def warmup(self) -> int:
        """Kerzen, die vor dem ersten gültigen Signal verstreichen müssen."""
        raise NotImplementedError

    def _stimmen(self, i: int) -> list[Reason]:  # pragma: no cover - Basis
        raise NotImplementedError

    def _stop_und_ziel(self, i: int) -> tuple[float | None, float | None]:
        return None, None

    # -- Auswertung ---------------------------------------------------------
    def evaluate(self, i: int) -> Signal:
        if self.series is None:
            raise RuntimeError("prepare() wurde nicht aufgerufen")
        kerze = self.series[i]
        if i < self.warmup():
            return Signal(
                Direction.FLAT, 0.0, kerze.close, kerze.ts,
                [Reason("Aufwärmphase", float(i), 0.0, 0.0, f"erst ab Kerze {self.warmup()}")],
            )
        gruende = self._stimmen(i)
        gewichte = sum(g.gewicht for g in gruende) or 1.0
        punkte = sum(g.beitrag for g in gruende) / gewichte  # -1 .. +1
        richtung = Direction.LONG if punkte >= self.schwelle else Direction.FLAT
        stop, ziel = self._stop_und_ziel(i) if richtung is Direction.LONG else (None, None)
        return Signal(richtung, punkte, kerze.close, kerze.ts, gruende, stop, ziel)

    def exit_signal(self, i: int, einstieg: float) -> Signal | None:
        """Eigenständiger Ausstiegsgrund jenseits von Stop und Ziel."""
        return None


class TrendFollow(Strategy):
    """Trendfolge: EMA-Ausrichtung, von ADX bestätigt, RSI als Bremse.

    Kauft in bestehende Aufwärtsbewegungen. Verdient in Trendphasen, verliert
    in Seitwärtsmärkten durch wiederholte Fehlausbrüche — das ist die bekannte
    Eigenschaft dieser Familie, kein Fehler der Umsetzung.
    """

    name = "trendfolge"

    def __init__(
        self,
        schnell: int = 20,
        langsam: int = 50,
        rsi_n: int = 14,
        adx_n: int = 14,
        adx_min: float = 20.0,
        atr_n: int = 14,
        atr_stop: float = 2.0,
        atr_ziel: float = 4.0,
        schwelle: float = 0.4,
    ):
        super().__init__(schwelle)
        self.schnell, self.langsam = schnell, langsam
        self.rsi_n, self.adx_n, self.adx_min = rsi_n, adx_n, adx_min
        self.atr_n, self.atr_stop, self.atr_ziel = atr_n, atr_stop, atr_ziel

    def _rechne(self, s: Series) -> None:
        c, h, l = s.closes(), s.highs(), s.lows()
        self.ema_s = ind.ema(c, self.schnell)
        self.ema_l = ind.ema(c, self.langsam)
        self.rsi = ind.rsi(c, self.rsi_n)
        self.adx, self.di_p, self.di_m = ind.adx(h, l, c, self.adx_n)
        self.atr = ind.atr(h, l, c, self.atr_n)

    def warmup(self) -> int:
        return max(self.langsam, self.rsi_n, self.adx_n * 3, self.atr_n) + 2

    def _stimmen(self, i: int) -> list[Reason]:
        kurs = self.series[i].close
        es, el = self.ema_s[i], self.ema_l[i]
        rsi, adx = self.rsi[i], self.adx[i]
        dip, dim = self.di_p[i], self.di_m[i]
        g: list[Reason] = []

        if es is not None and el is not None:
            abstand = (es - el) / el * 100 if el else 0.0
            dafuer = es > el
            g.append(Reason(
                f"EMA{self.schnell}/{self.langsam}", abstand, 1.0 if dafuer else -1.0, 2.0,
                "schnelle über langsamer Linie" if dafuer else "schnelle unter langsamer Linie",
            ))
        if el is not None:
            ueber = kurs > el
            g.append(Reason(
                f"Kurs zu EMA{self.langsam}", (kurs - el) / el * 100 if el else None,
                1.0 if ueber else -1.0, 1.0,
                "Kurs über der Trendlinie" if ueber else "Kurs unter der Trendlinie",
            ))
        if adx is not None:
            stark = adx >= self.adx_min
            g.append(Reason(
                "ADX", adx, 1.0 if stark else -1.0, 1.5,
                f"Trend trägt (≥{self.adx_min:.0f})" if stark else f"kein Trend (<{self.adx_min:.0f})",
            ))
        if dip is not None and dim is not None:
            g.append(Reason(
                "+DI/−DI", dip - dim, 1.0 if dip > dim else -1.0, 1.0,
                "Käufer führen" if dip > dim else "Verkäufer führen",
            ))
        if rsi is not None:
            if rsi > 75:
                g.append(Reason("RSI", rsi, -1.0, 1.5, "überkauft, Rücksetzer wahrscheinlich"))
            elif rsi < 40:
                g.append(Reason("RSI", rsi, -0.5, 1.5, "Schwäche im Aufwärtstrend"))
            else:
                g.append(Reason("RSI", rsi, 0.5, 1.5, "im tragfähigen Bereich"))
        return g

    def _stop_und_ziel(self, i: int) -> tuple[float | None, float | None]:
        a, kurs = self.atr[i], self.series[i].close
        if a is None or a <= 0:
            return None, None
        return kurs - self.atr_stop * a, kurs + self.atr_ziel * a

    def exit_signal(self, i: int, einstieg: float) -> Signal | None:
        es, el = self.ema_s[i], self.ema_l[i]
        if es is None or el is None or es >= el:
            return None
        kerze = self.series[i]
        return Signal(
            Direction.EXIT, 1.0, kerze.close, kerze.ts,
            [Reason(f"EMA{self.schnell}/{self.langsam}", (es - el), -1.0, 1.0,
                    "Trend gedreht — Position auflösen")],
        )


class MeanReversion(Strategy):
    """Rückkehr zum Mittel: Kauft Übertreibungen nach unten.

    Gegenstück zur Trendfolge — verdient im Seitwärtsmarkt, wird in einem
    Abwärtstrend überrollt. Deshalb der EMA-Filter als Notbremse.
    """

    name = "mittelwert"

    def __init__(
        self,
        bb_n: int = 20,
        bb_k: float = 2.0,
        rsi_n: int = 14,
        rsi_tief: float = 30.0,
        trend_n: int = 200,
        atr_n: int = 14,
        atr_stop: float = 2.5,
        schwelle: float = 0.4,
    ):
        super().__init__(schwelle)
        self.bb_n, self.bb_k = bb_n, bb_k
        self.rsi_n, self.rsi_tief = rsi_n, rsi_tief
        self.trend_n, self.atr_n, self.atr_stop = trend_n, atr_n, atr_stop

    def _rechne(self, s: Series) -> None:
        c, h, l = s.closes(), s.highs(), s.lows()
        self.mitte, self.oben, self.unten = ind.bollinger(c, self.bb_n, self.bb_k)
        self.rsi = ind.rsi(c, self.rsi_n)
        self.trend = ind.ema(c, self.trend_n)
        self.atr = ind.atr(h, l, c, self.atr_n)

    def warmup(self) -> int:
        return max(self.bb_n, self.rsi_n, self.trend_n, self.atr_n) + 2

    def _stimmen(self, i: int) -> list[Reason]:
        kurs = self.series[i].close
        unten, mitte = self.unten[i], self.mitte[i]
        rsi, trend = self.rsi[i], self.trend[i]
        g: list[Reason] = []
        if unten is not None and mitte is not None:
            tief = kurs <= unten
            lage = (kurs - unten) / (mitte - unten) * 100 if mitte != unten else 0.0
            g.append(Reason(
                f"Bollinger {self.bb_n}/{self.bb_k:g}", lage, 1.0 if tief else -1.0, 2.0,
                "unter dem unteren Band" if tief else "kein Extrem erreicht",
            ))
        if rsi is not None:
            tief = rsi <= self.rsi_tief
            g.append(Reason("RSI", rsi, 1.0 if tief else -1.0, 2.0,
                            f"überverkauft (≤{self.rsi_tief:.0f})" if tief else "nicht überverkauft"))
        if trend is not None:
            intakt = kurs > trend
            g.append(Reason(
                f"EMA{self.trend_n}", (kurs - trend) / trend * 100 if trend else None,
                1.0 if intakt else -1.0, 1.5,
                "übergeordnet aufwärts" if intakt else "übergeordnet abwärts — Finger weg",
            ))
        return g

    def _stop_und_ziel(self, i: int) -> tuple[float | None, float | None]:
        a, kurs, mitte = self.atr[i], self.series[i].close, self.mitte[i]
        if a is None or a <= 0:
            return None, None
        return kurs - self.atr_stop * a, mitte  # Ziel ist die Bandmitte

    def exit_signal(self, i: int, einstieg: float) -> Signal | None:
        mitte = self.mitte[i]
        kerze = self.series[i]
        if mitte is None or kerze.close < mitte:
            return None
        return Signal(
            Direction.EXIT, 1.0, kerze.close, kerze.ts,
            [Reason("Bollinger-Mitte", mitte, -1.0, 1.0, "Mittelwert erreicht — Gewinn mitnehmen")],
        )


class Breakout(Strategy):
    """Ausbruch aus der Donchian-Spanne, mit Volumen- und ATR-Bestätigung."""

    name = "ausbruch"

    def __init__(
        self,
        kanal: int = 20,
        atr_n: int = 14,
        atr_stop: float = 2.0,
        atr_ziel: float = 5.0,
        vol_n: int = 20,
        schwelle: float = 0.4,
    ):
        super().__init__(schwelle)
        self.kanal, self.atr_n = kanal, atr_n
        self.atr_stop, self.atr_ziel, self.vol_n = atr_stop, atr_ziel, vol_n

    def _rechne(self, s: Series) -> None:
        c, h, l, v = s.closes(), s.highs(), s.lows(), s.volumes()
        self.oben, self.unten = ind.donchian(h, l, self.kanal)
        self.atr = ind.atr(h, l, c, self.atr_n)
        self.vol_schnitt = ind.sma(v, self.vol_n)

    def warmup(self) -> int:
        return max(self.kanal, self.atr_n, self.vol_n) + 2

    def _stimmen(self, i: int) -> list[Reason]:
        kerze = self.series[i]
        oben, unten, a = self.oben[i], self.unten[i], self.atr[i]
        vs = self.vol_schnitt[i]
        g: list[Reason] = []
        if oben is not None:
            raus = kerze.close > oben
            g.append(Reason(
                f"Donchian {self.kanal} oben", oben, 1.0 if raus else -1.0, 3.0,
                "Ausbruch über das Hoch" if raus else "noch in der Spanne",
            ))
        if unten is not None and oben is not None and a and a > 0:
            eng = (oben - unten) / a
            schmal = eng < 6.0
            g.append(Reason("Spannweite in ATR", eng, 1.0 if schmal else -0.5, 1.0,
                            "enge Spanne — Ausbruch trägt weiter" if schmal else "bereits weit gelaufen"))
        if vs is not None and vs > 0:
            schub = kerze.volume / vs
            g.append(Reason("Volumen zum Schnitt", schub, 1.0 if schub > 1.2 else -1.0, 1.5,
                            "Umsatz bestätigt" if schub > 1.2 else "Umsatz fehlt"))
        return g

    def _stop_und_ziel(self, i: int) -> tuple[float | None, float | None]:
        a, kurs = self.atr[i], self.series[i].close
        if a is None or a <= 0:
            return None, None
        return kurs - self.atr_stop * a, kurs + self.atr_ziel * a


STRATEGIEN: dict[str, type[Strategy]] = {
    "trendfolge": TrendFollow,
    "mittelwert": MeanReversion,
    "ausbruch": Breakout,
}
