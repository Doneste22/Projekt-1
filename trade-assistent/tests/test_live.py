"""Echter Handel — gegen eine nachgebaute Börse.

Ohne Zugangsdaten lässt sich keine echte Order aufgeben, und das soll auch so
bleiben. Prüfbar ist trotzdem fast alles: die Signatur gegen Krakens
veröffentlichten Testvektor, und das gesamte Verhalten gegen eine Börse, die
sich nach Wunsch danebenbenimmt — teilfüllt, gar nicht füllt, mitten in der
Order die Verbindung verliert.
"""

import tempfile
import unittest
from pathlib import Path

from assistant.exchange import (
    BoersenFehler, KrakenClient, NonceZaehler, PaarInfo, UnklarerAusgang,
)
from assistant.live import LiveBroker, OrderFehler, abgleichen
from assistant.portfolio import Portfolio, Position
from assistant.safety import Angehalten, Grenzen, Sicherung

# Krakens veröffentlichter Testvektor für die API-Signatur.
TEST_GEHEIMNIS = (
    "kQH5HW/8p1uGOVjbgWA7FunAmGO8lsSUXNsu3eow76sz84Q18fWxnyRzBHCd3pd5nE9qa99HAZtuZuj6F1huXg=="
)
TEST_DATEN = {
    "nonce": 1616492376594, "ordertype": "limit", "pair": "XBTUSD",
    "price": 37500, "type": "buy", "volume": 1.25,
}
TEST_SIGNATUR = (
    "4/dpxb3iT4tp/ZCVEwSnEsLxx0bqyhLpdfOpc6fn7OR8+UClSV5n9E6aSS8MPtnRfp32bAb0nmbRn6H8ndwLUQ=="
)

INFO = PaarInfo(
    name="XXBTZUSD", altname="XBTUSD", basis="XXBT", quote="ZUSD",
    mengen_stellen=8, preis_stellen=1, mindestmenge=0.00005, mindestwert=0.5,
)


class FalscheBoerse:
    """Kraken-Nachbau, der sich auf Kommando danebenbenimmt."""

    def __init__(self, kurs=100_000.0, guthaben=None):
        self._kurs = kurs
        self._guthaben = guthaben or {"XXBT": 0.0, "ZUSD": 1000.0}
        self.orders: dict[str, dict] = {}
        self.zaehler = 0
        self.fuellgrad = 1.0          # 1.0 = voll, 0.5 = halb, 0 = gar nicht
        self.wirft_bei_order = None   # Ausnahme, die AddOrder auslöst
        self.aufgegeben: list[dict] = []
        self.storniert: list[str] = []
        self.geprueft: list[dict] = []
        self.stops: list[str] = []

    def stop_ausloesen(self, txid, kurs=None):
        """So, als wäre der Stop gelaufen, während niemand zusah."""
        w = self.orders[txid]
        menge = w["vol"]
        kurs = kurs if kurs is not None else w["price"]
        w.update(status="closed", vol_exec=menge, cost=menge * kurs, fee=menge * kurs * 0.0026)
        self._guthaben["XXBT"] -= menge
        self._guthaben["ZUSD"] += menge * kurs
        return w

    def paar_info(self, paar):
        return INFO

    def letzter_kurs(self, paar):
        return self._kurs

    def guthaben(self):
        return dict(self._guthaben)

    def offene_orders(self, userref=None):
        return {
            t: w for t, w in self.orders.items()
            if w["status"] == "open" and (userref is None or w.get("userref") == userref)
        }

    def geschlossene_orders(self, userref=None, seit=None):
        return {
            t: w for t, w in self.orders.items()
            if w["status"] != "open" and (userref is None or w.get("userref") == userref)
        }

    def order_abfragen(self, txid):
        return self.orders.get(txid, {})

    def order_stornieren(self, txid):
        self.storniert.append(txid)
        if txid in self.orders and self.orders[txid]["status"] == "open":
            self.orders[txid]["status"] = "canceled"
        return {"count": 1}

    def order_aufgeben(self, paar, seite, menge, art="market", preis=None,
                       userref=None, nur_pruefen=True):
        if art == "stop-loss" and not nur_pruefen:
            # Eine Stop-Order bleibt liegen, bis der Kurs sie auslöst.
            self.zaehler += 1
            txid = f"STOP-{self.zaehler}"
            self.orders[txid] = {
                "status": "open", "userref": userref, "vol": menge, "vol_exec": 0.0,
                "cost": 0.0, "fee": 0.0, "price": preis, "descr": {"type": "sell"},
                "art": "stop-loss",
            }
            self.stops.append(txid)
            return {"txid": [txid]}
        if nur_pruefen:
            self.geprueft.append({"seite": seite, "menge": menge, "preis": preis})
            return {"descr": {"order": f"{seite} {menge} {paar} @ limit {preis}"}}
        if self.wirft_bei_order:
            fehler = self.wirft_bei_order
            self.wirft_bei_order = None
            # Die Order kommt an der Börse trotzdem an — genau das ist der Fall,
            # der eine Wiederholung gefährlich macht.
            self._eintragen(seite, menge, preis, userref)
            raise fehler
        txid = self._eintragen(seite, menge, preis, userref)
        self.aufgegeben.append({"seite": seite, "menge": menge, "preis": preis,
                                "userref": userref, "txid": txid})
        return {"txid": [txid]}

    def _eintragen(self, seite, menge, preis, userref):
        self.zaehler += 1
        txid = f"OTX-{self.zaehler}"
        gefuellt = menge * self.fuellgrad
        kosten = gefuellt * (preis or self._kurs)
        self.orders[txid] = {
            "status": "closed" if self.fuellgrad >= 1.0 else ("open" if self.fuellgrad else "open"),
            "userref": userref, "vol": menge, "vol_exec": gefuellt,
            "cost": kosten, "fee": kosten * 0.0026, "price": preis or self._kurs,
            "descr": {"type": seite},
        }
        if gefuellt:
            self._guthaben["XXBT"] = self._guthaben.get("XXBT", 0) + (
                gefuellt if seite == "buy" else -gefuellt
            )
            self._guthaben["ZUSD"] = self._guthaben.get("ZUSD", 0) + (
                -kosten if seite == "buy" else kosten
            )
        return txid


def broker_bauen(boerse, tmp, scharf=True, grenzen=None):
    sicherung = Sicherung(tmp, grenzen or Grenzen(
        max_orderwert=100_000, max_gesamteinsatz=200_000,
        max_tagesverlust=1e9, max_gesamtverlust=1e9,
    ))
    b = LiveBroker(boerse, "XBTUSD", sicherung, scharf=scharf,
                   wartezeit=2, abfrageabstand=0.0)
    b.kurs()
    return b


class TestSignatur(unittest.TestCase):
    def test_gegen_krakens_testvektor(self):
        """Ohne diesen Nachweis wäre jede Fehlersuche am echten Konto Raterei."""
        self.assertEqual(
            KrakenClient.signatur("/0/private/AddOrder", TEST_DATEN, TEST_GEHEIMNIS),
            TEST_SIGNATUR,
        )

    def test_andere_daten_ergeben_andere_signatur(self):
        daten = dict(TEST_DATEN, volume=2.5)
        self.assertNotEqual(
            KrakenClient.signatur("/0/private/AddOrder", daten, TEST_GEHEIMNIS),
            TEST_SIGNATUR,
        )


class TestNonce(unittest.TestCase):
    def test_streng_steigend(self):
        with tempfile.TemporaryDirectory() as t:
            z = NonceZaehler(Path(t) / "nonce")
            werte = [z.naechste() for _ in range(200)]
            self.assertEqual(werte, sorted(set(werte)), "Nonce muss streng steigen")

    def test_ueberlebt_den_neustart(self):
        with tempfile.TemporaryDirectory() as t:
            pfad = Path(t) / "nonce"
            letzte = NonceZaehler(pfad).naechste()
            self.assertGreater(NonceZaehler(pfad).naechste(), letzte)

    def test_zurueckgestellte_uhr_bricht_nichts(self):
        with tempfile.TemporaryDirectory() as t:
            pfad = Path(t) / "nonce"
            pfad.write_text(str(2**62))  # Zukunftswert, als wäre die Uhr gesprungen
            z = NonceZaehler(pfad)
            self.assertGreater(z.naechste(), 2**62)


class TestPaarRegeln(unittest.TestCase):
    def test_menge_wird_abgerundet(self):
        # Aufrunden könnte über das Guthaben gehen
        self.assertLessEqual(INFO.menge_runden(0.123456789), 0.123456789)

    def test_zu_kleine_menge_wird_abgelehnt(self):
        self.assertIn("Mindest", INFO.pruefe_order(0.00001, 100_000))

    def test_zu_kleiner_wert_wird_abgelehnt(self):
        winzig = PaarInfo("X", "X", "A", "B", 8, 2, 0.0, 10.0)
        self.assertIn("Mindestwert", winzig.pruefe_order(0.00006, 1.0))

    def test_gueltige_order_geht_durch(self):
        self.assertIsNone(INFO.pruefe_order(0.001, 100_000))


class TestOrderAusfuehrung(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.boerse = FalscheBoerse()

    def tearDown(self):
        self.tmp.cleanup()

    def test_vollstaendige_ausfuehrung(self):
        b = broker_bauen(self.boerse, self.tmp.name)
        aus = b.kaufen("XBTUSD", 0.001, 100_000)
        self.assertAlmostEqual(aus.menge, 0.001)
        self.assertFalse(aus.teilausfuehrung)
        self.assertTrue(aus.txid)
        self.assertGreater(aus.gebuehr, 0)

    def test_limit_liegt_ueber_dem_markt_beim_kauf(self):
        b = broker_bauen(self.boerse, self.tmp.name)
        b.kaufen("XBTUSD", 0.001, 100_000)
        preis = self.boerse.aufgegeben[0]["preis"]
        self.assertGreater(preis, 100_000, "Kauflimit muss über dem Markt liegen")
        self.assertLessEqual(preis, 100_000 * 1.006, "aber nicht beliebig weit")

    def test_limit_liegt_unter_dem_markt_beim_verkauf(self):
        b = broker_bauen(self.boerse, self.tmp.name)
        b.verkaufen("XBTUSD", 0.001, 100_000)
        self.assertLess(self.boerse.aufgegeben[0]["preis"], 100_000)

    def test_teilausfuehrung_wird_als_solche_gemeldet(self):
        self.boerse.fuellgrad = 0.5
        b = broker_bauen(self.boerse, self.tmp.name)
        aus = b.kaufen("XBTUSD", 0.001, 100_000)
        self.assertTrue(aus.teilausfuehrung)
        self.assertAlmostEqual(aus.menge, 0.0005)
        self.assertIn(aus.txid, self.boerse.storniert, "der Rest muss storniert werden")

    def test_ohne_ausfuehrung_bleibt_die_menge_null(self):
        self.boerse.fuellgrad = 0.0
        b = broker_bauen(self.boerse, self.tmp.name)
        aus = b.kaufen("XBTUSD", 0.001, 100_000)
        self.assertTrue(aus.leer)
        self.assertTrue(self.boerse.storniert)

    def test_zu_kleine_order_erreicht_die_boerse_gar_nicht(self):
        b = broker_bauen(self.boerse, self.tmp.name)
        with self.assertRaises(OrderFehler):
            b.kaufen("XBTUSD", 0.000001, 100_000)
        self.assertEqual(self.boerse.aufgegeben, [], "darf nicht abgeschickt werden")


class TestUnscharf(unittest.TestCase):
    def test_ohne_scharfschaltung_wird_nur_geprueft(self):
        with tempfile.TemporaryDirectory() as t:
            boerse = FalscheBoerse()
            b = broker_bauen(boerse, t, scharf=False)
            aus = b.kaufen("XBTUSD", 0.001, 100_000)
            self.assertEqual(boerse.aufgegeben, [], "keine echte Order ohne Scharfschaltung")
            self.assertEqual(len(boerse.geprueft), 1, "aber die Börse prüft sie")
            self.assertTrue(aus.leer)


class TestVerbindungsabbruch(unittest.TestCase):
    """Der gefährlichste Fall: Die Order ist weg, die Antwort nicht da."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.boerse = FalscheBoerse()

    def tearDown(self):
        self.tmp.cleanup()

    def test_verlorene_antwort_fuehrt_nicht_zur_zweiten_order(self):
        self.boerse.wirft_bei_order = UnklarerAusgang("Zeitüberschreitung")
        b = broker_bauen(self.boerse, self.tmp.name)
        aus = b.kaufen("XBTUSD", 0.001, 100_000)
        self.assertEqual(len(self.boerse.orders), 1,
                         "es darf genau eine Order existieren, nicht zwei")
        self.assertAlmostEqual(aus.menge, 0.001, msg="die vorhandene Order wird übernommen")

    def test_spurlose_order_haelt_den_betrieb_an(self):
        class SpurlosVerloren(FalscheBoerse):
            def order_aufgeben(self, *a, **kw):
                if not kw.get("nur_pruefen", True):
                    raise UnklarerAusgang("weg")
                return {}

        boerse = SpurlosVerloren()
        b = broker_bauen(boerse, self.tmp.name)
        with self.assertRaises(Angehalten):
            b.kaufen("XBTUSD", 0.001, 100_000)
        self.assertIsNotNone(b.sicherung.ausgeloest)


class TestAbgleich(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.tmp.cleanup()

    def test_uebereinstimmung_wird_bestaetigt(self):
        boerse = FalscheBoerse(guthaben={"XXBT": 0.0, "ZUSD": 1000.0})
        b = broker_bauen(boerse, self.tmp.name)
        befunde = abgleichen(b, Portfolio(startkapital=1000), "XBTUSD")
        self.assertTrue(any("stimmt überein" in z for z in befunde))

    def test_fremder_bestand_haelt_an(self):
        """Die Börse hält Münzen, von denen der eigene Zustand nichts weiss."""
        boerse = FalscheBoerse(guthaben={"XXBT": 0.5, "ZUSD": 1000.0})
        b = broker_bauen(boerse, self.tmp.name)
        with self.assertRaises(Angehalten):
            abgleichen(b, Portfolio(startkapital=1000), "XBTUSD")

    def test_verschwundener_bestand_haelt_an(self):
        boerse = FalscheBoerse(guthaben={"XXBT": 0.0, "ZUSD": 1000.0})
        b = broker_bauen(boerse, self.tmp.name)
        depot = Portfolio(startkapital=1000)
        depot.positionen["XBTUSD"] = Position("XBTUSD", 0.01, 100_000, 0)
        with self.assertRaises(Angehalten):
            abgleichen(b, depot, "XBTUSD")

    def test_eigene_absicherung_wird_nicht_wegstorniert(self):
        """Regression: Der Abgleich räumte einst *alle* offenen Orders weg —
        also auch die eigene Absicherung. Jeder Neustart hätte die Position
        schutzlos gemacht."""
        boerse = FalscheBoerse()
        b = broker_bauen(boerse, self.tmp.name)
        depot = Portfolio(startkapital=1000)
        pos = Position("XBTUSD", 0.001, 100_000, 0)
        depot.positionen["XBTUSD"] = pos
        boerse._guthaben["XXBT"] = 0.001
        pos.stop_txid = b.stop_platzieren("XBTUSD", 0.001, 95_000)

        abgleichen(b, depot, "XBTUSD")
        self.assertNotIn(pos.stop_txid, boerse.storniert)
        self.assertEqual(boerse.orders[pos.stop_txid]["status"], "open")

    def test_ausgeloester_stop_erklaert_den_fehlbestand(self):
        """Ein Bestand, den die eigene Absicherung verkauft hat, ist kein Alarm."""
        boerse = FalscheBoerse()
        b = broker_bauen(boerse, self.tmp.name)
        depot = Portfolio(startkapital=1000)
        pos = Position("XBTUSD", 0.001, 100_000, 0)
        depot.positionen["XBTUSD"] = pos
        boerse._guthaben["XXBT"] = 0.001
        pos.stop_txid = b.stop_platzieren("XBTUSD", 0.001, 95_000)
        boerse.stop_ausloesen(pos.stop_txid, 95_000)  # Börse verkauft, niemand sieht zu

        befunde = abgleichen(b, depot, "XBTUSD")
        self.assertTrue(any("wird gleich verbucht" in z for z in befunde))

    def test_position_ohne_absicherung_wird_gemeldet(self):
        boerse = FalscheBoerse(guthaben={"XXBT": 0.001, "ZUSD": 1000.0})
        b = broker_bauen(boerse, self.tmp.name)
        depot = Portfolio(startkapital=1000)
        depot.positionen["XBTUSD"] = Position("XBTUSD", 0.001, 100_000, 0)
        befunde = abgleichen(b, depot, "XBTUSD")
        self.assertTrue(any("ohne Absicherung" in z for z in befunde))

    def test_haengende_orders_werden_storniert(self):
        boerse = FalscheBoerse()
        boerse.orders["ALT-1"] = {"status": "open", "userref": 1, "vol": 1,
                                  "vol_exec": 0, "cost": 0, "fee": 0, "price": 0}
        b = broker_bauen(boerse, self.tmp.name)
        befunde = abgleichen(b, Portfolio(startkapital=1000), "XBTUSD")
        self.assertIn("ALT-1", boerse.storniert)
        self.assertTrue(any("storniert" in z for z in befunde))


if __name__ == "__main__":
    unittest.main()


class TestAbsicherungAnDerBoerse(unittest.TestCase):
    """Ein Stop im Arbeitsspeicher schützt nur, solange der Prozess lebt."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.boerse = FalscheBoerse()

    def tearDown(self):
        self.tmp.cleanup()

    def test_stop_wird_bei_der_boerse_hinterlegt(self):
        b = broker_bauen(self.boerse, self.tmp.name)
        txid = b.stop_platzieren("XBTUSD", 0.001, 95_000)
        self.assertTrue(txid)
        self.assertEqual(self.boerse.orders[txid]["status"], "open")
        self.assertEqual(self.boerse.orders[txid]["art"], "stop-loss")
        self.assertEqual(self.boerse.orders[txid]["price"], 95_000)

    def test_stop_bleibt_offen_bis_er_auslöst(self):
        b = broker_bauen(self.boerse, self.tmp.name)
        txid = b.stop_platzieren("XBTUSD", 0.001, 95_000)
        self.assertEqual(b.stop_status(txid)[0], "open")
        self.boerse.stop_ausloesen(txid, 94_900)
        zustand, gefuellt, kosten, gebuehr = b.stop_status(txid)
        self.assertEqual(zustand, "closed")
        self.assertAlmostEqual(gefuellt, 0.001)
        self.assertGreater(gebuehr, 0)

    def test_stop_laesst_sich_zuruecknehmen(self):
        b = broker_bauen(self.boerse, self.tmp.name)
        txid = b.stop_platzieren("XBTUSD", 0.001, 95_000)
        self.assertTrue(b.stop_aufheben(txid))
        self.assertIn(txid, self.boerse.storniert)

    def test_unplatzierbare_absicherung_haelt_an(self):
        """Ohne Stop weiterlaufen wäre der schlechtere Fehler."""
        b = broker_bauen(self.boerse, self.tmp.name)
        with self.assertRaises(Angehalten):
            b.stop_platzieren("XBTUSD", 0.0000001, 95_000)

    def test_ohne_scharfschaltung_kein_stop(self):
        b = broker_bauen(self.boerse, self.tmp.name, scharf=False)
        self.assertEqual(b.stop_platzieren("XBTUSD", 0.001, 95_000), "")
