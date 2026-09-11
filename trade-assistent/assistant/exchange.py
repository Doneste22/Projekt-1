"""Signierter Zugang zur Kraken-Schnittstelle.

Nur das, was für echte Orders nötig ist — und mit den Vorsichtsmassnahmen,
die man erst vermisst, wenn Geld unterwegs ist:

* **Nonce dauerhaft und streng steigend.** Kraken lehnt jede Anfrage ab, deren
  Nonce nicht grösser ist als die letzte. Nach einem Neustart mit
  zurückgesetzter Uhr wäre sonst der Schlüssel unbrauchbar, bis die Zeit
  aufgeholt hat. Deshalb liegt der letzte Wert auf Platte.

* **Schreibende Aufrufe werden nach Zeitüberschreitung NICHT wiederholt.**
  Eine Zeitüberschreitung heisst nicht, dass die Order nicht ankam — sie
  heisst, dass die Antwort nicht ankam. Ein zweiter Versuch kauft womöglich
  doppelt. Stattdessen wird `UnklarerAusgang` geworfen; der Abgleich mit der
  Börse muss dann klären, was wirklich geschah.

* **Jede Order trägt eine `userref`.** Damit lässt sich nach einem Abbruch
  fragen: "Gibt es dazu schon eine Order?" — statt zu raten.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

BASIS = "https://api.kraken.com"
BENUTZER_AGENT = "handelsassistent/0.1"


class BoersenFehler(RuntimeError):
    """Die Börse hat klar und eindeutig abgelehnt."""


class UnklarerAusgang(RuntimeError):
    """Der Ausgang ist offen — es ist NICHT bekannt, ob die Order steht.

    Wer das mit einem erneuten Versuch beantwortet, kauft im schlechten Fall
    zweimal. Die einzige richtige Antwort ist ein Abgleich mit der Börse.
    """


@dataclass(frozen=True, slots=True)
class PaarInfo:
    """Was die Börse über ein Handelspaar vorschreibt."""

    name: str          # interner Name, z. B. XXBTZUSD
    altname: str       # z. B. XBTUSD
    basis: str         # Mengenwährung
    quote: str         # Preiswährung
    mengen_stellen: int
    preis_stellen: int
    mindestmenge: float
    mindestwert: float

    def menge_runden(self, menge: float) -> float:
        """Abrunden — aufrunden könnte über das verfügbare Guthaben gehen."""
        faktor = 10**self.mengen_stellen
        return int(menge * faktor) / faktor

    def preis_runden(self, preis: float) -> float:
        return round(preis, self.preis_stellen)

    def pruefe_order(self, menge: float, preis: float) -> str | None:
        """Gibt den Ablehnungsgrund zurück, oder None wenn die Order passt."""
        if menge < self.mindestmenge:
            return (f"Menge {menge:.8f} unter dem Mindest­volumen "
                    f"{self.mindestmenge:.8f} {self.basis}")
        if menge * preis < self.mindestwert:
            return (f"Ordervolumen {menge * preis:.2f} unter dem Mindestwert "
                    f"{self.mindestwert:.2f} {self.quote}")
        return None


class NonceZaehler:
    """Streng steigend, über Prozessgrenzen hinweg."""

    def __init__(self, datei: Path):
        self.datei = Path(datei)
        self.datei.parent.mkdir(parents=True, exist_ok=True)
        self._sperre = threading.Lock()
        self._letzte = 0
        if self.datei.exists():
            try:
                self._letzte = int(self.datei.read_text().strip())
            except (ValueError, OSError):
                self._letzte = 0

    def naechste(self) -> int:
        with self._sperre:
            wert = max(int(time.time() * 1000), self._letzte + 1)
            self._letzte = wert
            temp = self.datei.with_suffix(".tmp")
            temp.write_text(str(wert))
            os.replace(temp, self.datei)
            return wert


class Drossel:
    """Einfacher Eimer: Kraken sperrt bei zu vielen Aufrufen."""

    def __init__(self, mindestabstand: float = 1.1):
        self.mindestabstand = mindestabstand
        self._zuletzt = 0.0
        self._sperre = threading.Lock()

    def warten(self) -> None:
        with self._sperre:
            verstrichen = time.time() - self._zuletzt
            if verstrichen < self.mindestabstand:
                time.sleep(self.mindestabstand - verstrichen)
            self._zuletzt = time.time()


class KrakenClient:
    """Öffentliche und private Aufrufe. Ohne Schlüssel nur öffentliche."""

    def __init__(
        self,
        schluessel: str | None = None,
        geheimnis: str | None = None,
        nonce_datei: str | Path = "betrieb/nonce",
        zeitgrenze: int = 30,
        drossel: Drossel | None = None,
    ):
        self.schluessel = schluessel
        self.geheimnis = geheimnis
        self.nonce = NonceZaehler(nonce_datei)
        self.zeitgrenze = zeitgrenze
        self.drossel = drossel or Drossel()
        self._paare: dict[str, PaarInfo] = {}

    # -- Signatur -----------------------------------------------------------
    @staticmethod
    def signatur(pfad: str, daten: dict, geheimnis: str) -> str:
        """Kraken-Signatur: HMAC-SHA512 über Pfad + SHA256(nonce + Formulardaten).

        Gegen Krakens veröffentlichten Testvektor geprüft — siehe
        tests/test_exchange.py. Ohne diesen Nachweis wäre jede
        Fehlersuche an einem echten Konto Ratearbeit.
        """
        formular = urllib.parse.urlencode(daten)
        gehasht = hashlib.sha256((str(daten["nonce"]) + formular).encode()).digest()
        roh = hmac.new(base64.b64decode(geheimnis), pfad.encode() + gehasht, hashlib.sha512)
        return base64.b64encode(roh.digest()).decode()

    # -- Aufrufe ------------------------------------------------------------
    def _antwort(self, rohdaten: bytes) -> dict:
        antwort = json.loads(rohdaten.decode())
        if antwort.get("error"):
            raise BoersenFehler("; ".join(antwort["error"]))
        return antwort.get("result", {})

    def oeffentlich(self, methode: str, **parameter) -> dict:
        url = f"{BASIS}/0/public/{methode}"
        if parameter:
            url += "?" + urllib.parse.urlencode(parameter)
        self.drossel.warten()
        req = urllib.request.Request(url, headers={"User-Agent": BENUTZER_AGENT})
        with urllib.request.urlopen(req, timeout=self.zeitgrenze) as a:
            return self._antwort(a.read())

    def privat(self, methode: str, schreibend: bool = False, **parameter) -> dict:
        """Signierter Aufruf.

        `schreibend=True` markiert Aufrufe, die etwas verändern. Bei einer
        Zeitüberschreitung wird dann nicht wiederholt, sondern `UnklarerAusgang`
        geworfen.
        """
        if not (self.schluessel and self.geheimnis):
            raise BoersenFehler("Kein API-Schlüssel gesetzt — privater Aufruf nicht möglich")
        pfad = f"/0/private/{methode}"
        daten = {"nonce": self.nonce.naechste(), **{
            k: v for k, v in parameter.items() if v is not None
        }}
        koerper = urllib.parse.urlencode(daten).encode()
        kopf = {
            "API-Key": self.schluessel,
            "API-Sign": self.signatur(pfad, daten, self.geheimnis),
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": BENUTZER_AGENT,
        }
        self.drossel.warten()
        req = urllib.request.Request(BASIS + pfad, data=koerper, headers=kopf, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=self.zeitgrenze) as a:
                return self._antwort(a.read())
        except (TimeoutError, urllib.error.URLError, OSError) as fehler:
            if schreibend:
                raise UnklarerAusgang(
                    f"{methode}: keine Antwort ({type(fehler).__name__}: {fehler}). "
                    "Ob die Order steht, ist offen — Abgleich mit der Börse nötig."
                ) from fehler
            raise BoersenFehler(f"{methode} nicht erreichbar: {fehler}") from fehler

    # -- Öffentliche Auskünfte ---------------------------------------------
    def systemstatus(self) -> str:
        return self.oeffentlich("SystemStatus").get("status", "unbekannt")

    def paar_info(self, paar: str) -> PaarInfo:
        """Vorschriften des Paares. Wird zwischengespeichert."""
        schluessel = paar.upper()
        if schluessel in self._paare:
            return self._paare[schluessel]
        ergebnis = self.oeffentlich("AssetPairs", pair=paar)
        if not ergebnis:
            raise BoersenFehler(f"Kraken kennt das Paar '{paar}' nicht")
        name, w = next(iter(ergebnis.items()))
        info = PaarInfo(
            name=name,
            altname=w.get("altname", name),
            basis=w.get("base", "?"),
            quote=w.get("quote", "?"),
            mengen_stellen=int(w.get("lot_decimals", 8)),
            preis_stellen=int(w.get("pair_decimals", 2)),
            mindestmenge=float(w.get("ordermin", 0.0)),
            mindestwert=float(w.get("costmin", 0.0)),
        )
        self._paare[schluessel] = info
        return info

    def letzter_kurs(self, paar: str) -> float:
        ergebnis = self.oeffentlich("Ticker", pair=paar)
        return float(next(iter(ergebnis.values()))["c"][0])

    # -- Konto --------------------------------------------------------------
    def guthaben(self) -> dict[str, float]:
        return {k: float(v) for k, v in self.privat("Balance").items()}

    def offene_orders(self, userref: int | None = None) -> dict:
        ergebnis = self.privat("OpenOrders", userref=userref)
        return ergebnis.get("open", {})

    def geschlossene_orders(self, userref: int | None = None, seit: int | None = None) -> dict:
        ergebnis = self.privat("ClosedOrders", userref=userref, start=seit)
        return ergebnis.get("closed", {})

    def order_abfragen(self, txid: str) -> dict:
        ergebnis = self.privat("QueryOrders", txid=txid)
        return ergebnis.get(txid, {})

    def order_stornieren(self, txid: str) -> dict:
        return self.privat("CancelOrder", schreibend=True, txid=txid)

    def order_aufgeben(
        self,
        paar: str,
        seite: str,
        menge: float,
        art: str = "market",
        preis: float | None = None,
        userref: int | None = None,
        nur_pruefen: bool = True,
    ) -> dict:
        """Order aufgeben. `nur_pruefen=True` lässt Kraken prüfen ohne auszuführen.

        Die Vorgabe ist mit Absicht `True`: Wer eine echte Order will, muss das
        an dieser Stelle ausdrücklich hinschreiben.
        """
        if seite not in ("buy", "sell"):
            raise ValueError("seite muss 'buy' oder 'sell' sein")
        info = self.paar_info(paar)
        menge = info.menge_runden(menge)
        parameter = {
            "pair": info.altname,
            "type": seite,
            "ordertype": art,
            "volume": f"{menge:.{info.mengen_stellen}f}",
            "userref": userref,
        }
        if preis is not None:
            parameter["price"] = f"{info.preis_runden(preis):.{info.preis_stellen}f}"
        if nur_pruefen:
            parameter["validate"] = "true"
        return self.privat("AddOrder", schreibend=not nur_pruefen, **parameter)


def schluessel_laden(datei: str | Path | None = None) -> tuple[str | None, str | None]:
    """Schlüssel aus Umgebung oder Datei — niemals aus dem Quelltext.

    Die Datei muss ausschliesslich dem Besitzer lesbar sein (Modus 0600).
    Ein zu offener Schlüssel wird abgelehnt statt stillschweigend benutzt:
    Ein Handelsschlüssel in einer welt­lesbaren Datei ist ein Vorfall, keine
    Unbequemlichkeit.
    """
    aus_umgebung = (os.environ.get("KRAKEN_API_KEY"), os.environ.get("KRAKEN_API_SECRET"))
    if all(aus_umgebung):
        return aus_umgebung
    if datei is None:
        return (None, None)
    pfad = Path(datei)
    if not pfad.exists():
        return (None, None)
    modus = pfad.stat().st_mode & 0o777
    if modus & 0o077:
        raise BoersenFehler(
            f"{pfad} ist mit Modus {modus:o} zu offen. "
            f"Erwartet wird 0600 — behebbar mit: chmod 600 {pfad}"
        )
    zeilen = [z.strip() for z in pfad.read_text().splitlines() if z.strip() and not z.startswith("#")]
    if len(zeilen) < 2:
        raise BoersenFehler(f"{pfad} braucht zwei Zeilen: Schlüssel, dann Geheimnis")
    return zeilen[0], zeilen[1]
