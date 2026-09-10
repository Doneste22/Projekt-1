"""Kursdaten holen und auf Platte vorhalten.

Zwei Quellen, beide ohne Schlüssel abrufbar:

* Bitstamp — blättert beliebig weit zurück, deshalb die Vorgabe für Backtests.
* Kraken   — liefert nur die letzten 720 Kerzen, taugt als Zweitmeinung und
             für den laufenden Betrieb.

Alles Geholte landet im Cache. Ein Backtest liest danach von Platte und liefert
bei jedem Lauf dasselbe Ergebnis — sonst vergleicht man Strategien gegen
verschobene Daten und hält das Rauschen für Fortschritt.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Iterable, Protocol

from .candles import Candle, Series

BENUTZER_AGENT = "handelsassistent/0.1 (+lokal)"

# Von Bitstamp zugelassene Schrittweiten in Sekunden.
BITSTAMP_SCHRITTE = (60, 180, 300, 900, 1800, 3600, 7200, 14400, 21600, 43200, 86400, 259200)
# Kraken rechnet in Minuten.
KRAKEN_SCHRITTE = {60: 1, 300: 5, 900: 15, 1800: 30, 3600: 60, 14400: 240, 86400: 1440}


class QuellenFehler(RuntimeError):
    pass


def _hole(url: str, versuche: int = 4, pause: float = 2.0) -> dict:
    """HTTP-GET mit exponentiellem Rückzug. Netz ist unzuverlässig, nicht optional."""
    letzter: Exception | None = None
    for versuch in range(versuche):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": BENUTZER_AGENT})
            with urllib.request.urlopen(req, timeout=30) as antwort:
                return json.loads(antwort.read().decode("utf-8"))
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as fehler:
            letzter = fehler
            if versuch < versuche - 1:
                time.sleep(pause * (2**versuch))
        except json.JSONDecodeError as fehler:
            raise QuellenFehler(f"Antwort war kein JSON: {url}") from fehler
    raise QuellenFehler(f"{url} nach {versuche} Versuchen nicht erreichbar: {letzter}")


class Source(Protocol):
    name: str

    def fetch(self, symbol: str, step: int, start: int, end: int) -> list[Candle]: ...


class BitstampSource:
    """Öffentliche OHLC-Schnittstelle von Bitstamp, blättert vorwärts."""

    name = "bitstamp"
    MAX_PRO_ABRUF = 1000

    def __init__(self, pause: float = 0.25):
        self.pause = pause

    @staticmethod
    def normiere(symbol: str) -> str:
        return symbol.replace("/", "").replace("-", "").lower()

    def fetch(self, symbol: str, step: int, start: int, end: int) -> list[Candle]:
        if step not in BITSTAMP_SCHRITTE:
            raise QuellenFehler(
                f"Bitstamp kennt {step}s nicht. Erlaubt: {', '.join(map(str, BITSTAMP_SCHRITTE))}"
            )
        paar = self.normiere(symbol)
        gesammelt: list[Candle] = []
        cursor = start
        while cursor < end:
            url = (
                f"https://www.bitstamp.net/api/v2/ohlc/{paar}/"
                f"?step={step}&limit={self.MAX_PRO_ABRUF}&start={cursor}"
            )
            daten = _hole(url)
            if "data" not in daten:
                raise QuellenFehler(f"Bitstamp kennt das Paar '{paar}' nicht ({daten})")
            rohe = daten["data"].get("ohlc", [])
            if not rohe:
                break
            teil = [
                Candle(
                    int(r["timestamp"]),
                    float(r["open"]),
                    float(r["high"]),
                    float(r["low"]),
                    float(r["close"]),
                    float(r["volume"]),
                )
                for r in rohe
            ]
            teil = [c for c in teil if c.ts < end]
            gesammelt.extend(teil)
            letzter = int(rohe[-1]["timestamp"])
            if letzter < cursor + step:  # kein Fortschritt — Endlosschleife vermeiden
                break
            cursor = letzter + step
            if len(rohe) < self.MAX_PRO_ABRUF:
                break
            time.sleep(self.pause)
        return gesammelt


class KrakenSource:
    """Kraken liefert höchstens 720 Kerzen — kein `since` holt ältere zurück."""

    name = "kraken"
    MAX_KERZEN = 720

    @staticmethod
    def normiere(symbol: str) -> str:
        s = symbol.replace("/", "").replace("-", "").upper()
        return {"BTCUSD": "XBTUSD", "BTCEUR": "XBTEUR"}.get(s, s)

    def fetch(self, symbol: str, step: int, start: int, end: int) -> list[Candle]:
        if step not in KRAKEN_SCHRITTE:
            raise QuellenFehler(
                f"Kraken kennt {step}s nicht. Erlaubt: {', '.join(map(str, KRAKEN_SCHRITTE))}"
            )
        paar = self.normiere(symbol)
        url = (
            f"https://api.kraken.com/0/public/OHLC?pair={paar}"
            f"&interval={KRAKEN_SCHRITTE[step]}&since={max(0, start)}"
        )
        daten = _hole(url)
        if daten.get("error"):
            raise QuellenFehler(f"Kraken: {daten['error']}")
        ergebnis = daten.get("result", {})
        reihen = next((v for k, v in ergebnis.items() if k != "last"), [])
        kerzen = [
            Candle(int(r[0]), float(r[1]), float(r[2]), float(r[3]), float(r[4]), float(r[6]))
            for r in reihen
        ]
        return [c for c in kerzen if start <= c.ts < end]


QUELLEN: dict[str, type] = {"bitstamp": BitstampSource, "kraken": KrakenSource}


class Cache:
    """Kerzen als CSV je (Quelle, Symbol, Schrittweite). Schlicht und les­bar."""

    def __init__(self, verzeichnis: str | Path = "daten"):
        self.verzeichnis = Path(verzeichnis)
        self.verzeichnis.mkdir(parents=True, exist_ok=True)

    def pfad(self, quelle: str, symbol: str, step: int) -> Path:
        sicher = symbol.replace("/", "").replace("-", "").lower()
        return self.verzeichnis / f"{quelle}_{sicher}_{step}.csv"

    def lies(self, quelle: str, symbol: str, step: int) -> list[Candle]:
        datei = self.pfad(quelle, symbol, step)
        if not datei.exists():
            return []
        kerzen = []
        with datei.open() as f:
            for zeile in f:
                zeile = zeile.strip()
                if not zeile or zeile.startswith("ts"):
                    continue
                kerzen.append(Candle.from_row(zeile.split(",")))
        return kerzen

    def schreib(self, quelle: str, symbol: str, step: int, kerzen: Iterable[Candle]) -> int:
        """Neue Kerzen einmischen und vollständig neu schreiben (atomar)."""
        vorhanden = {c.ts: c for c in self.lies(quelle, symbol, step)}
        vorher = len(vorhanden)
        for c in kerzen:
            vorhanden[c.ts] = c
        datei = self.pfad(quelle, symbol, step)
        temp = datei.with_suffix(".tmp")
        with temp.open("w") as f:
            f.write("ts,open,high,low,close,volume\n")
            for ts in sorted(vorhanden):
                c = vorhanden[ts]
                f.write(f"{c.ts},{c.open},{c.high},{c.low},{c.close},{c.volume}\n")
        os.replace(temp, datei)
        return len(vorhanden) - vorher


def load(
    symbol: str,
    step: int,
    tage: int = 365,
    quelle: str = "bitstamp",
    cache: Cache | None = None,
    offline: bool = False,
    ende: int | None = None,
) -> Series:
    """Serie der letzten `tage` Tage — aus dem Cache, fehlendes vom Netz.

    `offline=True` verbietet jeden Netzzugriff. Nützlich, um einen Backtest
    exakt auf denselben Daten zu wiederholen.
    """
    cache = cache or Cache()
    ende = int(ende if ende is not None else time.time())
    start = ende - tage * 86400

    vorrat = cache.lies(quelle, symbol, step)
    passend = [c for c in vorrat if start <= c.ts < ende]

    if not offline:
        # Beide Ränder prüfen. Wer nur vorn nachlädt, bekommt bei einem später
        # vergrösserten Zeitfenster stillschweigend zu wenig Historie zurück.
        treiber = QUELLEN[quelle]()
        luecken: list[tuple[int, int]] = []
        if not passend:
            luecken.append((start, ende))
        else:
            if passend[0].ts > start + step:
                luecken.append((start, passend[0].ts))       # fehlt hinten
            if passend[-1].ts + step < ende:
                luecken.append((passend[-1].ts + step, ende))  # fehlt vorn
        frisch: list[Candle] = []
        for von, bis in luecken:
            frisch.extend(treiber.fetch(symbol, step, von, bis))
        if frisch:
            cache.schreib(quelle, symbol, step, frisch)
            vorrat = cache.lies(quelle, symbol, step)
            passend = [c for c in vorrat if start <= c.ts < ende]

    if not passend:
        raise QuellenFehler(
            f"Keine Daten für {symbol} ({step}s). "
            + ("Cache ist leer und offline verlangt." if offline else "Quelle lieferte nichts.")
        )
    return Series(symbol, step, passend)


def ticker(symbol: str, quelle: str = "bitstamp") -> float:
    """Letzter gehandelter Kurs. Für die Überwachung offener Positionen."""
    if quelle == "bitstamp":
        paar = BitstampSource.normiere(symbol)
        daten = _hole(f"https://www.bitstamp.net/api/v2/ticker/{paar}/")
        return float(daten["last"])
    if quelle == "kraken":
        paar = KrakenSource.normiere(symbol)
        daten = _hole(f"https://api.kraken.com/0/public/Ticker?pair={paar}")
        if daten.get("error"):
            raise QuellenFehler(f"Kraken: {daten['error']}")
        eintrag = next(iter(daten["result"].values()))
        return float(eintrag["c"][0])
    raise QuellenFehler(f"Unbekannte Quelle: {quelle}")
