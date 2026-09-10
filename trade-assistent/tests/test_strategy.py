"""Semantik der Signale.

Der wichtigste Fall hier: Eine klare Ablehnung darf sich nie wie eine
knapp verfehlte Zustimmung lesen.
"""

import unittest

from assistant.candles import Candle, Series
from assistant.strategy import STRATEGIEN, Direction, Reason, Signal, Strategy

TAG = 86400


def gerade_serie(n=300, steigend=True):
    kerzen = []
    for i in range(n):
        k = 100 + (i if steigend else -i * 0.2)
        kerzen.append(Candle(i * TAG, k, k + 1, k - 1, k, 100.0))
    return Series("test", TAG, kerzen)


class Dagegen(Strategy):
    name = "dagegen"

    def _rechne(self, s):
        pass

    def warmup(self):
        return 1

    def _stimmen(self, i):
        return [Reason("test", -5.0, -1.0, 1.0, "klar dagegen")]


class TestNeigung(unittest.TestCase):
    def test_ablehnung_hat_keine_hohe_staerke(self):
        s = gerade_serie(10)
        st = Dagegen()
        st.prepare(s)
        sig = st.evaluate(5)
        self.assertEqual(sig.richtung, Direction.FLAT)
        self.assertAlmostEqual(sig.punkte, -1.0, msg="die Neigung ist negativ")
        self.assertEqual(sig.staerke, 0.0,
                         "eine klare Ablehnung darf keine Kaufstärke ausweisen")

    def test_neigung_wird_mit_vorzeichen_gezeigt(self):
        s = gerade_serie(10)
        st = Dagegen()
        st.prepare(s)
        self.assertTrue(st.evaluate(5).neigung.startswith("-"))

    def test_staerke_bleibt_zwischen_null_und_eins(self):
        s = gerade_serie(400)
        for klasse in STRATEGIEN.values():
            st = klasse()
            st.prepare(s)
            for i in range(st.warmup(), len(s)):
                sig = st.evaluate(i)
                self.assertGreaterEqual(sig.staerke, 0.0)
                self.assertLessEqual(sig.staerke, 1.0)
                self.assertGreaterEqual(sig.punkte, -1.0000001)
                self.assertLessEqual(sig.punkte, 1.0000001)


class TestSchwelle(unittest.TestCase):
    def test_hohe_schwelle_verhindert_den_kauf(self):
        s = gerade_serie(400)
        locker = STRATEGIEN["trendfolge"](schwelle=0.1)
        streng = STRATEGIEN["trendfolge"](schwelle=0.99)
        locker.prepare(s)
        streng.prepare(s)
        i = len(s) - 1
        self.assertEqual(locker.evaluate(i).richtung, Direction.LONG)
        self.assertEqual(streng.evaluate(i).richtung, Direction.FLAT)


class TestAufwaermphase(unittest.TestCase):
    def test_vor_der_aufwaermphase_wird_nicht_gehandelt(self):
        s = gerade_serie(400)
        for klasse in STRATEGIEN.values():
            st = klasse()
            st.prepare(s)
            for i in range(0, st.warmup()):
                self.assertEqual(st.evaluate(i).richtung, Direction.FLAT,
                                 f"{st.name} handelt vor dem Aufwärmen")


class TestBegruendung(unittest.TestCase):
    def test_jedes_signal_traegt_seine_gruende(self):
        s = gerade_serie(400)
        for klasse in STRATEGIEN.values():
            st = klasse()
            st.prepare(s)
            sig = st.evaluate(len(s) - 1)
            self.assertTrue(sig.gruende, f"{st.name} liefert ein Signal ohne Begründung")
            for g in sig.gruende:
                self.assertTrue(g.text and g.indikator)

    def test_kaufsignal_schlaegt_einen_stop_vor(self):
        s = gerade_serie(400)
        st = STRATEGIEN["trendfolge"](schwelle=0.1)
        st.prepare(s)
        sig = st.evaluate(len(s) - 1)
        self.assertEqual(sig.richtung, Direction.LONG)
        self.assertIsNotNone(sig.stop, "ein Kauf ohne Stop hat kein bezifferbares Risiko")
        self.assertLess(sig.stop, sig.kurs)


if __name__ == "__main__":
    unittest.main()
