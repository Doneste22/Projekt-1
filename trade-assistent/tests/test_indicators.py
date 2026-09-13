"""Indikatoren gegen bekannte Referenzwerte.

Die Kursreihe und die RSI-Sollwerte stammen aus Wilders "New Concepts in
Technical Trading Systems" — dieselbe Reihe, an der sich jede Chartsoftware
messen lässt.

Zur Toleranz von 0,1: Die publizierten Sollwerte wurden aus Kursen mit mehr
Nachkommastellen gerechnet, als die Tabelle abdruckt. Aus den gerundeten
Kursen hier ergibt die Handrechnung exakt 70,4641 statt 70,53. Die Abweichung
fällt über die Reihe von 0,07 auf 0,01, weil Wilders Glättung den Startwert
vergisst. Der Test bleibt trotzdem scharf: Mit der falschen Glättung
(alpha = 2/(n+1) statt 1/n) endet die Reihe bei 31,7 statt 37,8.
"""

import math
import unittest

from assistant import indicators as ind

WILDER_CLOSES = [
    44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08,
    45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64,
    46.21, 46.25, 45.71, 46.45, 45.78, 45.35, 44.03, 44.18, 44.22, 44.57,
    43.42, 42.66, 43.13,
]
WILDER_RSI14 = [
    70.53, 66.32, 66.55, 69.41, 66.36, 57.97, 62.93, 63.26, 56.06, 62.38,
    54.71, 50.42, 39.99, 41.46, 41.87, 45.46, 37.30, 33.08, 37.77,
]


class TestRSI(unittest.TestCase):
    def test_wilder_referenzreihe(self):
        werte = ind.rsi(WILDER_CLOSES, 14)
        self.assertTrue(all(w is None for w in werte[:14]), "Aufwärmphase muss None sein")
        for versatz, soll in enumerate(WILDER_RSI14):
            ist = werte[14 + versatz]
            self.assertIsNotNone(ist)
            self.assertAlmostEqual(ist, soll, delta=0.1, msg=f"Index {14+versatz}")

    def test_nur_steigend_ist_hundert(self):
        self.assertAlmostEqual(ind.rsi(list(range(1, 40)), 14)[-1], 100.0, delta=1e-9)

    def test_nur_fallend_ist_null(self):
        self.assertAlmostEqual(ind.rsi(list(range(40, 1, -1)), 14)[-1], 0.0, delta=1e-9)

    def test_zu_kurze_reihe(self):
        self.assertEqual(ind.rsi([1, 2, 3], 14), [None, None, None])


class TestDurchschnitte(unittest.TestCase):
    def test_sma_fenster(self):
        self.assertEqual(ind.sma([1, 2, 3, 4, 5], 3), [None, None, 2.0, 3.0, 4.0])

    def test_ema_startet_mit_sma(self):
        werte = [1, 2, 3, 4, 5, 6]
        e = ind.ema(werte, 3)
        self.assertIsNone(e[1])
        self.assertAlmostEqual(e[2], 2.0)  # SMA(1,2,3)
        self.assertAlmostEqual(e[3], 4 * 0.5 + 2.0 * 0.5)  # alpha = 2/(3+1)

    def test_ema_konstante_reihe(self):
        self.assertAlmostEqual(ind.ema([7.0] * 50, 10)[-1], 7.0)

    def test_wilder_alpha_ist_ein_n_tel(self):
        w = ind.wilder([1, 2, 3, 4, 5], 3)
        self.assertAlmostEqual(w[2], 2.0)
        self.assertAlmostEqual(w[3], (2.0 * 2 + 4) / 3)


class TestSpanne(unittest.TestCase):
    def test_true_range_beachtet_kurslücke(self):
        highs, lows, closes = [10, 20], [9, 19], [10, 20]
        # Zweite Kerze klafft nach oben. Die eigene Spanne beträgt nur 1,
        # der Abstand zum Vorschluss aber 10 — das ist die wahre Spanne.
        self.assertEqual(ind.true_range(highs, lows, closes)[1], 10.0)

    def test_true_range_ohne_kurslücke_ist_eigene_spanne(self):
        highs, lows, closes = [10, 12], [9, 8], [9.5, 11]
        self.assertEqual(ind.true_range(highs, lows, closes)[1], 4.0)

    def test_atr_konstante_spanne(self):
        n = 30
        highs = [11.0] * n
        lows = [10.0] * n
        closes = [10.5] * n
        self.assertAlmostEqual(ind.atr(highs, lows, closes, 14)[-1], 1.0, delta=1e-9)


class TestBollinger(unittest.TestCase):
    def test_konstante_reihe_hat_kein_band(self):
        m, o, u = ind.bollinger([5.0] * 30, 20, 2.0)
        self.assertAlmostEqual(o[-1], 5.0)
        self.assertAlmostEqual(u[-1], 5.0)

    def test_band_ist_symmetrisch(self):
        werte = [math.sin(i / 3) * 10 + 100 for i in range(60)]
        m, o, u = ind.bollinger(werte, 20, 2.0)
        self.assertAlmostEqual(o[-1] - m[-1], m[-1] - u[-1], delta=1e-9)


class TestDonchian(unittest.TestCase):
    def test_schliesst_aktuelle_kerze_aus(self):
        highs = [1, 2, 3, 99]
        lows = [1, 1, 1, 1]
        ob, un = ind.donchian(highs, lows, 3)
        self.assertEqual(ob[3], 3)  # nicht 99


class TestADX(unittest.TestCase):
    def test_starker_aufwaertstrend(self):
        n = 80
        highs = [100 + i for i in range(n)]
        lows = [99 + i for i in range(n)]
        closes = [99.5 + i for i in range(n)]
        a, p, m = ind.adx(highs, lows, closes, 14)
        self.assertGreater(a[-1], 60, "reiner Trend muss hohen ADX ergeben")
        self.assertGreater(p[-1], m[-1], "+DI muss im Aufwärtstrend führen")

    def test_seitwaerts_hat_schwachen_adx(self):
        n = 200
        highs, lows, closes = [], [], []
        for i in range(n):
            basis = 100 + (1 if i % 2 else -1)
            highs.append(basis + 0.5)
            lows.append(basis - 0.5)
            closes.append(basis)
        a, p, m = ind.adx(highs, lows, closes, 14)
        self.assertLess(a[-1], 30, "Sägezahn darf keinen Trend melden")


class TestLaengen(unittest.TestCase):
    def test_alle_geben_eingabelaenge_zurueck(self):
        n = 100
        closes = [100 + math.sin(i / 5) * 5 for i in range(n)]
        highs = [c + 1 for c in closes]
        lows = [c - 1 for c in closes]
        for name, werte in [
            ("sma", ind.sma(closes, 20)),
            ("ema", ind.ema(closes, 20)),
            ("rsi", ind.rsi(closes, 14)),
            ("atr", ind.atr(highs, lows, closes, 14)),
            ("macd", ind.macd(closes)[0]),
            ("macd_signal", ind.macd(closes)[1]),
            ("bb", ind.bollinger(closes)[1]),
            ("donchian", ind.donchian(highs, lows)[0]),
            ("adx", ind.adx(highs, lows, closes)[0]),
        ]:
            self.assertEqual(len(werte), n, f"{name} verschiebt die Indexierung")


if __name__ == "__main__":
    unittest.main()
