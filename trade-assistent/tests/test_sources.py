"""Cache und Nachladelogik — ohne Netz, gegen eine erfundene Quelle."""

import tempfile
import unittest
from pathlib import Path

from assistant import sources
from assistant.candles import Candle

TAG = 86400


class ErfundeneQuelle:
    """Liefert lückenlose Kerzen und merkt sich, was abgefragt wurde."""

    name = "erfunden"

    def __init__(self):
        self.abfragen: list[tuple[int, int]] = []

    def fetch(self, symbol, step, start, end):
        self.abfragen.append((start, end))
        erste = (start // step) * step
        return [
            Candle(ts, 100.0, 101.0, 99.0, 100.0 + ts % 7, 5.0)
            for ts in range(erste, end, step)
        ]


class TestCache(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cache = sources.Cache(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_schreiben_und_lesen(self):
        kerzen = [Candle(i * TAG, 1, 2, 0.5, 1.5, 10) for i in range(5)]
        self.assertEqual(self.cache.schreib("q", "abc", TAG, kerzen), 5)
        self.assertEqual(len(self.cache.lies("q", "abc", TAG)), 5)

    def test_erneutes_schreiben_erzeugt_keine_duplikate(self):
        kerzen = [Candle(i * TAG, 1, 2, 0.5, 1.5, 10) for i in range(5)]
        self.cache.schreib("q", "abc", TAG, kerzen)
        self.assertEqual(self.cache.schreib("q", "abc", TAG, kerzen), 0)
        self.assertEqual(len(self.cache.lies("q", "abc", TAG)), 5)

    def test_symbolschreibweise_egal(self):
        self.cache.schreib("q", "BTC/USD", TAG, [Candle(0, 1, 1, 1, 1, 1)])
        self.assertEqual(len(self.cache.lies("q", "btcusd", TAG)), 1)

    def test_leerer_cache_liefert_leere_liste(self):
        self.assertEqual(self.cache.lies("q", "gibtsnicht", TAG), [])


class TestNachladen(unittest.TestCase):
    """Regression: Ein später vergrössertes Zeitfenster muss auch die
    *ältere* Lücke nachladen, nicht nur die am aktuellen Rand."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cache = sources.Cache(self.tmp.name)
        self.quelle = ErfundeneQuelle()
        self.echte = sources.QUELLEN.copy()
        sources.QUELLEN["erfunden"] = lambda: self.quelle
        self.jetzt = 3000 * TAG

    def tearDown(self):
        sources.QUELLEN.clear()
        sources.QUELLEN.update(self.echte)
        self.tmp.cleanup()

    def _laden(self, tage):
        return sources.load("test", TAG, tage=tage, quelle="erfunden",
                            cache=self.cache, ende=self.jetzt)

    def test_groesseres_fenster_laedt_die_aeltere_luecke_nach(self):
        klein = self._laden(100)
        self.assertEqual(len(klein), 100)
        gross = self._laden(400)
        self.assertEqual(len(gross), 400, "das ältere Stück muss nachgeladen werden")

    def test_zweiter_lauf_fragt_die_quelle_nicht_erneut(self):
        self._laden(100)
        vorher = len(self.quelle.abfragen)
        self._laden(100)
        self.assertEqual(len(self.quelle.abfragen), vorher,
                         "vollständig zwischengespeicherte Daten brauchen keinen Abruf")

    def test_offline_nutzt_nur_den_cache(self):
        self._laden(100)
        vorher = len(self.quelle.abfragen)
        s = sources.load("test", TAG, tage=100, quelle="erfunden", cache=self.cache,
                         offline=True, ende=self.jetzt)
        self.assertEqual(len(s), 100)
        self.assertEqual(len(self.quelle.abfragen), vorher)

    def test_offline_ohne_cache_meldet_klar(self):
        with self.assertRaises(sources.QuellenFehler):
            sources.load("leer", TAG, tage=10, quelle="erfunden", cache=self.cache,
                         offline=True, ende=self.jetzt)


class TestSchrittpruefung(unittest.TestCase):
    def test_bitstamp_lehnt_unbekannte_schrittweite_ab(self):
        with self.assertRaises(sources.QuellenFehler):
            sources.BitstampSource().fetch("btcusd", 777, 0, 100)

    def test_kraken_lehnt_unbekannte_schrittweite_ab(self):
        with self.assertRaises(sources.QuellenFehler):
            sources.KrakenSource().fetch("btcusd", 777, 0, 100)

    def test_kraken_uebersetzt_btc_nach_xbt(self):
        self.assertEqual(sources.KrakenSource.normiere("BTC/USD"), "XBTUSD")


if __name__ == "__main__":
    unittest.main()
