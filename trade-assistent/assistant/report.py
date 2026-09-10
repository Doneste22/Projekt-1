"""Berichte — als Text fürs Terminal, als HTML zum Aufheben.

Die Kapitalkurve wird als Inline-SVG gezeichnet, ohne Bibliothek und ohne
Bilddatei — dieselbe Machart wie die Abbildungen im übrigen Projekt.
"""

from __future__ import annotations

import html
import math
from datetime import datetime, timezone

from .backtest import Ergebnis, Metrics


def _p(x: float) -> str:
    return f"{x * 100:+.2f} %"


def _zeile(name: str, wert: str, rand: str = "") -> str:
    return f"  {name:.<34}{wert:>16}{rand}"


def text_bericht(e: Ergebnis, trades_zeigen: int = 8) -> str:
    m = e.metrics
    s = e.series
    z: list[str] = []
    z.append("=" * 66)
    z.append(f"  {e.strategie.upper()} auf {s.symbol} — {m.tage} Tage, {len(s)} Kerzen")
    z.append(f"  {s[0].time:%Y-%m-%d} bis {s[-1].time:%Y-%m-%d}")
    z.append("=" * 66)

    z.append("\n  ERGEBNIS")
    z.append(_zeile("Startkapital", f"{m.startkapital:,.2f}"))
    z.append(_zeile("Endkapital", f"{m.endkapital:,.2f}"))
    z.append(_zeile("Gesamtrendite", _p(m.gesamtrendite)))
    z.append(_zeile("Rendite je Jahr", _p(m.jahresrendite)))
    z.append(_zeile("Gebühren gezahlt", f"{m.gebuehren:,.2f}"))

    z.append("\n  RISIKO")
    z.append(_zeile("Grösster Rückgang", f"{m.max_rueckgang * 100:.2f} %"))
    z.append(_zeile("  darunter, in Kerzen", f"{m.max_rueckgang_dauer}"))
    z.append(_zeile("Sharpe (je Jahr)", f"{m.sharpe:.2f}"))
    z.append(_zeile("Sortino (je Jahr)", f"{m.sortino:.2f}"))
    z.append(_zeile("Zeit im Markt", f"{m.marktzeit * 100:.1f} %"))

    z.append("\n  HANDEL")
    z.append(_zeile("Abgeschlossene Trades", f"{m.trades}"))
    if m.trades:
        z.append(_zeile("Trefferquote", f"{m.trefferquote * 100:.1f} %"))
        faktor = "∞" if m.gewinnfaktor == float("inf") else f"{m.gewinnfaktor:.2f}"
        z.append(_zeile("Gewinnfaktor", faktor))
        z.append(_zeile("Erwartungswert je Trade", f"{m.erwartungswert:+,.2f}"))
        z.append(_zeile("Schnitt Gewinn / Verlust",
                        f"{m.schnitt_gewinn:+,.2f} / {m.schnitt_verlust:+,.2f}"))
        z.append(_zeile("Bester / schlechtester",
                        f"{m.groesster_gewinn:+,.2f} / {m.groesster_verlust:+,.2f}"))
        z.append(_zeile("Haltedauer im Schnitt", f"{m.schnitt_dauer_kerzen:.1f} Kerzen"))

    z.append("\n  VERGLEICH: KAUFEN UND LIEGENLASSEN")
    z.append(_zeile("Rendite", _p(m.vergleich_rendite)))
    z.append(_zeile("Grösster Rückgang", f"{m.vergleich_rueckgang * 100:.2f} %"))
    unterschied = m.gesamtrendite - m.vergleich_rendite
    urteil = "Strategie vorn" if unterschied > 0 else "schlichtes Halten vorn"
    z.append(_zeile("Unterschied", _p(unterschied), f"  ← {urteil}"))

    if e.trades and trades_zeigen:
        z.append(f"\n  LETZTE TRADES (von {len(e.trades)})")
        for t in e.trades[-trades_zeigen:]:
            z.append(f"    {t}")

    z.append("\n" + "-" * 66)
    z.append(_bewertung(m))
    z.append("-" * 66)
    return "\n".join(z)


def _bewertung(m: Metrics) -> str:
    """Nüchterne Einordnung. Lieber unbequem als schmeichelhaft."""
    punkte: list[str] = []
    if m.trades < 30:
        punkte.append(
            f"  ! Nur {m.trades} Trades — zu wenig für eine belastbare Aussage.\n"
            "    Unter etwa 30 Abschlüssen ist das Ergebnis überwiegend Zufall."
        )
    if not m.schlaegt_markt:
        punkte.append(
            "  ! Schlägt schlichtes Halten nicht. Der Aufwand hat sich nicht gelohnt;\n"
            "    Kaufen und Liegenlassen wäre einträglicher gewesen."
        )
    elif m.max_rueckgang < m.vergleich_rueckgang * 0.6:
        punkte.append(
            "  + Deutlich ruhigerer Verlauf als schlichtes Halten. Das kann eine\n"
            "    schwächere Rendite aufwiegen, wenn Rückgänge schwer auszuhalten sind."
        )
    if m.gewinnfaktor and m.gewinnfaktor < 1.0:
        punkte.append(
            f"  ! Gewinnfaktor {m.gewinnfaktor:.2f} — die Verluste überwiegen die Gewinne."
        )
    if m.max_rueckgang > 0.3:
        punkte.append(
            f"  ! Rückgang von {m.max_rueckgang:.0%} zwischenzeitlich. Ehrliche Frage:\n"
            "    Hättest du in dieser Phase weitergemacht?"
        )
    if m.marktzeit < 0.1 and m.trades:
        punkte.append(
            f"  ~ Nur {m.marktzeit:.0%} der Zeit investiert. Das Kapital liegt fast\n"
            "    durchgehend brach."
        )
    if not punkte:
        punkte.append("  + Keine der üblichen Warnflaggen. Nächster Schritt: Vorwärtstest.")
    punkte.append(
        "\n  Ein Backtest ist kein Versprechen. Er zeigt, wie sich diese Regeln\n"
        "  in dieser Vergangenheit geschlagen hätten — mehr nicht."
    )
    return "\n".join(punkte)


def _svg_kurve(e: Ergebnis, breite: int = 720, hoehe: int = 300) -> str:
    """Kapitalkurve gegen den Vergleichsmassstab, beide auf 100 normiert.

    Die Achse ist logarithmisch. Über sieben Jahre erreicht der Vergleich
    leicht das Zehnfache, während die Strategie nahe 100 bleibt — linear
    gezeichnet klebte die interessantere der beiden Linien unsichtbar am
    unteren Rand. Auf der Log-Achse entspricht gleiche Steigung gleichem
    prozentualem Zuwachs, was hier ohnehin die richtige Lesart ist.
    """
    kurve = [w for _, w in e.portfolio.kapitalkurve]
    kurse = e.series.closes()[-len(kurve):] if kurve else []
    if len(kurve) < 2:
        return "<p>Zu wenige Datenpunkte für eine Kurve.</p>"

    strategie = [max(w / kurve[0] * 100, 1e-6) for w in kurve]
    vergleich = [max(k / kurse[0] * 100, 1e-6) for k in kurse]
    tiefst = min(min(strategie), min(vergleich))
    hoechst = max(max(strategie), max(vergleich))
    log_u, log_o = math.log10(tiefst), math.log10(hoechst)
    spanne = (log_o - log_u) or 1.0
    # Etwas Luft, damit Linien nicht am Rahmen kleben
    log_u -= spanne * 0.06
    log_o += spanne * 0.06
    spanne = log_o - log_u

    links, oben, unten_rand = 46, 14, 30
    zeichen_hoehe = hoehe - oben - unten_rand

    def y(wert: float) -> float:
        return oben + (log_o - math.log10(wert)) / spanne * zeichen_hoehe

    def punkte(reihe: list[float]) -> str:
        n = len(reihe) - 1
        return " ".join(
            f"{links + i / n * (breite - links - 10):.1f},{y(w):.1f}"
            for i, w in enumerate(reihe)
        )

    # Gitterlinien auf runden Werten innerhalb der Spanne
    marken: list[float] = []
    for potenz in range(-2, 6):
        for basis in (1, 2, 5):
            wert = basis * 10.0**potenz
            if tiefst * 0.95 <= wert <= hoechst * 1.05:
                marken.append(wert)
    if 100 not in marken and tiefst <= 100 <= hoechst:
        marken.append(100)
    gitter = "".join(
        f'<line x1="{links}" y1="{y(m):.1f}" x2="{breite - 10}" y2="{y(m):.1f}" '
        f'class="{"null" if m == 100 else "gitter"}"/>'
        f'<text x="{links - 6}" y="{y(m) + 3.5:.1f}" class="marke">{m:g}</text>'
        for m in sorted(set(marken))
    )

    jahre = ""
    schritt = e.series.step
    if schritt:
        letzte_jahr = None
        n = len(kurve) - 1
        for i, (ts, _) in enumerate(e.portfolio.kapitalkurve):
            jahr = datetime.fromtimestamp(ts, tz=timezone.utc).year
            if jahr != letzte_jahr:
                letzte_jahr = jahr
                x = links + i / n * (breite - links - 10)
                jahre += (
                    f'<line x1="{x:.1f}" y1="{oben}" x2="{x:.1f}" y2="{hoehe - unten_rand}" '
                    f'class="gitter"/>'
                    f'<text x="{x:.1f}" y="{hoehe - unten_rand + 14:.0f}" '
                    f'class="marke mitte">{jahr}</text>'
                )

    return f"""<svg viewBox="0 0 {breite} {hoehe}" role="img"
     aria-label="Kapitalkurve der Strategie gegen kaufen und liegenlassen,
                 logarithmische Achse, beide auf 100 normiert">
  {jahre}
  {gitter}
  <polyline points="{punkte(vergleich)}" class="vergleich"/>
  <polyline points="{punkte(strategie)}" class="strategie"/>
</svg>"""


def html_bericht(e: Ergebnis) -> str:
    m = e.metrics
    s = e.series
    ampel = "gut" if m.schlaegt_markt else "schlecht"
    hinweise = html.escape(_bewertung(m)).replace("\n", "<br>")

    def zeile(name: str, wert: str, klasse: str = "") -> str:
        return f'<tr><th>{html.escape(name)}</th><td class="{klasse}">{html.escape(wert)}</td></tr>'

    trades = "".join(
        f"<tr><td>{t.einstieg_ts and datetime.fromtimestamp(t.einstieg_ts, tz=timezone.utc):%Y-%m-%d}</td>"
        f"<td>{datetime.fromtimestamp(t.ausstieg_ts, tz=timezone.utc):%Y-%m-%d}</td>"
        f"<td class='num'>{t.einstieg:,.2f}</td><td class='num'>{t.ausstieg:,.2f}</td>"
        f"<td class='num {'gut' if t.gewonnen else 'schlecht'}'>{t.netto:+,.2f}</td>"
        f"<td class='num {'gut' if t.gewonnen else 'schlecht'}'>{t.rendite:+.2%}</td>"
        f"<td>{html.escape(t.grund)}</td></tr>"
        for t in e.trades
    )

    return f"""<!doctype html>
<html lang="de">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Backtest {html.escape(e.strategie)} · {html.escape(s.symbol)}</title>
<style>
  :root {{
    --grund: #fbfaf8; --text: #1b1a18; --leise: #6a6560; --linie: #e2ddd6;
    --gut: #1c6b4a; --schlecht: #a3341f; --akzent: #8a5a2b;
  }}
  @media (prefers-color-scheme: dark) {{
    :root {{ --grund:#171614; --text:#eceae6; --leise:#9a948c; --linie:#33302c;
             --gut:#5fbf92; --schlecht:#e0785f; --akzent:#d0a068; }}
  }}
  * {{ box-sizing: border-box; }}
  body {{ margin:0; padding:2rem 1rem; background:var(--grund); color:var(--text);
    font:16px/1.55 "Inter", system-ui, -apple-system, sans-serif; }}
  main {{ max-width: 60rem; margin: 0 auto; }}
  h1 {{ font-size:1.5rem; margin:0 0 .2rem; letter-spacing:-.01em; }}
  .unterzeile {{ color:var(--leise); margin:0 0 2rem; }}
  section {{ margin-bottom:2.5rem; }}
  h2 {{ font-size:.8rem; text-transform:uppercase; letter-spacing:.09em;
    color:var(--leise); border-bottom:1px solid var(--linie); padding-bottom:.4rem; }}
  table {{ width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; }}
  th {{ text-align:left; font-weight:500; color:var(--leise); padding:.35rem 0; }}
  td {{ text-align:right; padding:.35rem 0; }}
  .kennzahlen {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(15rem,1fr)); gap:0 2.5rem; }}
  .gut {{ color:var(--gut); }} .schlecht {{ color:var(--schlecht); }}
  .num {{ text-align:right; }}
  svg {{ width:100%; height:auto; }}
  .achse {{ stroke:var(--linie); stroke-width:1; }}
  .null {{ stroke:var(--linie); stroke-width:1; stroke-dasharray:3 3; }}
  .marke {{ fill:var(--leise); font-size:10px; text-anchor:end; }}
  .marke.mitte {{ text-anchor:middle; }}
  .gitter {{ stroke:var(--linie); stroke-width:.5; }}
  .strategie {{ fill:none; stroke:var(--akzent); stroke-width:2; }}
  .vergleich {{ fill:none; stroke:var(--leise); stroke-width:1.5; stroke-dasharray:4 3; }}
  .legende {{ display:flex; gap:1.5rem; font-size:.85rem; color:var(--leise); margin-top:.5rem; }}
  .legende b {{ font-weight:500; }}
  .hinweis {{ background:color-mix(in srgb, var(--akzent) 8%, transparent);
    border-left:3px solid var(--akzent); padding:1rem 1.2rem; font-size:.9rem; }}
  .handel td, .handel th {{ border-bottom:1px solid var(--linie); font-size:.85rem;
    padding:.4rem .5rem; }}
  .handel th {{ text-align:right; }} .handel th:first-child, .handel th:nth-child(2),
  .handel th:last-child, .handel td:first-child, .handel td:nth-child(2),
  .handel td:last-child {{ text-align:left; }}
  .tabellenrahmen {{ overflow-x:auto; }}
  footer {{ color:var(--leise); font-size:.8rem; border-top:1px solid var(--linie);
    padding-top:1rem; }}
</style>
<main>
  <h1>{html.escape(e.strategie)} · {html.escape(s.symbol)}</h1>
  <p class="unterzeile">{s[0].time:%d.%m.%Y} bis {s[-1].time:%d.%m.%Y} ·
     {len(s)} Kerzen · erstellt {datetime.now(timezone.utc):%d.%m.%Y %H:%M} UTC</p>

  <section>
    <h2>Kapitalkurve</h2>
    {_svg_kurve(e)}
    <p class="legende"><span><b style="color:var(--akzent)">———</b> Strategie</span>
       <span><b>- - -</b> kaufen und liegenlassen</span>
       <span>beide auf 100 normiert · logarithmische Achse</span></p>
  </section>

  <section>
    <h2>Kennzahlen</h2>
    <div class="kennzahlen">
      <table>
        {zeile("Startkapital", f"{m.startkapital:,.2f}")}
        {zeile("Endkapital", f"{m.endkapital:,.2f}")}
        {zeile("Gesamtrendite", _p(m.gesamtrendite), ampel)}
        {zeile("Rendite je Jahr", _p(m.jahresrendite))}
        {zeile("Vergleich: nur halten", _p(m.vergleich_rendite))}
        {zeile("Unterschied", _p(m.gesamtrendite - m.vergleich_rendite), ampel)}
      </table>
      <table>
        {zeile("Grösster Rückgang", f"{m.max_rueckgang:.2%}")}
        {zeile("… beim schlichten Halten", f"{m.vergleich_rueckgang:.2%}")}
        {zeile("Sharpe je Jahr", f"{m.sharpe:.2f}")}
        {zeile("Trades", f"{m.trades}")}
        {zeile("Trefferquote", f"{m.trefferquote:.1%}")}
        {zeile("Gebühren", f"{m.gebuehren:,.2f}")}
      </table>
    </div>
  </section>

  <section>
    <h2>Einordnung</h2>
    <p class="hinweis">{hinweise}</p>
  </section>

  <section>
    <h2>Handelsbuch</h2>
    <div class="tabellenrahmen">
    <table class="handel">
      <tr><th>Einstieg</th><th>Ausstieg</th><th>Kurs ein</th><th>Kurs aus</th>
          <th>Ergebnis</th><th>Rendite</th><th>Grund</th></tr>
      {trades or '<tr><td colspan="7">Keine Trades.</td></tr>'}
    </table>
    </div>
  </section>

  <footer>
    Simulation auf historischen Kursen, inklusive Gebühren und Schlupf.
    Kein Geld bewegt, keine Vorhersage, keine Anlageberatung.
  </footer>
</main>
</html>"""
