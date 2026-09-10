"""Der selbstständige Betrieb: Idempotenz, Neustartfestigkeit, Fehlertoleranz."""

import json
import tempfile
import unittest
from pathlib import Path

from assistant import runner as lauf
from assistant import sources
from assistant.candles import Candle, Series
from assistant.execution import CostModel
from assistant.risk import RiskRules
from assistant.strategy import Direction, Reason, Signal, Strategy

TAG = 86400


class ImmerKaufen(Strategy):
    name = "immer"

    def _rechne(self, s):
        pass

    def warmup(self):
        return 2

    def _stimmen(self, i):
        return [Reason("test", 1.0, 1.0, 1.0, "immer dafür")]

    def _stop_und_ziel(self, i):
        k = self.series[i].close
        return k * 0.95, k * 1.10


class NieKaufen(ImmerKaufen):
    name = "nie"

    def _stimmen(self, i):
        return [Reason("test", 0.0, -1.0, 1.0, "immer dagegen")]


class RunnerProbe(unittest.TestCase):
    """Ersetzt Netzzugriffe durch eine steuerbare Kursreihe."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.kurs = 100.0
        self.kerzen = 60
        self.echte_load, self.echte_ticker = sources.load, sources.ticker
        sources.load = self._load
        sources.ticker = self._ticker
        lauf.sources.load = self._load
        lauf.sources.ticker = self._ticker

    def tearDown(self):
        sources.load = lauf.sources.load = self.echte_load
        sources.ticker = lauf.sources.ticker = self.echte_ticker
        self.tmp.cleanup()

    def _load(self, symbol, step, **kw):
        return Series(symbol, step, [
            Candle(i * TAG, 100.0, 101.0, 99.0, 100.0, 10.0) for i in range(self.kerzen)
        ])

    def _ticker(self, symbol, quelle="bitstamp"):
        return self.kurs

    def _runner(self, strategie=None, **kw):
        return lauf.Runner(
            "test", TAG, strategie or ImmerKaufen(),
            regeln=RiskRules(min_staerke=0.3, abkuehlung_kerzen=0),
            kosten=CostModel(0.0, 0.0), arbeitsverzeichnis=self.tmp.name,
            startkapital=10_000.0, **kw,
        )


class TestIdempotenz(RunnerProbe):
    def test_zweiter_durchlauf_auf_gleicher_kerze_handelt_nicht(self):
        r = self._runner()
        erster = r.tick()
        self.assertEqual(erster.handlung, "gekauft")
        zweiter = r.tick()
        self.assertEqual(len(r.depot.positionen), 1, "es darf keine zweite Position entstehen")
        self.assertIn(zweiter.handlung, ("halten", "nichts"))

    def test_zehn_durchlaeufe_ergeben_einen_kauf(self):
        r = self._runner()
        for _ in range(10):
            r.tick()
        self.assertEqual(len(r.depot.trades) + len(r.depot.positionen), 1)


class TestNeustart(RunnerProbe):
    def test_zustand_ueberlebt_neuen_prozess(self):
        r1 = self._runner()
        r1.tick()
        menge = r1.depot.positionen["test"].menge
        r2 = self._runner()  # frische Instanz, gleiches Verzeichnis
        self.assertEqual(r2.ticks, r1.ticks)
        self.assertEqual(r2.letzte_kerze_ts, r1.letzte_kerze_ts)
        self.assertIn("test", r2.depot.positionen)
        self.assertAlmostEqual(r2.depot.positionen["test"].menge, menge)

    def test_kaputte_zustandsdatei_wird_beiseitegelegt(self):
        r = self._runner()
        r.tick()
        r.zustand_datei.write_text("{kein json")
        neu = self._runner()
        self.assertTrue(r.zustand_datei.with_suffix(".kaputt").exists())
        self.assertEqual(neu.ticks, 0, "nach dem Beiseitelegen wird frisch begonnen")

    def test_fremde_version_wird_abgelehnt(self):
        r = self._runner()
        r.tick()
        d = json.loads(r.zustand_datei.read_text())
        d["version"] = 999
        r.zustand_datei.write_text(json.dumps(d))
        with self.assertRaises(RuntimeError):
            self._runner()


class TestSchutz(RunnerProbe):
    def test_stop_schliesst_die_position(self):
        r = self._runner()
        r.tick()
        stop = r.depot.positionen["test"].stop
        self.kurs = stop - 1
        d = r.tick()
        self.assertEqual(d.handlung, "verkauft")
        self.assertIn("Stop", d.grund)
        self.assertEqual(r.depot.positionen, {})

    def test_ziel_schliesst_die_position(self):
        r = self._runner()
        r.tick()
        r.depot.positionen["test"].ziel = 105.0
        self.kurs = 106.0
        d = r.tick()
        self.assertEqual(d.handlung, "verkauft")
        self.assertIn("Ziel", d.grund)

    def test_netzfehler_reisst_die_schleife_nicht(self):
        def kaputt(*a, **kw):
            raise sources.QuellenFehler("Börse antwortet nicht")

        r = self._runner()
        lauf.sources.load = kaputt
        d = r.tick()
        self.assertEqual(d.handlung, "fehler")
        self.assertIn("Börse antwortet nicht", d.fehler)
        lauf.sources.load = self._load
        self.assertEqual(r.tick().handlung, "gekauft", "danach muss es weitergehen")

    def test_zu_wenig_historie_wird_abgewartet(self):
        self.kerzen = 3
        d = self._runner().tick()
        self.assertEqual(d.handlung, "warten")


class TestJournal(RunnerProbe):
    def test_jeder_durchlauf_hinterlaesst_eine_zeile(self):
        r = self._runner()
        for _ in range(4):
            r.tick()
        zeilen = r.journal_datei.read_text().strip().split("\n")
        self.assertEqual(len(zeilen), 4)
        for z in zeilen:
            eintrag = json.loads(z)
            self.assertTrue(eintrag["zeit"])
            self.assertTrue(eintrag["handlung"])

    def test_untaetigkeit_wird_begruendet(self):
        d = self._runner(strategie=NieKaufen()).tick()
        self.assertEqual(d.handlung, "abwarten")
        self.assertTrue(d.grund, "auch Nichtstun braucht einen Grund im Protokoll")
        self.assertTrue(d.gruende, "die Einzelstimmen gehören ins Journal")


class TestBrokerUnterscheidung(unittest.TestCase):
    """Der Runner muss Papier von Ernst unterscheiden können."""

    def test_papierbroker_ist_nicht_echt(self):
        from assistant.execution import PaperBroker

        self.assertFalse(PaperBroker().echt)

    def test_livebroker_ist_echt(self):
        from assistant.live import LiveBroker

        self.assertTrue(LiveBroker.echt)

    def test_papierbetrieb_gleicht_nicht_mit_der_boerse_ab(self):
        """Ohne echten Broker darf kein Börsenzugriff versucht werden."""
        from assistant.execution import PaperBroker

        self.assertFalse(getattr(PaperBroker(), "echt", False))


if __name__ == "__main__":
    unittest.main()
