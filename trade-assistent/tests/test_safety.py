"""Schutzschaltungen und scharfer Betrieb.

Die Leitfrage jedes Tests hier: Was passiert, wenn niemand hinsieht und
etwas schiefgeht?
"""

import tempfile
import unittest
from pathlib import Path

from assistant.candles import Candle, Series
from assistant.execution import CostModel
from assistant.risk import RiskRules
from assistant.runner import Runner
from assistant.safety import Angehalten, Grenzen, Sicherung
from assistant import runner as lauf
from assistant import sources
from tests.test_live import FalscheBoerse, broker_bauen
from tests.test_runner import ImmerKaufen

TAG = 86400


class TestGrenzen(unittest.TestCase):
    def test_widersprüchliche_grenzen_werden_abgelehnt(self):
        with self.assertRaises(ValueError):
            Grenzen(max_orderwert=1000, max_gesamteinsatz=100).pruefe()

    def test_unrealistisches_kursalter_wird_abgelehnt(self):
        with self.assertRaises(ValueError):
            Grenzen(max_kursalter=2).pruefe()


class SicherungProbe(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.s = Sicherung(self.tmp.name, Grenzen(
            max_orderwert=100, max_gesamteinsatz=500,
            max_tagesverlust=50, max_gesamtverlust=150,
            max_orders_pro_tag=3, max_fehler_in_folge=3,
        ))

    def tearDown(self):
        self.tmp.cleanup()


class TestDeckelung(SicherungProbe):
    def test_einzelorder_wird_gedeckelt(self):
        self.assertEqual(self.s.orderwert_begrenzen(9999, 0), 100)

    def test_gesamteinsatz_wird_beruecksichtigt(self):
        self.assertEqual(self.s.orderwert_begrenzen(9999, 450), 50)

    def test_bei_vollem_einsatz_geht_nichts_mehr(self):
        self.assertEqual(self.s.orderwert_begrenzen(9999, 500), 0)


class TestVerlustgrenzen(SicherungProbe):
    def test_tagesverlust_stoppt_ohne_ausloesung(self):
        self.s.tageswechsel(1000)
        frei, grund = self.s.darf_handeln(940, 1000, 5, 0)
        self.assertFalse(frei)
        self.assertIn("Tagesverlust", grund)
        self.assertIsNone(self.s.ausgeloest, "Tagesgrenze ist eine Pause, kein Notaus")

    def test_gesamtverlust_loest_aus(self):
        with self.assertRaises(Angehalten):
            self.s.darf_handeln(800, 1000, 5, 0)
        self.assertIsNotNone(self.s.ausgeloest)

    def test_ordergrenze_pro_tag(self):
        self.s.tageswechsel(1000)
        for _ in range(3):
            self.s.order_vermerken()
        frei, grund = self.s.darf_handeln(1000, 1000, 5, 0)
        self.assertFalse(frei)
        self.assertIn("Tagesgrenze", grund)


class TestFehlerkette(SicherungProbe):
    def test_wiederholte_fehler_loesen_aus(self):
        self.s.fehler_vermerken("Netz weg")
        self.s.fehler_vermerken("Netz weg")
        self.assertIsNone(self.s.ausgeloest)
        self.s.fehler_vermerken("Netz weg")
        self.assertIsNotNone(self.s.ausgeloest, "drei Fehler in Folge müssen anhalten")

    def test_erfolg_setzt_den_zaehler_zurueck(self):
        self.s.fehler_vermerken("einmal")
        self.s.fehler_vermerken("zweimal")
        self.s.erfolg_vermerken()
        self.s.fehler_vermerken("wieder eins")
        self.assertIsNone(self.s.ausgeloest)


class TestGuthabenAbweichung(SicherungProbe):
    def test_grosse_abweichung_loest_aus(self):
        with self.assertRaises(Angehalten):
            self.s.guthaben_pruefen(1.0, 1.5, "XXBT")

    def test_kleine_abweichung_ist_in_ordnung(self):
        self.s.guthaben_pruefen(1.0, 1.005, "XXBT")
        self.assertIsNone(self.s.ausgeloest)


class TestDauerhaftigkeit(SicherungProbe):
    def test_ausloesung_ueberlebt_neustart(self):
        self.s.ausloesen("Testgrund")
        neu = Sicherung(self.tmp.name)
        self.assertIsNotNone(neu.ausgeloest)
        self.assertIn("Testgrund", str(neu.ausgeloest))

    def test_nur_von_hand_zuruecksetzbar(self):
        self.s.ausloesen("Testgrund")
        frei, grund = self.s.darf_handeln(1000, 1000, 5, 0)
        self.assertFalse(frei)
        self.s.zuruecksetzen()
        frei, _ = self.s.darf_handeln(1000, 1000, 5, 0)
        self.assertTrue(frei)

    def test_erste_ausloesung_bleibt_stehen(self):
        """Der erste Grund ist der interessante, nicht der letzte."""
        self.s.ausloesen("erster Grund")
        self.s.ausloesen("zweiter Grund")
        self.assertIn("erster", str(self.s.ausgeloest))


class ScharferRunner(unittest.TestCase):
    """Runner mit scharfem Broker gegen die nachgebaute Börse."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.boerse = FalscheBoerse(kurs=100_000.0, guthaben={"XXBT": 0.0, "ZUSD": 5000.0})
        self.echte_load = sources.load
        lauf.sources.load = self._load

    def tearDown(self):
        lauf.sources.load = self.echte_load
        self.tmp.cleanup()

    def _load(self, symbol, step, **kw):
        return Series(symbol, step, [
            Candle(i * TAG, 100_000.0, 101_000.0, 99_000.0, 100_000.0, 10.0)
            for i in range(60)
        ])

    def _runner(self, grenzen=None, **kw):
        sicherung = Sicherung(self.tmp.name, grenzen or Grenzen(
            max_orderwert=200, max_gesamteinsatz=400,
            max_tagesverlust=1e9, max_gesamtverlust=1e9,
        ))
        broker = lauf_broker(self.boerse, sicherung)
        return Runner(
            "XBTUSD", TAG, ImmerKaufen(),
            regeln=RiskRules(min_staerke=0.3, abkuehlung_kerzen=0, max_positionsanteil=1.0),
            kosten=CostModel(0.0026, 0.0), arbeitsverzeichnis=self.tmp.name,
            startkapital=5000.0, broker=broker, sicherung=sicherung, **kw,
        )

    def test_orderwert_wird_auf_die_schutzgrenze_gedeckelt(self):
        r = self._runner()
        d = r.tick()
        self.assertEqual(d.handlung, "gekauft")
        pos = r.depot.positionen["XBTUSD"]
        self.assertLessEqual(pos.menge * pos.einstieg, 200 * 1.01,
                             "die absolute Ordergrenze muss greifen")

    def test_teilausfuehrung_wird_korrekt_verbucht(self):
        self.boerse.fuellgrad = 0.5
        r = self._runner()
        d = r.tick()
        self.assertEqual(d.handlung, "gekauft")
        self.assertTrue(d.teilausfuehrung)
        gefuellt = self.boerse.aufgegeben[0]["menge"] * 0.5
        self.assertAlmostEqual(r.depot.positionen["XBTUSD"].menge, gefuellt, places=8)

    def test_notbremse_haelt_an(self):
        r = self._runner()
        r.sicherung.notbremse_ziehen()
        d = r.tick()
        self.assertEqual(d.handlung, "angehalten")
        self.assertEqual(self.boerse.aufgegeben, [], "keine Order bei gezogener Notbremse")

    def test_notbremse_mit_schliessen_loest_die_position_auf(self):
        r = self._runner()
        r.tick()
        self.assertIn("XBTUSD", r.depot.positionen)
        r.sicherung.notbremse_ziehen(schliessen=True)
        d = r.tick()
        self.assertEqual(d.handlung, "verkauft")
        self.assertEqual(r.depot.positionen, {})

    def test_ausgeloeste_sicherung_verhindert_jeden_kauf(self):
        r = self._runner()
        r.sicherung.ausloesen("Testgrund")
        d = r.tick()
        self.assertEqual(self.boerse.aufgegeben, [])
        self.assertIn("Schutzschaltung", d.grund)

    def test_abgleich_laeuft_vor_der_ersten_order(self):
        r = self._runner()
        r.tick()
        self.assertTrue(r._abgeglichen)

    def test_fremdbestand_haelt_vor_der_ersten_order_an(self):
        self.boerse._guthaben["XXBT"] = 3.0  # jemand anders hat gehandelt
        r = self._runner()
        d = r.tick()
        self.assertTrue(d.angehalten)
        self.assertEqual(self.boerse.aufgegeben, [])


def lauf_broker(boerse, sicherung):
    from assistant.live import LiveBroker

    b = LiveBroker(boerse, "XBTUSD", sicherung, scharf=True,
                   wartezeit=2, abfrageabstand=0.0)
    b.kurs()
    return b


if __name__ == "__main__":
    unittest.main()


class TestAbsicherungImBetrieb(ScharferRunner):
    """Die Absicherung muss den eigenen Prozess überleben."""

    def test_nach_dem_kauf_liegt_der_stop_an_der_boerse(self):
        r = self._runner()
        r.tick()
        pos = r.depot.positionen["XBTUSD"]
        self.assertTrue(pos.geschuetzt, "Position ohne Börsen-Stop ist ungeschützt")
        self.assertIn(pos.stop_txid, self.boerse.stops)
        self.assertEqual(self.boerse.orders[pos.stop_txid]["status"], "open")

    def test_stop_greift_auch_wenn_der_prozess_weg_war(self):
        r = self._runner()
        r.tick()
        pos = r.depot.positionen["XBTUSD"]
        txid, menge = pos.stop_txid, pos.menge

        # Der Assistent ist aus. Die Börse stoppt die Position aus.
        self.boerse.stop_ausloesen(txid, 95_000)

        # Neuer Prozess, gleiches Verzeichnis — der Trade muss nachgetragen werden.
        neu = self._runner()
        d = neu.tick()
        self.assertEqual(d.handlung, "verkauft")
        self.assertIn("Börse", d.grund)
        self.assertEqual(neu.depot.positionen, {})
        self.assertTrue(neu.depot.trades)
        self.assertAlmostEqual(neu.depot.trades[-1].menge, menge, places=8)

    def test_entfernte_absicherung_haelt_an(self):
        """Wer die Absicherung wegnimmt, ohne dass sie ausgelöst hat, ist ein Alarm."""
        r = self._runner()
        r.tick()
        txid = r.depot.positionen["XBTUSD"].stop_txid
        self.boerse.orders[txid]["status"] = "canceled"  # von Hand entfernt
        d = r.tick()
        self.assertTrue(d.angehalten)
        self.assertIn("ungeschützt", str(r.sicherung.ausgeloest))

    def test_eigener_verkauf_nimmt_die_absicherung_zuerst_zurueck(self):
        r = self._runner()
        r.tick()
        txid = r.depot.positionen["XBTUSD"].stop_txid
        r.sicherung.notbremse_ziehen(schliessen=True)
        d = r.tick()
        self.assertEqual(d.handlung, "verkauft")
        self.assertIn(txid, self.boerse.storniert,
                      "ohne Rücknahme hält der Stop die Menge fest")

    def test_blockierte_ruecknahme_verhindert_den_verkauf(self):
        """Lieber abgesichert offen bleiben als ungeschützt hängen."""
        r = self._runner()
        r.tick()

        def verweigern(txid):
            return False

        r.broker.stop_aufheben = verweigern
        r.sicherung.notbremse_ziehen(schliessen=True)
        d = r.tick()
        self.assertEqual(d.handlung, "halten")
        self.assertIn("XBTUSD", r.depot.positionen)
        self.assertEqual(self.boerse.aufgegeben[-1]["seite"], "buy",
                         "es darf kein Verkauf abgeschickt worden sein")


class TestSchluesselAblegen(unittest.TestCase):
    """Der Schlüssel muss sicher landen, ohne dass das Secret je sichtbar wird."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.tmp.cleanup()

    def _ausfuehren(self, key, secret, eingaben=()):
        """Ruft den Befehl mit vorgegebenen Eingaben auf, ohne Terminal."""
        import builtins
        import getpass
        import io
        import sys

        from assistant.__main__ import main

        antworten = list(eingaben) + [key]
        echt_input, echt_getpass = builtins.input, getpass.getpass
        builtins.input = lambda p="": antworten.pop(0)
        getpass.getpass = lambda p="": secret
        ausgabe = io.StringIO()
        echt_stdout = sys.stdout
        sys.stdout = ausgabe
        try:
            code = main(["--betrieb", self.tmp.name, "schluessel"])
        finally:
            builtins.input, getpass.getpass = echt_input, echt_getpass
            sys.stdout = echt_stdout
        return code, ausgabe.getvalue()

    def test_datei_ist_nur_fuer_den_besitzer_lesbar(self):
        self._ausfuehren("K" * 56, "c2VjcmV0" * 11)
        datei = Path(self.tmp.name) / "kraken.key"
        self.assertTrue(datei.exists())
        self.assertEqual(datei.stat().st_mode & 0o777, 0o600)

    def test_secret_taucht_nirgends_in_der_ausgabe_auf(self):
        """Wer Bildschirmfotos verschickt, darf sein Secret nicht darauf haben."""
        import base64

        secret = base64.b64encode(b"GEHEIM" * 11).decode()
        _, ausgabe = self._ausfuehren("K" * 56, secret)
        self.assertNotIn(secret, ausgabe)
        self.assertNotIn(secret[8:40], ausgabe, "auch kein längeres Bruchstück")

    def test_zwei_zeilen_key_dann_secret(self):
        import base64

        key, secret = "M" * 56, base64.b64encode(b"z" * 64).decode()
        self._ausfuehren(key, secret)
        zeilen = (Path(self.tmp.name) / "kraken.key").read_text().splitlines()
        self.assertEqual(zeilen[0], key)
        self.assertEqual(zeilen[1], secret)

    def test_abgeschnittenes_secret_wird_erkannt(self):
        """Der häufigste Einrichtungsfehler: nur ein Bruchstück kopiert."""
        code, ausgabe = self._ausfuehren("O" * 56, "L75auP/RugcOkyeH5oxKmq8x6n")
        self.assertEqual(code, 1)
        self.assertIn("zu kurz", ausgabe)
        self.assertIn("nur ein Teil kopiert", ausgabe)
        self.assertFalse((Path(self.tmp.name) / "kraken.key").exists(),
                         "halbe Zugangsdaten dürfen nicht geschrieben werden")

    def test_kaputtes_base64_wird_erkannt(self):
        code, ausgabe = self._ausfuehren("K" * 56, "!" * 88)
        self.assertEqual(code, 1)
        self.assertIn("entschlüsseln", ausgabe)

    def test_leerzeichen_mittendrin_wird_erkannt(self):
        """Ein Leerzeichen im Schlüssel heisst: die Kopie ist zerrissen."""
        code, ausgabe = self._ausfuehren("K" * 56, "c2VjcmV0" * 5 + " " + "c2VjcmV0" * 6)
        self.assertEqual(code, 1)
        self.assertIn("Leerzeichen", ausgabe)

    def test_leerzeichen_am_rand_stoert_nicht(self):
        """Beim Einfügen hängt oft eines dran — das ist kein Fehler."""
        import base64

        geheimnis = base64.b64encode(b"q" * 64).decode()
        code, _ = self._ausfuehren("K" * 56, "  " + geheimnis + "  ")
        self.assertIn(code, (0, 2), "getrimmt und durchgelassen, nicht abgelehnt")
        self.assertEqual(
            (Path(self.tmp.name) / "kraken.key").read_text().splitlines()[1], geheimnis
        )

    def test_gueltige_form_wird_geschrieben(self):
        import base64

        geheimnis = base64.b64encode(b"x" * 64).decode()
        code, _ = self._ausfuehren("K" * 56, geheimnis)
        self.assertIn(code, (0, 2), "Form ist gültig; scheitern darf nur die Börse")
        self.assertTrue((Path(self.tmp.name) / "kraken.key").exists())

    def test_vertauschte_eingabe_wird_bemerkt(self):
        """Key länger als Secret heisst fast immer: vertauscht."""
        import base64

        kurzes_secret = base64.b64encode(b"y" * 60).decode()
        _, ausgabe = self._ausfuehren("X" * 100, kurzes_secret)
        self.assertIn("Achtung", ausgabe)

    def test_leere_eingabe_legt_nichts_an(self):
        code, _ = self._ausfuehren("", "egal", eingaben=("", ""))
        self.assertEqual(code, 1)
        self.assertFalse((Path(self.tmp.name) / "kraken.key").exists())

    def test_versehentliches_enter_wirft_nicht_gleich_raus(self):
        """Wer hier rausfliegt, fügt seine Zugangsdaten danach womöglich an
        der normalen Eingabeaufforderung ein — und damit in den Verlauf."""
        code, ausgabe = self._ausfuehren("E" * 56, "c2VjcmV0" * 11, eingaben=("",))
        self.assertIn("Nichts angekommen", ausgabe)
        self.assertTrue((Path(self.tmp.name) / "kraken.key").exists())

    def test_abbruch_warnt_vor_der_falschen_stelle(self):
        _, ausgabe = self._ausfuehren("", "egal", eingaben=("", ""))
        self.assertIn("NICHT an der normalen", ausgabe)


class TestBoersenDiagnose(unittest.TestCase):
    """Rohe Börsenmeldungen sind für niemanden verwertbar."""

    def _diagnose(self, meldung):
        import io
        import sys

        from assistant import __main__ as cli
        from assistant.exchange import BoersenFehler

        class Stubs:
            def systemstatus(self):
                return "online"

            def guthaben(self):
                return {"ZUSD": 100.0}

            def offene_orders(self, userref=None):
                return {}

            def paar_info(self, paar):
                from tests.test_live import INFO

                return INFO

            def letzter_kurs(self, paar):
                return 100_000.0

            def privat(self, methode, **kw):
                raise BoersenFehler("EGeneral:Permission denied")

            def order_aufgeben(self, *a, **kw):
                raise BoersenFehler(meldung)

        echt = cli._client
        cli._client = lambda a: Stubs()
        ausgabe, echt_stdout = io.StringIO(), sys.stdout
        sys.stdout = ausgabe
        try:
            with tempfile.TemporaryDirectory() as t:
                (Path(t) / "kraken.key").write_text("k\ns\n")
                (Path(t) / "kraken.key").chmod(0o600)
                cli.main(["--betrieb", t, "einrichten"])
        except SystemExit:
            pass
        finally:
            cli._client = echt
            sys.stdout = echt_stdout
        return ausgabe.getvalue()

    def test_gesperrtes_konto_wird_erklaert(self):
        ausgabe = self._diagnose("ETrade:User Locked")
        self.assertIn("nicht zum Handeln freigeschaltet", ausgabe)
        self.assertIn("Identitätsprüfung", ausgabe)
        self.assertNotIn("Guthaben reicht", ausgabe, "das ist hier gerade nicht der Grund")

    def test_fehlendes_recht_wird_erklaert(self):
        ausgabe = self._diagnose("EGeneral:Permission denied")
        self.assertIn("Create & Modify Orders", ausgabe)

    def test_zu_wenig_guthaben_wird_erklaert(self):
        ausgabe = self._diagnose("EOrder:Insufficient funds")
        self.assertIn("Guthaben reicht", ausgabe)
