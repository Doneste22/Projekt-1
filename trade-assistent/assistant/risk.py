"""Risikoregeln — der Teil, der über Ruin oder Überleben entscheidet.

Die Positionsgrösse folgt nicht dem Bauchgefühl, sondern dem Stop: Es wird so
viel gekauft, dass der Weg vom Einstieg bis zum Stop genau den festgelegten
Anteil des Kapitals kostet. Ein weiter Stop ergibt eine kleine Position, ein
enger eine grössere. Damit kostet jeder Fehlschlag gleich viel — unabhängig
davon, wie schwankungsfreudig der Markt gerade ist.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class RiskRules:
    risiko_je_trade: float = 0.01      # Anteil des Kapitals, der bei Stop verloren geht
    max_positionsanteil: float = 0.25  # Obergrenze für eine einzelne Position
    max_offene: int = 3
    tagesverlust_grenze: float = 0.05  # ab hier bis Tagesende keine Neueröffnung
    gesamtverlust_grenze: float = 0.25 # ab hier gar keine Neueröffnung mehr
    abkuehlung_kerzen: int = 3         # Sperre nach einem Ausstieg
    min_staerke: float = 0.4
    notstop_anteil: float = 0.10       # Stop, falls die Strategie keinen liefert

    def pruefe(self) -> None:
        if not 0 < self.risiko_je_trade <= 0.1:
            raise ValueError("risiko_je_trade gehört zwischen 0 und 0,10 (10 %)")
        if not 0 < self.max_positionsanteil <= 1.0:
            raise ValueError("max_positionsanteil gehört zwischen 0 und 1")
        if self.max_offene < 1:
            raise ValueError("max_offene muss mindestens 1 sein")


@dataclass(slots=True)
class Entscheidung:
    erlaubt: bool
    menge: float = 0.0
    stop: float | None = None
    begruendung: str = ""


def stop_absichern(kurs: float, stop: float | None, regeln: RiskRules) -> float:
    """Liefert immer einen Stop — auch wenn die Strategie keinen vorschlägt.

    Eine Position ohne Stop hat kein bezifferbares Risiko und ist damit nicht
    dimensionierbar. Der Notstop ist absichtlich grob; er ist die Notbremse,
    nicht der Plan.
    """
    notstop = kurs * (1.0 - regeln.notstop_anteil)
    if stop is None or stop >= kurs or stop <= 0:
        return notstop
    # Ein absurd weiter Stop wird auf die Notbremse zurückgeholt.
    return max(stop, notstop) if stop < notstop else stop


def groesse_bestimmen(
    kapital: float,
    bargeld: float,
    kurs: float,
    stop: float,
    regeln: RiskRules,
    gebuehr_satz: float = 0.0,
) -> float:
    """Stückzahl aus Risiko je Trade, gedeckelt durch Anteil und Bargeld."""
    if kurs <= 0 or stop <= 0 or stop >= kurs:
        return 0.0
    risiko_je_stueck = kurs - stop
    aus_risiko = (kapital * regeln.risiko_je_trade) / risiko_je_stueck
    aus_anteil = (kapital * regeln.max_positionsanteil) / kurs
    # Gebühren für Ein- und Ausstieg müssen aus dem Bargeld mitgedeckt sein.
    aus_bargeld = bargeld / (kurs * (1.0 + gebuehr_satz * 2)) if kurs else 0.0
    return max(0.0, min(aus_risiko, aus_anteil, aus_bargeld))


class RiskManager:
    """Wacht über Grenzen, die keine Strategie überschreiben darf."""

    def __init__(self, regeln: RiskRules):
        regeln.pruefe()
        self.regeln = regeln
        self.letzter_ausstieg_index: dict[str, int] = {}
        self.tageskapital_start: float | None = None
        self.tag: str | None = None

    def tageswechsel(self, tag: str, kapital: float) -> None:
        if tag != self.tag:
            self.tag = tag
            self.tageskapital_start = kapital

    def darf_eroeffnen(
        self,
        symbol: str,
        index: int,
        staerke: float,
        kapital: float,
        startkapital: float,
        offene: int,
    ) -> tuple[bool, str]:
        r = self.regeln
        if staerke < r.min_staerke:
            return False, f"Signalstärke {staerke:.0%} unter Schwelle {r.min_staerke:.0%}"
        if offene >= r.max_offene:
            return False, f"bereits {offene} Positionen offen (max. {r.max_offene})"
        letzter = self.letzter_ausstieg_index.get(symbol)
        if letzter is not None and index - letzter < r.abkuehlung_kerzen:
            return False, f"Abkühlung läuft noch ({index - letzter}/{r.abkuehlung_kerzen} Kerzen)"
        if kapital <= startkapital * (1 - r.gesamtverlust_grenze):
            return False, f"Gesamtverlustgrenze von {r.gesamtverlust_grenze:.0%} erreicht — gesperrt"
        if self.tageskapital_start:
            tagesverlust = 1.0 - kapital / self.tageskapital_start
            if tagesverlust >= r.tagesverlust_grenze:
                return False, f"Tagesverlust {tagesverlust:.1%} über Grenze {r.tagesverlust_grenze:.0%}"
        return True, "alle Risikogrenzen eingehalten"

    def ausstieg_vermerken(self, symbol: str, index: int) -> None:
        self.letzter_ausstieg_index[symbol] = index
