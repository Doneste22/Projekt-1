"""Echter Handel an der Börse.

Was hier anders ist als im Papierbetrieb — und warum:

**Marktnahe Limit-Order statt Market-Order.** Eine Market-Order füllt zu jedem
Preis. Bricht das Orderbuch für Sekunden ein, kauft sie das Loch. Eine Limit-
Order knapp jenseits des Marktes füllt im Normalfall genauso sofort, aber
niemals schlechter als die gesetzte Grenze. Der Preis dafür ist, dass sie in
einem schnellen Markt nicht füllt. Für einen Assistenten, dem niemand zusieht,
ist eine nicht ausgeführte Order das kleinere Übel.

**Keine Wiederholung nach Zeitüberschreitung.** Keine Antwort heisst nicht
"nicht angekommen". Wiederholen kauft im schlechten Fall doppelt. Stattdessen
wird über die `userref` bei der Börse nachgefragt, was tatsächlich geschah.

**Teilausführungen werden verbucht, wie sie sind.** Wer die gewünschte statt
der gefüllten Menge einträgt, führt ab da ein falsches Depot — und verkauft
später etwas, das er nicht hat.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from pathlib import Path

from .exchange import BoersenFehler, KrakenClient, PaarInfo, UnklarerAusgang
from .execution import Execution
from .notify import Melder, StillerMelder
from .safety import Angehalten, Sicherung

ENDZUSTAENDE = ("closed", "canceled", "expired")


class OrderFehler(RuntimeError):
    pass


@dataclass(slots=True)
class OrderErgebnis:
    txid: str
    status: str
    gewuenscht: float
    gefuellt: float
    kosten: float       # in Preiswährung, ohne Gebühr
    gebuehr: float
    schnittkurs: float

    @property
    def vollstaendig(self) -> bool:
        return self.gefuellt >= self.gewuenscht * 0.9999

    @property
    def leer(self) -> bool:
        return self.gefuellt <= 0


class UserrefZaehler:
    """Fortlaufende Kennung je Order, dauerhaft.

    Kraken nimmt eine 32-Bit-Ganzzahl je Order entgegen und gibt sie zurück.
    Damit lässt sich nach einem Abbruch fragen "gibt es zu dieser Absicht
    schon eine Order?", statt es zu raten.
    """

    GRENZE = 2**31 - 1

    def __init__(self, datei: str | Path):
        self.datei = Path(datei)
        self.datei.parent.mkdir(parents=True, exist_ok=True)
        self._wert = 0
        if self.datei.exists():
            try:
                self._wert = int(self.datei.read_text().strip())
            except (ValueError, OSError):
                self._wert = 0

    @property
    def aktuell(self) -> int:
        return self._wert

    def naechste(self) -> int:
        self._wert = (self._wert + 1) % self.GRENZE or 1
        temp = self.datei.with_suffix(".tmp")
        temp.write_text(str(self._wert))
        os.replace(temp, self.datei)
        return self._wert


class LiveBroker:
    """Gibt echte Orders auf. Nur wenn `scharf=True` ausdrücklich gesetzt ist."""

    name = "live"
    echt = True

    def __init__(
        self,
        client: KrakenClient,
        paar: str,
        sicherung: Sicherung,
        melder: Melder | None = None,
        scharf: bool = False,
        max_schlupf: float = 0.005,
        wartezeit: int = 60,
        abfrageabstand: float = 3.0,
    ):
        self.client = client
        self.paar = paar
        self.info: PaarInfo = client.paar_info(paar)
        self.sicherung = sicherung
        self.melder = melder or StillerMelder()
        self.scharf = scharf
        self.max_schlupf = max_schlupf
        self.wartezeit = wartezeit
        self.abfrageabstand = abfrageabstand
        self.userref = UserrefZaehler(sicherung.verzeichnis / "userref")
        self._letzter_kurs: float = 0.0
        self._letzter_kurs_zeit: float = 0.0

    # -- Kurse --------------------------------------------------------------
    def kurs(self, symbol: str | None = None) -> float:
        preis = self.client.letzter_kurs(self.paar)
        self._letzter_kurs = preis
        self._letzter_kurs_zeit = time.time()
        return preis

    @property
    def kurs_alter(self) -> float:
        if not self._letzter_kurs_zeit:
            return float("inf")
        return time.time() - self._letzter_kurs_zeit

    # -- Orders -------------------------------------------------------------
    def kaufen(self, symbol: str, menge: float, richtkurs: float) -> Execution:
        return self._order("buy", menge, richtkurs)

    def verkaufen(self, symbol: str, menge: float, richtkurs: float) -> Execution:
        return self._order("sell", menge, richtkurs)

    def _order(self, seite: str, menge: float, richtkurs: float) -> Execution:
        menge = self.info.menge_runden(menge)
        einwand = self.info.pruefe_order(menge, richtkurs)
        if einwand:
            raise OrderFehler(f"Börse würde ablehnen: {einwand}")

        # Limit knapp jenseits des Marktes: füllt sofort, aber nicht um jeden Preis.
        grenze = (
            richtkurs * (1 + self.max_schlupf) if seite == "buy"
            else richtkurs * (1 - self.max_schlupf)
        )
        kennung = self.userref.naechste()

        if not self.scharf:
            # Ungeschärft geht die Order nur zur Prüfung an die Börse. Sie
            # antwortet mit derselben Ablehnung wie im Ernstfall, führt aber nichts aus.
            antwort = self.client.order_aufgeben(
                self.paar, seite, menge, art="limit", preis=grenze,
                userref=kennung, nur_pruefen=True,
            )
            beschreibung = antwort.get("descr", {}).get("order", "?")
            self.melder.melden(
                "Probelauf (nicht scharf)",
                f"{seite} {menge:.8f} {self.info.altname} zu ≤{grenze:.2f} — "
                f"Börse akzeptiert: {beschreibung}",
            )
            return Execution(0.0, 0.0, richtkurs, 0.0, menge, "")

        try:
            antwort = self.client.order_aufgeben(
                self.paar, seite, menge, art="limit", preis=grenze,
                userref=kennung, nur_pruefen=False,
            )
        except UnklarerAusgang as f:
            # Kritischster Fall: Wir wissen nicht, ob die Order steht.
            ergebnis = self._nachforschen(kennung)
            if ergebnis is None:
                raise self.sicherung.ausloesen(
                    f"Order {seite} ohne Antwort und ohne auffindbare Spur — "
                    f"Zustand unklar, userref {kennung}", userref=kennung, fehler=str(f),
                ) from f
            self.melder.melden(
                "Order nach Abbruch wiedergefunden",
                f"userref {kennung}: {ergebnis.status}, {ergebnis.gefuellt:.8f} gefüllt",
                dringend=True,
            )
            return self._als_execution(ergebnis, richtkurs, menge)

        txids = antwort.get("txid") or []
        if not txids:
            raise OrderFehler(f"Börse gab keine Ordernummer zurück: {antwort}")
        self.sicherung.order_vermerken()
        ergebnis = self._auf_ausfuehrung_warten(txids[0], menge)

        if ergebnis.leer:
            self.melder.melden(
                "Order nicht ausgeführt",
                f"{seite} {menge:.8f} zu ≤{grenze:.2f} — Markt lief weg, "
                "Order storniert. Kein Schaden.",
            )
        elif not ergebnis.vollstaendig:
            self.melder.melden(
                "Teilausführung",
                f"{seite} {ergebnis.gefuellt:.8f} von {menge:.8f} zu "
                f"{ergebnis.schnittkurs:.2f} — Rest storniert.",
                dringend=True,
            )
        else:
            self.melder.melden(
                f"{'Gekauft' if seite == 'buy' else 'Verkauft'}",
                f"{ergebnis.gefuellt:.8f} {self.info.basis} zu {ergebnis.schnittkurs:.2f} "
                f"({ergebnis.kosten:.2f} {self.info.quote}, Gebühr {ergebnis.gebuehr:.2f})",
            )
        return self._als_execution(ergebnis, richtkurs, menge)

    def _als_execution(self, e: OrderErgebnis, richtkurs: float, gewuenscht: float) -> Execution:
        return Execution(
            kurs=e.schnittkurs or richtkurs,
            gebuehr=e.gebuehr,
            richtkurs=richtkurs,
            menge=e.gefuellt,
            angefragt=gewuenscht,
            txid=e.txid,
        )

    def _auf_ausfuehrung_warten(self, txid: str, gewuenscht: float) -> OrderErgebnis:
        """Nachfragen, bis die Order fertig ist — oder die Geduld endet."""
        ende = time.time() + self.wartezeit
        letzter: OrderErgebnis | None = None
        while time.time() < ende:
            time.sleep(self.abfrageabstand)
            try:
                letzter = self._order_lesen(txid, gewuenscht)
            except BoersenFehler:
                continue
            if letzter.status in ENDZUSTAENDE:
                return letzter
        # Geduld am Ende: Rest stornieren und mitnehmen, was gefüllt wurde.
        try:
            self.client.order_stornieren(txid)
        except (BoersenFehler, UnklarerAusgang):
            pass
        time.sleep(self.abfrageabstand)
        try:
            return self._order_lesen(txid, gewuenscht)
        except BoersenFehler:
            return letzter or OrderErgebnis(txid, "unbekannt", gewuenscht, 0, 0, 0, 0)

    def _order_lesen(self, txid: str, gewuenscht: float) -> OrderErgebnis:
        w = self.client.order_abfragen(txid)
        if not w:
            raise BoersenFehler(f"Order {txid} nicht auffindbar")
        gefuellt = float(w.get("vol_exec", 0) or 0)
        kosten = float(w.get("cost", 0) or 0)
        return OrderErgebnis(
            txid=txid,
            status=w.get("status", "unbekannt"),
            gewuenscht=gewuenscht,
            gefuellt=gefuellt,
            kosten=kosten,
            gebuehr=float(w.get("fee", 0) or 0),
            schnittkurs=(kosten / gefuellt) if gefuellt else float(w.get("price", 0) or 0),
        )

    def _nachforschen(self, userref: int) -> OrderErgebnis | None:
        """Nach einem Abbruch: Gibt es zu dieser Kennung eine Order?"""
        for abruf in (self.client.offene_orders, self.client.geschlossene_orders):
            try:
                orders = abruf(userref=userref)
            except BoersenFehler:
                continue
            for txid, w in (orders or {}).items():
                if int(w.get("userref", 0) or 0) != userref:
                    continue
                gefuellt = float(w.get("vol_exec", 0) or 0)
                kosten = float(w.get("cost", 0) or 0)
                return OrderErgebnis(
                    txid=txid, status=w.get("status", "unbekannt"),
                    gewuenscht=float(w.get("vol", 0) or 0), gefuellt=gefuellt,
                    kosten=kosten, gebuehr=float(w.get("fee", 0) or 0),
                    schnittkurs=(kosten / gefuellt) if gefuellt else 0.0,
                )
        return None

    # -- Absicherung an der Börse ------------------------------------------
    #
    # Ein Stop, der nur im Arbeitsspeicher des laufenden Prozesses steht,
    # schützt genau so lange, wie der Prozess lebt. Stirbt er — Neustart,
    # Stromausfall, ein Kernel dem der Speicher ausgeht —, steht die Position
    # ungeschützt im Markt, und niemand merkt es. Deshalb liegt der Stop als
    # echte Order bei der Börse. Sie löst ihn auch dann aus, wenn hier nichts
    # mehr läuft.

    def stop_platzieren(self, symbol: str, menge: float, stop_preis: float) -> str:
        """Verkaufs-Stop bei der Börse hinterlegen. Gibt die Ordernummer zurück."""
        if not self.scharf:
            return ""
        menge = self.info.menge_runden(menge)
        einwand = self.info.pruefe_order(menge, stop_preis)
        if einwand:
            # Ohne Absicherung weiterlaufen wäre der schlechtere Fehler.
            raise self.sicherung.ausloesen(
                f"Absicherung nicht platzierbar: {einwand}. Position wäre ungeschützt.",
                menge=menge, stop=stop_preis,
            )
        antwort = self.client.order_aufgeben(
            self.paar, "sell", menge, art="stop-loss", preis=stop_preis,
            userref=self.userref.naechste(), nur_pruefen=False,
        )
        txids = antwort.get("txid") or []
        if not txids:
            raise self.sicherung.ausloesen(
                "Börse nahm die Absicherung nicht an — Position wäre ungeschützt.",
                antwort=str(antwort),
            )
        self.melder.melden(
            "Absicherung liegt an der Börse",
            f"Stop {stop_preis:,.2f} über {menge:.8f} {self.info.basis} ({txids[0]}).\n"
            "Sie greift auch, wenn dieser Prozess nicht mehr läuft.",
        )
        return txids[0]

    def stop_aufheben(self, txid: str) -> bool:
        """Absicherung zurücknehmen — nötig, bevor dieselbe Menge anders verkauft wird."""
        if not txid or not self.scharf:
            return True
        try:
            self.client.order_stornieren(txid)
            return True
        except BoersenFehler as f:
            # Schon weg heisst meistens: ausgelöst. Das ist kein Fehler.
            if "Unknown order" in str(f) or "already" in str(f).lower():
                return True
            return False
        except UnklarerAusgang:
            return False

    def stop_status(self, txid: str) -> tuple[str, float, float, float]:
        """(Zustand, gefüllte Menge, Kosten, Gebühr) der Absicherung."""
        if not txid or not self.scharf:
            return ("", 0.0, 0.0, 0.0)
        w = self.client.order_abfragen(txid)
        if not w:
            return ("verschwunden", 0.0, 0.0, 0.0)
        return (
            w.get("status", "unbekannt"),
            float(w.get("vol_exec", 0) or 0),
            float(w.get("cost", 0) or 0),
            float(w.get("fee", 0) or 0),
        )






def abgleichen(
    broker: LiveBroker,
    depot,
    symbol: str,
    melder: Melder | None = None,
) -> list[str]:
    """Beim Start: eigenen Zustand gegen die Börse prüfen.

    Die Börse hat recht, nicht die eigene Datei. Weichen beide ab, wird
    angehalten statt geraten — eine Abweichung heisst, dass jemand oder etwas
    anderes dieses Konto bewegt hat, und das ist kein Zustand, in dem man
    weiterhandelt.

    Zwei Fälle brauchen dabei besondere Sorgfalt, beide betreffen die eigene
    Absicherung:

    1. Sie darf beim Aufräumen **nicht** mit storniert werden. Sie ist die
       einzige offene Order, die dort hingehört; wer sie wegräumt, macht die
       Position bei jedem Neustart schutzlos.
    2. Hat sie ausgelöst, während hier nichts lief, ist das fehlende Guthaben
       erklärt und kein Grund anzuhalten. Der Runner trägt den Trade nach.
    """
    melder = melder or StillerMelder()
    befunde: list[str] = []
    info = broker.info
    sicherung = broker.sicherung

    pos = depot.positionen.get(symbol)
    schutz_txid = pos.stop_txid if pos else ""

    # 1. Hat die eigene Absicherung ausgelöst, während niemand zusah?
    ausgefuehrt = 0.0
    if schutz_txid:
        zustand, gefuellt, _, _ = broker.stop_status(schutz_txid)
        if zustand and zustand not in ("open", "pending"):
            ausgefuehrt = gefuellt
            befunde.append(
                f"Absicherung {schutz_txid} ist '{zustand}' mit {gefuellt:.8f} ausgeführt"
                + (" — wird gleich verbucht" if gefuellt else "")
            )
        else:
            befunde.append(f"Absicherung {schutz_txid} liegt weiter bei der Börse")

    # 2. Hängengebliebene Orders eines abgestürzten Laufs — die eigene
    #    Absicherung ausgenommen, die gehört genau dorthin.
    offene = broker.client.offene_orders()
    fremde = {t: w for t, w in offene.items() if t != schutz_txid}
    if fremde:
        befunde.append(f"{len(fremde)} verwaiste Order(s) an der Börse gefunden")
        for txid in fremde:
            try:
                broker.client.order_stornieren(txid)
                befunde.append(f"  {txid} storniert")
            except (BoersenFehler, UnklarerAusgang) as f:
                raise sicherung.ausloesen(
                    f"Verwaiste Order {txid} liess sich nicht stornieren: {f}", txid=txid
                ) from f

    # 3. Guthaben gegen den eigenen Depotstand, abzüglich dessen, was die
    #    Absicherung bereits verkauft hat.
    guthaben = broker.client.guthaben()
    tatsaechlich = float(guthaben.get(info.basis, 0.0))
    erwartet = max(0.0, (pos.menge if pos else 0.0) - ausgefuehrt)
    schwelle = max(info.mindestmenge, erwartet * sicherung.grenzen.guthaben_abweichung)

    if abs(tatsaechlich - erwartet) > schwelle:
        raise sicherung.ausloesen(
            f"Bestand weicht ab: erwartet {erwartet:.8f} {info.basis}, "
            f"Börse meldet {tatsaechlich:.8f}. Angehalten, bis das geklärt ist.",
            erwartet=erwartet, tatsaechlich=tatsaechlich,
        )
    befunde.append(
        f"Bestand stimmt überein ({tatsaechlich:.8f} {info.basis}), "
        f"{float(guthaben.get(info.quote, 0.0)):.2f} {info.quote} verfügbar"
    )
    if pos and not pos.geschuetzt and not ausgefuehrt:
        befunde.append("ACHTUNG: offene Position ohne Absicherung an der Börse")
        melder.melden(
            "Position ohne Absicherung",
            f"{pos.menge:.8f} {info.basis} offen, aber kein Stop an der Börse.",
            dringend=True,
        )
    if len(befunde) > 1:
        melder.melden("Abgleich beim Start", "\n".join(befunde))
    return befunde
