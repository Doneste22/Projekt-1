"""Benachrichtigung — weil unbeaufsichtigt nicht unbemerkt heissen darf.

Das Journal auf Platte ist die vollständige Aufzeichnung. Es hilft nur nichts,
wenn niemand hineinsieht. Deshalb zusätzlich ein Weckruf für die Ereignisse,
bei denen jemand hinsehen sollte: gekauft, verkauft, Sicherung ausgelöst.

Der Webhook ist absichtlich schlicht gehalten; er passt auf ntfy.sh, Discord,
Slack und Telegram, weil alle vier eine POST-Anfrage mit JSON entgegennehmen.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Protocol


class Melder(Protocol):
    def melden(self, betreff: str, text: str, dringend: bool = False) -> None: ...


class StillerMelder:
    """Tut nichts. Vorgabe, solange nichts eingerichtet ist."""

    def melden(self, betreff: str, text: str, dringend: bool = False) -> None:
        return None


class KonsolenMelder:
    def melden(self, betreff: str, text: str, dringend: bool = False) -> None:
        marke = "!!" if dringend else "--"
        print(f"  {marke} {betreff}: {text}", flush=True)


class WebhookMelder:
    """POST an eine URL. Format je nach Dienst.

    Ein fehlgeschlagener Weckruf darf niemals den Handel stören — deshalb
    wird jeder Fehler hier geschluckt und nur zurückgemeldet.
    """

    def __init__(self, url: str, format: str = "auto", zeitgrenze: int = 10):
        self.url = url
        self.zeitgrenze = zeitgrenze
        self.format = self._erkennen(url) if format == "auto" else format
        self.fehler: str | None = None

    @staticmethod
    def _erkennen(url: str) -> str:
        if "discord.com" in url:
            return "discord"
        if "slack.com" in url:
            return "slack"
        if "api.telegram.org" in url:
            return "telegram"
        return "ntfy"

    def _koerper(self, betreff: str, text: str, dringend: bool) -> tuple[bytes, dict]:
        voll = f"{betreff}\n{text}"
        if self.format == "discord":
            return json.dumps({"content": voll[:1900]}).encode(), {"Content-Type": "application/json"}
        if self.format == "slack":
            return json.dumps({"text": voll[:3000]}).encode(), {"Content-Type": "application/json"}
        if self.format == "telegram":
            # Chat-Kennung wird an die URL gehängt: ...?chat_id=123
            return json.dumps({"text": voll[:4000]}).encode(), {"Content-Type": "application/json"}
        kopf = {
            "Title": betreff.encode("ascii", "replace").decode(),
            "Priority": "high" if dringend else "default",
        }
        return text.encode("utf-8"), kopf

    def melden(self, betreff: str, text: str, dringend: bool = False) -> None:
        koerper, kopf = self._koerper(betreff, text, dringend)
        try:
            req = urllib.request.Request(self.url, data=koerper, headers=kopf, method="POST")
            with urllib.request.urlopen(req, timeout=self.zeitgrenze):
                self.fehler = None
        except (urllib.error.URLError, OSError, TimeoutError) as f:
            self.fehler = f"{type(f).__name__}: {f}"


class MehrfachMelder:
    def __init__(self, *melder: Melder):
        self.melder = [m for m in melder if m is not None]

    def melden(self, betreff: str, text: str, dringend: bool = False) -> None:
        for m in self.melder:
            try:
                m.melden(betreff, text, dringend)
            except Exception:
                pass  # ein defekter Kanal darf die anderen nicht mitreissen


def aus_umgebung(konsole: bool = True) -> Melder:
    """Baut den Melder aus HANDELSASSISTENT_WEBHOOK, falls gesetzt."""
    teile: list[Melder] = []
    if konsole:
        teile.append(KonsolenMelder())
    url = os.environ.get("HANDELSASSISTENT_WEBHOOK")
    if url:
        teile.append(WebhookMelder(url))
    return MehrfachMelder(*teile) if teile else StillerMelder()
