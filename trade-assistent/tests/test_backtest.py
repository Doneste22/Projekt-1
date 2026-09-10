"""Die Backtest-Maschine gegen konstruierte Fälle.

Schwache Ergebnisse einer Strategie sind erst dann eine Aussage über die
Strategie, wenn die Maschine nachweislich stimmt. Deshalb hier vor allem
Fälle, in denen das Ergebnis vorher von Hand bekannt ist.
"""

import unittest

from assistant.backtest import _max_rueckgang, run
from assistant.candles import Candle, Series
from assistant.execution import CostModel
from assistant.risk import RiskRules
from assistant.strategy import Direction, Reason, Signal, Strategy

TAG = 86400


def serie(kurse, symbol="test", hoch=None, tief=None):
    """Serie aus Schlusskursen; Eröffnung ist der Vorschluss."""
    kerzen = []
    for i, k in enumerate(kurse):
        auf = kurse[i - 1] if i else k
        h = hoch[i] if hoch else max(auf, k)
        t = tief[i] if tief else min(auf, k)
        kerzen.append(Candle(i * TAG, auf, h, t, k, 100.0))
    return Series(symbol, TAG, kerzen)


class ImmerLong(Strategy):
    """Kauft, sobald möglich, und hält."""

    name = "immer"

    def _rechne(self, s):
        pass

    def warmup(self):
        return 1

    def _stimmen(self, i):
        return [Reason("test", 1.0, 1.0, 1.0, "immer dafür")]

    def _stop_und_ziel(self, i):
        return self.series[i].close * 0.5, None  # weiter Stop, greift nie


class Hellseher(Strategy):
    """Kennt die Zukunft. Existiert nur, um die Maschine zu prüfen."""

    name = "hellseher"

    def _rechne(self, s):
        pass

    def warmup(self):
        return 1

    def _stimmen(self, i):
        steigt = i + 2 < len(self.series) and self.series[i + 2].close > self.series[i].close
        return [Reason("zukunft", 1.0, 1.0 if steigt else -1.0, 1.0, "geschummelt")]

    def _stop_und_ziel(self, i):
        return self.series[i].close * 0.5, None

    def exit_signal(self, i, einstieg):
        if i + 2 < len(self.series) and self.series[i + 2].close > self.series[i].close:
            return None
        k = self.series[i]
        return Signal(Direction.EXIT, 1.0, k.close, k.ts,
                      [Reason("zukunft", 0.0, -1.0, 1.0, "fällt gleich")])


class TestRueckgang(unittest.TestCase):
    def test_ohne_rueckgang(self):
        self.assertEqual(_max_rueckgang([1, 2, 3, 4])[0], 0.0)

    def test_haelfte_verloren(self):
        tiefe, dauer = _max_rueckgang([100, 50, 100])
        self.assertAlmostEqual(tiefe, 0.5)
        self.assertEqual(dauer, 1)

    def test_dauer_zaehlt_bis_neues_hoch(self):
        _, dauer = _max_rueckgang([100, 90, 80, 85, 101])
        self.assertEqual(dauer, 3)


class TestKeineVorausschau(unittest.TestCase):
    def test_einstieg_erfolgt_zur_naechsten_eroeffnung(self):
        """Signal auf Kerze i darf frühestens auf Kerze i+1 ausgeführt werden."""
        s = serie([100] * 5 + [200] * 5)  # Sprung von Kerze 4 auf 5
        e = run(s, ImmerLong(), kosten=CostModel(0, 0))
        erster = e.trades[0]
        self.assertGreaterEqual(
            erster.einstieg_ts, 2 * TAG,
            "Einstieg vor Kerze 2 wäre nur mit Blick nach vorn möglich",
        )
        self.assertEqual(erster.einstieg, 100.0, "gefüllt wird zur Eröffnung, nicht zum Sprungkurs")

    def test_hellseher_schlaegt_den_markt_deutlich(self):
        """Beweist, dass die Maschine hohe Renditen überhaupt abbilden kann."""
        kurse = [100 + (30 if i % 6 < 3 else -30) for i in range(200)]
        s = serie(kurse)
        regeln = RiskRules(risiko_je_trade=0.02, max_positionsanteil=1.0, abkuehlung_kerzen=0)
        mit = run(s, Hellseher(), regeln=regeln, kosten=CostModel(0, 0))
        ohne = run(s, ImmerLong(), regeln=regeln, kosten=CostModel(0, 0))
        self.assertGreater(mit.metrics.gesamtrendite, 0.5,
                           "Wer die Zukunft kennt, muss hier klar gewinnen")
        self.assertGreater(mit.metrics.gesamtrendite, ohne.metrics.gesamtrendite)


class TestStops(unittest.TestCase):
    def test_stop_wird_zum_stopkurs_gefuellt(self):
        s = serie([100, 100, 100, 100], hoch=[100, 100, 100, 100], tief=[100, 100, 100, 80])
        e = run(s, ImmerLong(), regeln=RiskRules(notstop_anteil=0.10), kosten=CostModel(0, 0))
        self.assertTrue(e.trades)
        self.assertEqual(e.trades[0].ausstieg, 90.0)
        self.assertEqual(e.trades[0].grund, "Stop erreicht")

    def test_kurslücke_unter_den_stop_fuellt_zur_eroeffnung(self):
        """Öffnet die Kerze unter dem Stop, gibt es den Stopkurs nicht mehr."""
        kerzen = [
            Candle(0, 100, 100, 100, 100, 1),
            Candle(TAG, 100, 100, 100, 100, 1),
            Candle(2 * TAG, 100, 100, 100, 100, 1),
            Candle(3 * TAG, 70, 72, 68, 70, 1),  # klafft weit unter den 90er-Stop
        ]
        s = Series("test", TAG, kerzen)
        e = run(s, ImmerLong(), regeln=RiskRules(notstop_anteil=0.10), kosten=CostModel(0, 0))
        self.assertEqual(e.trades[0].ausstieg, 70.0, "muss zur Eröffnung füllen, nicht zu 90")

    def test_stop_geht_dem_ziel_vor(self):
        """Trifft eine Kerze beides, zählt der Stop — die Reihenfolge ist unbekannt."""

        class MitZiel(ImmerLong):
            def _stop_und_ziel(self, i):
                k = self.series[i].close
                return k * 0.9, k * 1.1

        kerzen = [
            Candle(0, 100, 100, 100, 100, 1),
            Candle(TAG, 100, 100, 100, 100, 1),
            Candle(2 * TAG, 100, 100, 100, 100, 1),
            Candle(3 * TAG, 100, 120, 80, 100, 1),  # trifft 90 und 110
        ]
        e = run(Series("test", TAG, kerzen), MitZiel(), kosten=CostModel(0, 0))
        self.assertEqual(e.trades[0].grund, "Stop erreicht")


class TestKosten(unittest.TestCase):
    def test_gebuehren_mindern_das_ergebnis(self):
        s = serie([100] * 3 + [110] * 20)
        ohne = run(s, ImmerLong(), kosten=CostModel(0.0, 0.0))
        mit = run(s, ImmerLong(), kosten=CostModel(0.01, 0.0))
        self.assertLess(mit.metrics.endkapital, ohne.metrics.endkapital)
        self.assertGreater(mit.metrics.gebuehren, 0)

    def test_schlupf_verschlechtert_beide_seiten(self):
        s = serie([100] * 3 + [110] * 20)
        e = run(s, ImmerLong(), kosten=CostModel(0.0, 0.01))
        t = e.trades[0]
        self.assertGreater(t.einstieg, 100.0, "Kauf füllt über dem Richtkurs")


class TestRisikogrenzen(unittest.TestCase):
    def test_position_bleibt_unter_dem_deckel(self):
        s = serie([100] * 40)
        regeln = RiskRules(risiko_je_trade=0.05, max_positionsanteil=0.2, notstop_anteil=0.5)
        e = run(s, ImmerLong(), regeln=regeln, startkapital=10_000, kosten=CostModel(0, 0))
        self.assertTrue(e.trades)
        einsatz = e.trades[0].einstieg * e.trades[0].menge
        self.assertLessEqual(einsatz, 10_000 * 0.2 + 1e-6)

    def test_niemals_mehr_ausgeben_als_vorhanden(self):
        s = serie([100 + i for i in range(60)])
        e = run(s, ImmerLong(), startkapital=1_000)
        self.assertGreaterEqual(e.portfolio.bargeld, -1e-9, "Bargeld darf nie negativ werden")

    def test_alle_positionen_am_ende_geschlossen(self):
        s = serie([100 + i for i in range(60)])
        e = run(s, ImmerLong())
        self.assertEqual(e.portfolio.positionen, {})


class TestBilanz(unittest.TestCase):
    def test_endkapital_gleich_bargeld_nach_abschluss(self):
        s = serie([100 + (i % 7) for i in range(120)])
        e = run(s, ImmerLong())
        self.assertAlmostEqual(e.metrics.endkapital, e.portfolio.kapitalkurve[-1][1], places=6)

    def test_summe_der_trades_ergibt_die_veraenderung(self):
        s = serie([100 + (i % 11) for i in range(150)])
        e = run(s, ImmerLong(), startkapital=10_000)
        summe = sum(t.netto for t in e.trades)
        self.assertAlmostEqual(e.portfolio.bargeld - 10_000, summe, places=4,
                               msg="Handelsbuch und Kasse müssen übereinstimmen")


if __name__ == "__main__":
    unittest.main()
