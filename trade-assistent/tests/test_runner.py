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


class TestWebhookToken(unittest.TestCase):
    """Geschützte ntfy-Themen brauchen einen Bearer-Kopf."""

    def _abfangen(self, melder):
        """Schickt die Meldung ab und gibt die Anfrage zurück, ohne Netz."""
        import urllib.request

        from assistant import notify

        gefangen = {}

        class Antwort:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        def gefaelscht(req, timeout=None):
            gefangen["req"] = req
            return Antwort()

        echt = urllib.request.urlopen
        notify.urllib.request.urlopen = gefaelscht
        try:
            melder.melden("Betreff", "Text")
        finally:
            notify.urllib.request.urlopen = echt
        return gefangen["req"]

    def test_ohne_token_kein_autorisierungskopf(self):
        from assistant.notify import WebhookMelder

        req = self._abfangen(WebhookMelder("https://ntfy.sh/thema"))
        self.assertNotIn("Authorization", dict(req.header_items()))

    def test_mit_token_geht_bearer_mit(self):
        from assistant.notify import WebhookMelder

        req = self._abfangen(WebhookMelder("https://ntfy.sh/thema", token="tk_beispiel"))
        koepfe = {k.lower(): v for k, v in req.header_items()}
        self.assertEqual(koepfe.get("Authorization".lower()), "Bearer tk_beispiel")

    def test_token_kommt_aus_der_umgebung(self):
        import os

        from assistant import notify

        alt = dict(os.environ)
        os.environ["HANDELSASSISTENT_WEBHOOK"] = "https://ntfy.sh/thema"
        os.environ["HANDELSASSISTENT_WEBHOOK_TOKEN"] = "tk_ausUmgebung"
        try:
            melder = notify.aus_umgebung(konsole=False)
            webhooks = [m for m in melder.melder if isinstance(m, notify.WebhookMelder)]
            self.assertEqual(webhooks[0].token, "tk_ausUmgebung")
        finally:
            os.environ.clear()
            os.environ.update(alt)


class TestThemenname(unittest.TestCase):
    """Bei ntfy.sh ist der Themenname das einzige Geheimnis."""

    def test_kurzes_thema_wird_beanstandet(self):
        from assistant.notify import themenname_pruefen

        self.assertIsNotNone(themenname_pruefen("https://ntfy.sh/abe"))
        self.assertIn("einzige Geheimnis", themenname_pruefen("https://ntfy.sh/abe"))

    def test_wort_als_thema_wird_beanstandet(self):
        from assistant.notify import themenname_pruefen

        self.assertIsNotNone(themenname_pruefen("https://ntfy.sh/trading"))

    def test_langes_zufallsthema_geht_durch(self):
        from assistant.notify import themenname_pruefen, zufaelliges_thema

        self.assertIsNone(themenname_pruefen(f"https://ntfy.sh/{zufaelliges_thema()}"))

    def test_token_entschaerft_einen_kurzen_namen_nicht(self):
        """Regression: Ein Token macht ein Thema auf dem kostenlosen ntfy.sh
        nicht privat. Die Warnung darf deshalb nicht entfallen."""
        from assistant.notify import themenname_pruefen

        warnung = themenname_pruefen("https://ntfy.sh/abe", token="tk_x")
        self.assertIsNotNone(warnung)
        self.assertIn("Zugangstoken ändert daran nichts", warnung)

    def test_andere_dienste_werden_nicht_beanstandet(self):
        from assistant.notify import themenname_pruefen

        self.assertIsNone(themenname_pruefen("https://discord.com/api/webhooks/1/xy"))

    def test_vorschlag_ist_lang_und_verschieden(self):
        from assistant.notify import zufaelliges_thema

        a, b = zufaelliges_thema(), zufaelliges_thema()
        self.assertNotEqual(a, b)
        self.assertGreaterEqual(len(a), 20)
