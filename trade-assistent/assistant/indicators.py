"""Indikatoren, alle in reinem Python.

Konvention: Jede Funktion gibt eine Liste gleicher Länge wie die Eingabe
zurück. Wo noch nicht genug Historie für einen Wert vorliegt, steht `None`.
Damit bleibt die Indexierung zwischen Kurs und Indikator identisch — die
häufigste Fehlerquelle bei Handelslogik ist ein um eins verschobener Index.

Geglättet wird nach Wilder, wo Wilder üblich ist (RSI, ATR, ADX). Wilders
Glättung ist eine EMA mit alpha = 1/n, nicht 2/(n+1); wer das verwechselt,
bekommt Werte, die anderen Charts nicht entsprechen.
"""

from __future__ import annotations

import math
from typing import Sequence

Num = float | None


def _pruefe(werte: Sequence[float], n: int) -> None:
    if n <= 0:
        raise ValueError("Periode muss positiv sein")


def sma(werte: Sequence[float], n: int) -> list[Num]:
    """Einfacher gleitender Durchschnitt."""
    _pruefe(werte, n)
    out: list[Num] = [None] * len(werte)
    summe = 0.0
    for i, w in enumerate(werte):
        summe += w
        if i >= n:
            summe -= werte[i - n]
        if i >= n - 1:
            out[i] = summe / n
    return out


def ema(werte: Sequence[float], n: int) -> list[Num]:
    """Exponentiell gewichteter Durchschnitt, mit SMA als Startwert."""
    _pruefe(werte, n)
    out: list[Num] = [None] * len(werte)
    if len(werte) < n:
        return out
    alpha = 2.0 / (n + 1.0)
    stand = sum(werte[:n]) / n
    out[n - 1] = stand
    for i in range(n, len(werte)):
        stand = werte[i] * alpha + stand * (1 - alpha)
        out[i] = stand
    return out


def wilder(werte: Sequence[float], n: int) -> list[Num]:
    """Wilders Glättung: alpha = 1/n, Startwert ist der einfache Mittelwert."""
    _pruefe(werte, n)
    out: list[Num] = [None] * len(werte)
    if len(werte) < n:
        return out
    stand = sum(werte[:n]) / n
    out[n - 1] = stand
    for i in range(n, len(werte)):
        stand = (stand * (n - 1) + werte[i]) / n
        out[i] = stand
    return out


def rsi(closes: Sequence[float], n: int = 14) -> list[Num]:
    """Relative Strength Index nach Wilder, Skala 0..100."""
    _pruefe(closes, n)
    out: list[Num] = [None] * len(closes)
    if len(closes) <= n:
        return out
    gewinne, verluste = [0.0], [0.0]
    for a, b in zip(closes, closes[1:]):
        d = b - a
        gewinne.append(max(d, 0.0))
        verluste.append(max(-d, 0.0))
    # Erster Wert bei Index n: Mittel über die n Differenzen 1..n
    avg_g = sum(gewinne[1 : n + 1]) / n
    avg_v = sum(verluste[1 : n + 1]) / n
    out[n] = _rsi_wert(avg_g, avg_v)
    for i in range(n + 1, len(closes)):
        avg_g = (avg_g * (n - 1) + gewinne[i]) / n
        avg_v = (avg_v * (n - 1) + verluste[i]) / n
        out[i] = _rsi_wert(avg_g, avg_v)
    return out


def _rsi_wert(avg_g: float, avg_v: float) -> float:
    if avg_v == 0:
        return 100.0 if avg_g > 0 else 50.0
    rs = avg_g / avg_v
    return 100.0 - 100.0 / (1.0 + rs)


def true_range(
    highs: Sequence[float], lows: Sequence[float], closes: Sequence[float]
) -> list[float]:
    """True Range: berücksichtigt Kurslücken zwischen den Kerzen."""
    tr = [highs[0] - lows[0]] if highs else []
    for i in range(1, len(highs)):
        vor = closes[i - 1]
        tr.append(max(highs[i] - lows[i], abs(highs[i] - vor), abs(lows[i] - vor)))
    return tr


def atr(
    highs: Sequence[float], lows: Sequence[float], closes: Sequence[float], n: int = 14
) -> list[Num]:
    """Average True Range — das Mass für Schwankungsbreite, in Kurseinheiten."""
    return wilder(true_range(highs, lows, closes), n)


def macd(
    closes: Sequence[float], schnell: int = 12, langsam: int = 26, signal: int = 9
) -> tuple[list[Num], list[Num], list[Num]]:
    """MACD-Linie, Signallinie und Histogramm."""
    e_s, e_l = ema(closes, schnell), ema(closes, langsam)
    linie: list[Num] = [
        (a - b) if (a is not None and b is not None) else None for a, b in zip(e_s, e_l)
    ]
    fest = [w for w in linie if w is not None]
    sig_kompakt = ema(fest, signal)
    versatz = len(linie) - len(fest)
    sig: list[Num] = [None] * versatz + sig_kompakt
    hist: list[Num] = [
        (a - b) if (a is not None and b is not None) else None for a, b in zip(linie, sig)
    ]
    return linie, sig, hist


def bollinger(
    closes: Sequence[float], n: int = 20, k: float = 2.0
) -> tuple[list[Num], list[Num], list[Num]]:
    """Mittellinie, oberes und unteres Band (k Standardabweichungen)."""
    mitte = sma(closes, n)
    oben: list[Num] = [None] * len(closes)
    unten: list[Num] = [None] * len(closes)
    for i in range(n - 1, len(closes)):
        fenster = closes[i - n + 1 : i + 1]
        m = mitte[i]
        var = sum((w - m) ** 2 for w in fenster) / n
        s = math.sqrt(var)
        oben[i], unten[i] = m + k * s, m - k * s
    return mitte, oben, unten


def donchian(
    highs: Sequence[float], lows: Sequence[float], n: int = 20
) -> tuple[list[Num], list[Num]]:
    """Höchstes Hoch und tiefstes Tief der letzten n Kerzen — ohne die aktuelle.

    Der Ausschluss der aktuellen Kerze ist Absicht: Ein Ausbruch soll gegen
    die *vorherige* Spanne gemessen werden, sonst bricht der Kurs per
    Definition nie aus.
    """
    ob: list[Num] = [None] * len(highs)
    un: list[Num] = [None] * len(lows)
    for i in range(n, len(highs)):
        ob[i] = max(highs[i - n : i])
        un[i] = min(lows[i - n : i])
    return ob, un


def adx(
    highs: Sequence[float], lows: Sequence[float], closes: Sequence[float], n: int = 14
) -> tuple[list[Num], list[Num], list[Num]]:
    """ADX mit +DI und -DI nach Wilder. ADX misst Trendstärke, nicht Richtung."""
    laenge = len(highs)
    leer: list[Num] = [None] * laenge
    if laenge < 2:
        return leer[:], leer[:], leer[:]
    plus_dm, minus_dm = [0.0], [0.0]
    for i in range(1, laenge):
        auf = highs[i] - highs[i - 1]
        ab = lows[i - 1] - lows[i]
        plus_dm.append(auf if (auf > ab and auf > 0) else 0.0)
        minus_dm.append(ab if (ab > auf and ab > 0) else 0.0)
    tr = true_range(highs, lows, closes)
    # Wilder glättet ab Index 1 (die erste TR ohne Vorkerze bleibt aussen vor)
    tr_g = [None] + wilder(tr[1:], n)
    p_g = [None] + wilder(plus_dm[1:], n)
    m_g = [None] + wilder(minus_dm[1:], n)
    p_di: list[Num] = [None] * laenge
    m_di: list[Num] = [None] * laenge
    dx: list[float] = []
    dx_index: list[int] = []
    for i in range(laenge):
        if tr_g[i] is None or not tr_g[i]:
            continue
        p = 100.0 * p_g[i] / tr_g[i]
        m = 100.0 * m_g[i] / tr_g[i]
        p_di[i], m_di[i] = p, m
        summe = p + m
        dx.append(100.0 * abs(p - m) / summe if summe else 0.0)
        dx_index.append(i)
    adx_kompakt = wilder(dx, n)
    adx_out: list[Num] = [None] * laenge
    for pos, i in enumerate(dx_index):
        adx_out[i] = adx_kompakt[pos]
    return adx_out, p_di, m_di


def slope(werte: Sequence[Num], n: int) -> Num:
    """Steigung der letzten n Werte je Kerze, per kleinster Quadrate."""
    fest = [w for w in werte[-n:] if w is not None]
    if len(fest) < 2:
        return None
    m = len(fest)
    x_m = (m - 1) / 2
    y_m = sum(fest) / m
    zaehler = sum((i - x_m) * (y - y_m) for i, y in enumerate(fest))
    nenner = sum((i - x_m) ** 2 for i in range(m))
    return zaehler / nenner if nenner else None
