"""Der selbstständige Betrieb.

Die Schleife wacht auf, holt frische Kurse, prüft offene Positionen, bewertet
die Lage und handelt — oder eben nicht. Danach schreibt sie ihren Zustand auf
Platte und legt sich wieder hin.

Drei Eigenschaften, ohne die "selbstständig" fahrlässig wäre:

* **Neustartfest.** Der gesamte Zustand liegt in einer JSON-Datei. Ein
  abgestürzter Prozess setzt dort fort, wo er aufgehört hat, statt eine offene
  Position zu vergessen.
* **Idempotent.** Gehandelt wird nur auf einer *neu abgeschlossenen* Kerze.
  Zehn Aufwachvorgänge innerhalb einer Kerze ergeben keine zehn Orders.
* **Rechenschaftspflichtig.** Jeder Durchlauf schreibt eine Zeile ins Journal —
  auch der, in dem nichts geschah, mitsamt dem Grund fürs Nichtstun.

Netzfehler beenden die Schleife nicht. Sie werden protokolliert, der Durchlauf
wird übersprungen; beim nächsten Mal wird es erneut versucht.
"""

from __future__ import annotations

import json
import os
import signal
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from . import sources
from .candles import Series
from .execution import CostModel, PaperBroker
from .notify import Melder, StillerMelder
from .portfolio import Portfolio, Position
from .risk import RiskManager, RiskRules, groesse_bestimmen, stop_absichern
from .safety import Angehalten, Sicherung
from .strategy import Direction, Strategy

ZUSTAND_VERSION = 2


def _jetzt_text(ts: float | None = None) -> str:
    t = datetime.fromtimestamp(ts if ts else time.time(), tz=timezone.utc)
    return t.strftime("%Y-%m-%d %H:%M:%S UTC")


@dataclass(slots=True)
class Durchlauf:
    """Was in einem Aufwachvorgang geschah — die Zeile fürs Journal."""

    zeit: str
    kurs: float | None = None
    kerze_ts: int | None = None
    handlung: str = "nichts"
    grund: str = ""
    signal_staerke: float | None = None
    gruende: list[str] = field(default_factory=list)
    kapital: float | None = None
    offen: int = 0
    fehler: str | None = None
    txid: str = ""
    teilausfuehrung: bool = False
    angehalten: bool = False

    def als_zeile(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=False)

    def kurzfassung(self) -> str:
        teile = [self.zeit]
        if self.kurs is not None:
            teile.append(f"{self.kurs:,.2f}")
        teile.append(self.handlung.upper())
        if self.grund:
            teile.append(f"— {self.grund}")
        if self.kapital is not None:
            teile.append(f"| Kapital {self.kapital:,.2f}")
        return "  ".join(teile)


class Runner:
    """Hält Zustand, Strategie und Broker zusammen und tickt."""

    def __init__(
        self,
        symbol: str,
        step: int,
        strategie: Strategy,
        regeln: RiskRules | None = None,
        kosten: CostModel | None = None,
        startkapital: float = 10_000.0,
        quelle: str = "bitstamp",
        arbeitsverzeichnis: str | Path = "betrieb",
        historie_tage: int = 400,
        nachziehen: float = 0.0,
        broker=None,
        sicherung: Sicherung | None = None,
        melder: Melder | None = None,
    ):
        self.symbol = symbol
        self.step = step
        self.strategie = strategie
        self.regeln = regeln or RiskRules()
        self.kosten = kosten or CostModel()
        self.quelle = quelle
        self.historie_tage = historie_tage
        self.nachziehen = nachziehen
        self.melder = melder or StillerMelder()
        self.broker = broker or PaperBroker(
            self.kosten, kursquelle=lambda sym: sources.ticker(sym, self.quelle)
        )
        self.echt = getattr(self.broker, "echt", False)

        self.verzeichnis = Path(arbeitsverzeichnis)
        self.verzeichnis.mkdir(parents=True, exist_ok=True)
        self.zustand_datei = self.verzeichnis / f"zustand_{symbol}_{step}.json"
        self.journal_datei = self.verzeichnis / f"journal_{symbol}_{step}.jsonl"
        self.cache = sources.Cache(self.verzeichnis / "daten")
        self.sicherung = sicherung or Sicherung(self.verzeichnis)
        self._abgeglichen = False

        self.depot = Portfolio(startkapital=startkapital)
        self.waechter = RiskManager(self.regeln)
        self.letzte_kerze_ts: int = 0
        self.ticks = 0
        self.gestartet = _jetzt_text()
        self._laeuft = True

        self._zustand_laden()

    # -- Zustand ------------------------------------------------------------
    def _zustand_laden(self) -> None:
        if not self.zustand_datei.exists():
            return
        try:
            d = json.loads(self.zustand_datei.read_text())
        except json.JSONDecodeError:
            # Kaputte Zustandsdatei beiseitelegen statt blind überschreiben.
            self.zustand_datei.rename(self.zustand_datei.with_suffix(".kaputt"))
            return
        if d.get("version") != ZUSTAND_VERSION:
            raise RuntimeError(
                f"Zustandsdatei hat Version {d.get('version')}, erwartet {ZUSTAND_VERSION}. "
                "Datei prüfen und bei Bedarf entfernen."
            )
        self.depot = Portfolio.aus_dict(d["depot"])
        self.letzte_kerze_ts = d.get("letzte_kerze_ts", 0)
        self.ticks = d.get("ticks", 0)
        self.gestartet = d.get("gestartet", self.gestartet)
        risiko = d.get("risiko", {})
        self.waechter.letzter_ausstieg_index = {
            k: int(v) for k, v in risiko.get("letzter_ausstieg_index", {}).items()
        }
        self.waechter.tag = risiko.get("tag")
        self.waechter.tageskapital_start = risiko.get("tageskapital_start")

    def _zustand_sichern(self) -> None:
        d = {
            "version": ZUSTAND_VERSION,
            "symbol": self.symbol,
            "step": self.step,
            "strategie": self.strategie.name,
            "gestartet": self.gestartet,
            "aktualisiert": _jetzt_text(),
            "ticks": self.ticks,
            "letzte_kerze_ts": self.letzte_kerze_ts,
            "depot": self.depot.als_dict(),
            "risiko": {
                "letzter_ausstieg_index": self.waechter.letzter_ausstieg_index,
                "tag": self.waechter.tag,
                "tageskapital_start": self.waechter.tageskapital_start,
            },
        }
        temp = self.zustand_datei.with_suffix(".tmp")
        temp.write_text(json.dumps(d, indent=2, ensure_ascii=False))
        os.replace(temp, self.zustand_datei)  # atomar — kein halb geschriebener Zustand

    def _journal(self, durchlauf: Durchlauf) -> None:
        with self.journal_datei.open("a") as f:
            f.write(durchlauf.als_zeile() + "\n")

    # -- Ein Durchlauf ------------------------------------------------------
    def tick(self) -> Durchlauf:
        d = Durchlauf(zeit=_jetzt_text())
        self.ticks += 1
        try:
            if self.echt and not self._abgeglichen:
                # Vor der ersten Order: eigener Zustand gegen die Börse.
                from .live import abgleichen

                for zeile in abgleichen(self.broker, self.depot, self.symbol, self.melder):
                    d.gruende.append(zeile)
                self._abgeglichen = True

            reihe = sources.load(
                self.symbol, self.step, tage=self.historie_tage,
                quelle=self.quelle, cache=self.cache,
            ).closed()
            if len(reihe) < self.strategie.warmup() + 2:
                d.handlung, d.grund = "warten", (
                    f"erst {len(reihe)} Kerzen, gebraucht werden {self.strategie.warmup() + 2}"
                )
                self._abschluss(d)
                return d

            kurs = self.broker.kurs(self.symbol)
            d.kurs = kurs
            kapital_jetzt = self.depot.kapital({self.symbol: kurs})
            self.sicherung.tageswechsel(kapital_jetzt)
            letzte = reihe[-1]
            d.kerze_ts = letzte.ts

            self.strategie.prepare(reihe)
            i = len(reihe) - 1
            tag = datetime.fromtimestamp(letzte.ts, tz=timezone.utc).strftime("%Y-%m-%d")
            self.waechter.tageswechsel(tag, self.depot.kapital({self.symbol: kurs}))

            # 0. Notbremse: Sie steht über allem, auch über der Strategie.
            if self.sicherung.notbremse_gezogen:
                if self.sicherung.notbremse_will_schliessen and self.symbol in self.depot.positionen:
                    self._schliessen(kurs, "Notbremse — sofort auflösen", d)
                else:
                    d.handlung = "angehalten"
                    d.grund = f"Notbremse gezogen ({self.sicherung.notbremse.name})"
                self._laeuft = False
                self._abschluss(d)
                return d

            # 1. Offene Position überwachen — läuft bei jedem Durchlauf, nicht
            #    nur bei neuer Kerze. Ein Stop, der einen Tag wartet, ist keiner.
            if self.symbol in self.depot.positionen:
                if self._position_pruefen(kurs, d, i):
                    self._abschluss(d)
                    return d

            # 2. Neue Signale nur auf frisch abgeschlossener Kerze
            if letzte.ts <= self.letzte_kerze_ts:
                d.handlung = "nichts"
                d.grund = "keine neue abgeschlossene Kerze seit dem letzten Durchlauf"
                self._abschluss(d)
                return d
            self.letzte_kerze_ts = letzte.ts

            if self.symbol in self.depot.positionen:
                self._ausstieg_pruefen(i, kurs, d)
            else:
                self._einstieg_pruefen(i, kurs, d)

        except Angehalten as halt:
            # Eine ausgelöste Sicherung ist kein vorübergehender Fehler.
            d.handlung, d.angehalten = "angehalten", True
            d.grund = str(halt)
            d.fehler = str(halt)
            self._laeuft = False
            self.melder.melden("BETRIEB ANGEHALTEN", str(halt), dringend=True)

        except Exception as fehler:  # Netz, Quelle, Format — nie die Schleife reissen
            d.handlung, d.fehler = "fehler", f"{type(fehler).__name__}: {fehler}"
            d.grund = "Durchlauf übersprungen, nächster Versuch beim nächsten Takt"
            if self.echt:
                try:
                    self.sicherung.fehler_vermerken(d.fehler)
                except Angehalten as halt:
                    d.handlung, d.angehalten, d.grund = "angehalten", True, str(halt)
                    self._laeuft = False
                    self.melder.melden("BETRIEB ANGEHALTEN", str(halt), dringend=True)

        self._abschluss(d)
        return d

    def _abschluss(self, d: Durchlauf) -> None:
        kurse = {self.symbol: d.kurs} if d.kurs else {}
        d.kapital = self.depot.kapital(kurse)
        d.offen = len(self.depot.positionen)
        self._zustand_sichern()
        self._journal(d)

    def _position_pruefen(self, kurs: float, d: Durchlauf, i: int) -> bool:
        """Stop, Ziel und nachgezogene Absicherung. True, wenn geschlossen wurde."""
        pos = self.depot.positionen[self.symbol]
        pos.hoechststand = max(pos.hoechststand, kurs)
        atr = getattr(self.strategie, "atr", None)
        if self.nachziehen and atr and i < len(atr) and atr[i]:
            gezogen = pos.hoechststand - self.nachziehen * atr[i]
            if pos.stop is None or gezogen > pos.stop:
                pos.stop = gezogen
        if pos.stop is not None and kurs <= pos.stop:
            self._schliessen(kurs, "Stop erreicht", d)
            return True
        if pos.ziel is not None and kurs >= pos.ziel:
            self._schliessen(kurs, "Ziel erreicht", d)
            return True
        return False

    def _ausstieg_pruefen(self, i: int, kurs: float, d: Durchlauf) -> None:
        pos = self.depot.positionen[self.symbol]
        raus = self.strategie.exit_signal(i, pos.einstieg)
        if raus is None:
            d.handlung = "halten"
            d.grund = (
                f"Position läuft ({pos.gewinn_prozent(kurs):+.2f} %), "
                f"Stop {pos.stop:,.2f}" if pos.stop else "Position läuft"
            )
            return
        self._schliessen(kurs, raus.gruende[0].text if raus.gruende else "Strategieausstieg", d)

    def _einstieg_pruefen(self, i: int, kurs: float, d: Durchlauf) -> None:
        sig = self.strategie.evaluate(i)
        d.signal_staerke = sig.staerke
        d.gruende = [str(g) for g in sig.gruende]
        if sig.richtung is not Direction.LONG:
            d.handlung = "abwarten"
            dagegen = sig.dagegen
            d.grund = (
                f"Neigung {sig.neigung} (Kaufschwelle {self.strategie.schwelle:+.0%})"
                + (
                    "; dagegen: " + ", ".join(g.indikator for g in dagegen[:3])
                    if dagegen else ""
                )
            )
            return

        kapital = self.depot.kapital({self.symbol: kurs})
        erlaubt, warum = self.waechter.darf_eroeffnen(
            self.symbol, i, sig.staerke, kapital,
            self.depot.startkapital, len(self.depot.positionen),
        )
        if not erlaubt:
            d.handlung, d.grund = "abwarten", f"Risikoregel greift: {warum}"
            return

        # Schutzschaltungen haben das letzte Wort — sie kennen absolute Beträge,
        # die kein Prozentsatz und kein Rechenfehler überschreiben kann.
        einsatz = sum(p.wert(kurs) for p in self.depot.positionen.values())
        frei, schutzgrund = self.sicherung.darf_handeln(
            kapital, self.depot.startkapital, self.broker_kurs_alter, einsatz
        )
        if not frei:
            d.handlung, d.grund = "abwarten", f"Schutzschaltung: {schutzgrund}"
            return

        stop = stop_absichern(kurs, sig.stop, self.regeln)
        menge = groesse_bestimmen(
            kapital, self.depot.bargeld, kurs, stop, self.regeln, self.kosten.gebuehr_satz
        )
        gedeckelt = self.sicherung.orderwert_begrenzen(menge * kurs, einsatz)
        if gedeckelt < menge * kurs:
            menge = gedeckelt / kurs if kurs else 0.0
            d.gruende.append(f"· Orderwert auf {gedeckelt:.2f} gedeckelt (Schutzgrenze)")
        if menge <= 0:
            d.handlung, d.grund = "abwarten", "erlaubte Menge ist null (Bargeld oder Schutzgrenze)"
            return

        try:
            aus = self.broker.kaufen(self.symbol, menge, kurs)
        except Exception as fehler:
            d.handlung, d.grund = "abwarten", f"Order abgelehnt: {fehler}"
            d.fehler = f"{type(fehler).__name__}: {fehler}"
            return

        if aus.leer:
            d.handlung = "abwarten"
            d.grund = "Order nicht ausgeführt — nichts gefüllt"
            return
        if aus.kurs * aus.menge + aus.gebuehr > self.depot.bargeld:
            d.handlung, d.grund = "abwarten", "Bargeld reicht nach Gebühren nicht"
            return

        d.txid = aus.txid
        d.teilausfuehrung = aus.teilausfuehrung
        begruendung = "; ".join(g.indikator for g in sig.dafuer[:3])
        self.depot.eroeffne(Position(
            symbol=self.symbol, menge=aus.menge, einstieg=aus.kurs,
            einstieg_ts=int(time.time()), stop=stop, ziel=sig.ziel,
            gebuehr_bezahlt=aus.gebuehr, begruendung=begruendung,
        ))
        self.sicherung.erfolg_vermerken()
        d.handlung = "gekauft"
        d.grund = (
            f"{aus.menge:.8f} zu {aus.kurs:,.2f} (Neigung {sig.neigung}), "
            f"Stop {stop:,.2f}" + (f", Ziel {sig.ziel:,.2f}" if sig.ziel else "")
            + (f" — nur {aus.menge / aus.angefragt:.0%} gefüllt" if aus.teilausfuehrung else "")
        )
        self.melder.melden(
            "Gekauft", f"{aus.menge:.8f} {self.symbol} zu {aus.kurs:,.2f}, Stop {stop:,.2f}\n"
                       f"Grund: {begruendung}",
        )

    def _schliessen(self, kurs: float, grund: str, d: Durchlauf) -> None:
        pos = self.depot.positionen[self.symbol]
        gewuenscht = pos.menge
        try:
            aus = self.broker.verkaufen(self.symbol, gewuenscht, kurs)
        except Exception as fehler:
            # Ein misslungener Verkauf ist ernst: Die Position steht weiter im
            # Markt, obwohl sie raus soll. Beim nächsten Durchlauf erneut.
            d.handlung, d.grund = "halten", f"Verkauf misslungen: {fehler}"
            d.fehler = f"{type(fehler).__name__}: {fehler}"
            self.melder.melden(
                "Verkauf misslungen", f"{self.symbol}: {fehler}\nPosition steht weiter offen.",
                dringend=True,
            )
            return

        if aus.leer:
            d.handlung, d.grund = "halten", f"{grund} — Verkaufsorder blieb ohne Ausführung"
            return

        d.txid = aus.txid
        d.teilausfuehrung = aus.teilausfuehrung
        if aus.teilausfuehrung:
            t = self.depot.teilweise_schliessen(
                self.symbol, aus.menge, aus.kurs, int(time.time()), aus.gebuehr, grund
            )
            rest = self.depot.positionen[self.symbol].menge
            d.handlung = "teilverkauf"
            d.grund = f"{grund} — {aus.menge:.8f} verkauft, {rest:.8f} bleibt offen ({t.netto:+,.2f})"
            self.melder.melden(
                "Teilverkauf", f"{aus.menge:.8f} zu {aus.kurs:,.2f}, {rest:.8f} bleibt offen.",
                dringend=True,
            )
            return

        t = self.depot.schliesse(self.symbol, aus.kurs, int(time.time()), aus.gebuehr, grund)
        self.waechter.ausstieg_vermerken(self.symbol, 10**9)  # Abkühlung ab jetzt
        self.sicherung.erfolg_vermerken()
        d.handlung = "verkauft"
        d.grund = f"{grund} — Ergebnis {t.netto:+,.2f} ({t.rendite:+.2%})"
        self.melder.melden(
            "Verkauft", f"{aus.menge:.8f} {self.symbol} zu {aus.kurs:,.2f}\n"
                        f"{grund} — Ergebnis {t.netto:+,.2f} ({t.rendite:+.2%})",
        )

    # -- Dauerbetrieb -------------------------------------------------------
    def schleife(self, takt: int = 300, max_durchlaeufe: int | None = None, still: bool = False):
        """Läuft, bis SIGINT/SIGTERM kommt oder `max_durchlaeufe` erreicht ist."""

        def anhalten(signum, rahmen):
            self._laeuft = False
            if not still:
                print("\nSignal empfangen — Zustand wird gesichert, dann Ende.")

        for s in (signal.SIGINT, signal.SIGTERM):
            try:
                signal.signal(s, anhalten)
            except ValueError:
                pass  # nicht im Hauptthread

        gezaehlt = 0
        while self._laeuft:
            d = self.tick()
            if not still:
                print(d.kurzfassung(), flush=True)
            gezaehlt += 1
            if max_durchlaeufe and gezaehlt >= max_durchlaeufe:
                break
            # In Schnipseln schlafen, damit das Signal zügig ankommt
            for _ in range(takt):
                if not self._laeuft:
                    break
                time.sleep(1)
        self._zustand_sichern()
        return gezaehlt

    @property
    def broker_kurs_alter(self) -> float:
        """Wie alt der zuletzt gelesene Kurs ist. Papierbetrieb meldet 0."""
        return float(getattr(self.broker, "kurs_alter", 0.0))

    # -- Auskunft -----------------------------------------------------------
    def stand(self, kurs: float | None = None) -> dict:
        kurse = {self.symbol: kurs} if kurs else {}
        kapital = self.depot.kapital(kurse)
        return {
            "symbol": self.symbol,
            "strategie": self.strategie.name,
            "ticks": self.ticks,
            "gestartet": self.gestartet,
            "startkapital": self.depot.startkapital,
            "kapital": kapital,
            "bargeld": self.depot.bargeld,
            "rendite": kapital / self.depot.startkapital - 1.0,
            "offene_positionen": len(self.depot.positionen),
            "abgeschlossene_trades": len(self.depot.trades),
            "gebuehren": self.depot.gebuehren_gesamt,
        }
