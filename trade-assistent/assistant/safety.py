"""Schutzschaltungen für den unbeaufsichtigten Betrieb.

Eine Strategie, die Geld verliert, kostet Geld. Ein Fehler in der Mechanik
kostet das Konto. Diese Datei kümmert sich um den zweiten Fall.

Leitgedanke: **Im Zweifel anhalten.** Jede Unklarheit — unerwartetes Guthaben,
veraltete Kurse, wiederholte Fehler — führt zum Stillstand, nicht zum Weiter­
machen. Ein Assistent, der nichts tut, verliert im schlimmsten Fall eine
Gelegenheit. Einer, der bei unklarer Lage weiterhandelt, verliert das Konto.

Ein ausgelöster Auslöser bleibt über Neustarts hinweg ausgelöst und muss von
Hand zurückgesetzt werden. Wer das automatisch zurücksetzt, hat keine
Sicherung, sondern eine Verzögerung.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

NOTBREMSE_DATEI = "NOTBREMSE"


class Angehalten(RuntimeError):
    """Der Betrieb wurde angehalten. Kein Handel, bis ein Mensch entscheidet."""


@dataclass(slots=True)
class Grenzen:
    """Absolute Obergrenzen in Preiswährung.

    Prozentangaben allein genügen nicht: Ein Vorzeichenfehler oder ein falsch
    gelesenes Guthaben skaliert Prozente mit. Eine Zahl in Euro tut das nicht.
    """

    max_orderwert: float = 100.0        # was eine einzelne Order höchstens kosten darf
    max_gesamteinsatz: float = 500.0    # was insgesamt im Markt stehen darf
    max_tagesverlust: float = 50.0      # absoluter Tagesverlust bis zum Stopp
    max_gesamtverlust: float = 150.0    # absoluter Gesamtverlust bis zum Stopp
    max_orders_pro_tag: int = 10        # Bremse gegen Endlosschleifen
    max_kursalter: int = 120            # Sekunden; ältere Kurse gelten als tot
    max_fehler_in_folge: int = 5
    guthaben_abweichung: float = 0.02   # 2 % unerklärte Abweichung → Stopp

    def pruefe(self) -> None:
        if self.max_orderwert <= 0 or self.max_gesamteinsatz <= 0:
            raise ValueError("Orderwert und Gesamteinsatz müssen positiv sein")
        if self.max_orderwert > self.max_gesamteinsatz:
            raise ValueError("Eine einzelne Order darf nicht mehr als der Gesamteinsatz sein")
        if self.max_kursalter < 10:
            raise ValueError("max_kursalter unter 10 Sekunden ist nicht realistisch")

    def als_dict(self) -> dict:
        return {f: getattr(self, f) for f in self.__slots__}


@dataclass(slots=True)
class Auslösung:
    grund: str
    zeit: str
    einzelheiten: dict = field(default_factory=dict)

    def __str__(self) -> str:
        return f"[{self.zeit}] {self.grund}"


class Sicherung:
    """Auslöser, Zähler und Notbremse — der Wächter über allem.

    Zustand liegt auf Platte. Ein Neustart hebt eine Auslösung nicht auf.
    """

    def __init__(self, verzeichnis: str | Path, grenzen: Grenzen | None = None):
        self.verzeichnis = Path(verzeichnis)
        self.verzeichnis.mkdir(parents=True, exist_ok=True)
        self.grenzen = grenzen or Grenzen()
        self.grenzen.pruefe()
        self.datei = self.verzeichnis / "sicherung.json"
        self.notbremse = self.verzeichnis / NOTBREMSE_DATEI

        self.ausgeloest: Auslösung | None = None
        self.fehler_in_folge = 0
        self.orders_heute = 0
        self.tag = ""
        self.tagesstart_kapital: float | None = None
        self._laden()

    # -- Zustand ------------------------------------------------------------
    def _laden(self) -> None:
        if not self.datei.exists():
            return
        try:
            d = json.loads(self.datei.read_text())
        except json.JSONDecodeError:
            return
        if d.get("ausgeloest"):
            self.ausgeloest = Auslösung(**d["ausgeloest"])
        self.fehler_in_folge = d.get("fehler_in_folge", 0)
        self.orders_heute = d.get("orders_heute", 0)
        self.tag = d.get("tag", "")
        self.tagesstart_kapital = d.get("tagesstart_kapital")

    def sichern(self) -> None:
        d = {
            "ausgeloest": (
                {"grund": self.ausgeloest.grund, "zeit": self.ausgeloest.zeit,
                 "einzelheiten": self.ausgeloest.einzelheiten}
                if self.ausgeloest else None
            ),
            "fehler_in_folge": self.fehler_in_folge,
            "orders_heute": self.orders_heute,
            "tag": self.tag,
            "tagesstart_kapital": self.tagesstart_kapital,
            "grenzen": self.grenzen.als_dict(),
        }
        temp = self.datei.with_suffix(".tmp")
        temp.write_text(json.dumps(d, indent=2, ensure_ascii=False))
        os.replace(temp, self.datei)

    # -- Auslösen und zurücksetzen -----------------------------------------
    def ausloesen(self, grund: str, **einzelheiten) -> Angehalten:
        if self.ausgeloest is None:
            self.ausgeloest = Auslösung(
                grund=grund,
                zeit=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
                einzelheiten=einzelheiten,
            )
            self.sichern()
        return Angehalten(str(self.ausgeloest))

    def zuruecksetzen(self) -> str | None:
        """Nur von Hand. Gibt zurück, was zurückgesetzt wurde."""
        vorher = str(self.ausgeloest) if self.ausgeloest else None
        self.ausgeloest = None
        self.fehler_in_folge = 0
        self.sichern()
        return vorher

    def notbremse_ziehen(self, schliessen: bool = False) -> None:
        self.notbremse.write_text("SCHLIESSEN" if schliessen else "STOPP")

    def notbremse_loesen(self) -> None:
        self.notbremse.unlink(missing_ok=True)

    @property
    def notbremse_gezogen(self) -> bool:
        return self.notbremse.exists()

    @property
    def notbremse_will_schliessen(self) -> bool:
        return (
            self.notbremse.exists()
            and "SCHLIESSEN" in self.notbremse.read_text().upper()
        )

    # -- Prüfungen ----------------------------------------------------------
    def tageswechsel(self, kapital: float) -> None:
        heute = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if heute != self.tag:
            self.tag = heute
            self.orders_heute = 0
            self.tagesstart_kapital = kapital
            self.sichern()

    def fehler_vermerken(self, text: str) -> None:
        self.fehler_in_folge += 1
        if self.fehler_in_folge >= self.grenzen.max_fehler_in_folge:
            self.ausloesen(
                f"{self.fehler_in_folge} Fehler in Folge — letzter: {text}",
                fehler=text,
            )
        self.sichern()

    def erfolg_vermerken(self) -> None:
        if self.fehler_in_folge:
            self.fehler_in_folge = 0
            self.sichern()

    def darf_handeln(
        self,
        kapital: float,
        startkapital: float,
        kurs_alter: float,
        einsatz_im_markt: float,
    ) -> tuple[bool, str]:
        """Die eine Frage, die vor jeder Order steht."""
        if self.ausgeloest:
            return False, f"Sicherung ausgelöst: {self.ausgeloest}"
        if self.notbremse_gezogen:
            return False, f"Notbremse gezogen ({self.notbremse})"
        g = self.grenzen

        if kurs_alter > g.max_kursalter:
            raise self.ausloesen(
                f"Kursdaten sind {kurs_alter:.0f} s alt (Grenze {g.max_kursalter} s)",
                kurs_alter=kurs_alter,
            )
        if self.orders_heute >= g.max_orders_pro_tag:
            return False, f"Tagesgrenze von {g.max_orders_pro_tag} Orders erreicht"
        gesamtverlust = startkapital - kapital
        if gesamtverlust >= g.max_gesamtverlust:
            raise self.ausloesen(
                f"Gesamtverlust {gesamtverlust:.2f} erreicht die Grenze {g.max_gesamtverlust:.2f}",
                verlust=gesamtverlust,
            )
        if self.tagesstart_kapital is not None:
            tagesverlust = self.tagesstart_kapital - kapital
            if tagesverlust >= g.max_tagesverlust:
                return False, (
                    f"Tagesverlust {tagesverlust:.2f} erreicht die Grenze "
                    f"{g.max_tagesverlust:.2f} — morgen wieder"
                )
        if einsatz_im_markt >= g.max_gesamteinsatz:
            return False, (
                f"Einsatz im Markt {einsatz_im_markt:.2f} erreicht die Grenze "
                f"{g.max_gesamteinsatz:.2f}"
            )
        return True, "alle Schutzschaltungen frei"

    def orderwert_begrenzen(self, wert: float, einsatz_im_markt: float) -> float:
        """Kürzt einen Orderwert auf das Erlaubte. Gibt 0 zurück, wenn nichts geht."""
        g = self.grenzen
        erlaubt = min(g.max_orderwert, g.max_gesamteinsatz - einsatz_im_markt)
        return max(0.0, min(wert, erlaubt))

    def order_vermerken(self) -> None:
        self.orders_heute += 1
        self.sichern()

    def guthaben_pruefen(self, erwartet: float, tatsaechlich: float, waehrung: str) -> None:
        """Weicht das Konto unerklärt ab, hält der Betrieb an.

        Mögliche Ursachen: ein zweiter Prozess handelt dasselbe Konto, jemand
        hat von Hand gehandelt, oder der eigene Zustand ist falsch. Alle drei
        sind Gründe, sofort aufzuhören.
        """
        if erwartet <= 0:
            return
        abweichung = abs(tatsaechlich - erwartet) / erwartet
        if abweichung > self.grenzen.guthaben_abweichung:
            raise self.ausloesen(
                f"Guthaben {waehrung} weicht um {abweichung:.1%} ab "
                f"(erwartet {erwartet:.8f}, tatsächlich {tatsaechlich:.8f})",
                erwartet=erwartet, tatsaechlich=tatsaechlich, waehrung=waehrung,
            )

    def bericht(self) -> str:
        z = ["  Schutzschaltungen"]
        z.append(f"    Auslösung ....... {self.ausgeloest or 'frei'}")
        z.append(f"    Notbremse ....... {'GEZOGEN' if self.notbremse_gezogen else 'gelöst'}")
        z.append(f"    Fehler in Folge . {self.fehler_in_folge}/{self.grenzen.max_fehler_in_folge}")
        z.append(f"    Orders heute .... {self.orders_heute}/{self.grenzen.max_orders_pro_tag}")
        g = self.grenzen
        z.append(f"    Grenzen ......... Order ≤ {g.max_orderwert:.2f}, "
                 f"Einsatz ≤ {g.max_gesamteinsatz:.2f}")
        z.append(f"                      Tagesverlust ≤ {g.max_tagesverlust:.2f}, "
                 f"gesamt ≤ {g.max_gesamtverlust:.2f}")
        return "\n".join(z)
