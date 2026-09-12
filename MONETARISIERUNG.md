# Wie aus dieser Seite 200 Franken werden

Ausgangslage: Die Seite ist inhaltlich fertig, hat aber bis heute keinen einzigen
Weg, Geld einzunehmen. Alle 29 Produktlinks zeigen auf `#`, es gibt nichts zu
kaufen und nichts zu buchen. Dieses Dokument sortiert die möglichen Wege nach
dem, was zählt: **wie viele Menschen es braucht, bis 200 Franken zusammenkommen.**

Die Zahlen unten sind Rechnungen, keine Versprechen. Wo sie auf fremden Quellen
beruhen, stehen die Quellen dabei.

---

## Die Kernzahl: Reichweite pro Franken

Das ist der ganze Unterschied zwischen den Wegen.

| Weg | Menschen für CHF 200 | Vorlauf |
| --- | --- | --- |
| Eigene Beratung verkaufen | **1–2 Kundinnen** | Tage |
| Digitales Produkt (Checkliste, Rechner) | ~15–20 Käufe | Wochen |
| Partnerlinks (Affiliate) | ~3'000–6'000 Besuche | Monate |
| Werbeplätze / Sponsoring | ~10'000 Besuche im Monat | Monate bis Jahr |

Eine einzige Planprüfung zu CHF 180 ersetzt rund 4'000 Seitenaufrufe. Deshalb
steht sie in diesem Repository jetzt an erster Stelle — und deshalb ist die
Antwort auf „wie verdiene ich mit der Seite 200 Franken" nicht Affiliate,
sondern: **die eigene Erfahrung verkaufen, und die Seite als Beweis dafür
benutzen, dass man sie hat.**

---

## Weg 1 — Beratung. Der schnellste, heute gebaut

Neu im Repository: `angebot.html` mit vier Leistungen und festen Preisen.

| Leistung | Preis | Aufwand | Deckt CHF 200 ab? |
| --- | --- | --- | --- |
| Kurzberatung, 45 Min. | CHF 90.– | ~1 h mit Protokoll | zur Hälfte |
| Planprüfung & Materialliste | CHF 180.– | 2–3 h | fast ganz |
| Akustik-Check | CHF 240.– | 3–4 h | **ja** |
| Q-Stufen-Abnahme vor Ort | ab CHF 320.– | halber Tag | **ja** |

Die Preise sind Vorschläge, angesetzt zwischen Handwerker-Stundenansatz und
Planer-Honorar. Sie stehen an genau zwei Stellen im Code (`angebot.html` und der
Textbaustein im Abschnitt „Über mich" in `index.html`) und lassen sich in fünf
Minuten ändern.

**Warum das ohne Website-Traffic funktioniert:** Die Beratung braucht keine
Google-Rankings, sie braucht ein Gegenüber. Die Seite ist dabei nicht der
Vertriebskanal, sondern der Vertrauensbeweis — wer 20 Jahre Erfahrung behauptet,
belegt sie mit drei Anleitungen, die genau so aussehen wie 20 Jahre Erfahrung.

**Die ersten zehn Kontakte, die nichts kosten:**

1. **Ehemalige Kundschaft und Bauleiter aus früheren Baustellen.** Eine Zeile:
   „Ich habe aufgeschrieben, was ich gelernt habe — und biete jetzt auch
   Planprüfungen an. Falls du jemanden kennst, der vor einem Ausbau steht."
2. **Architektur- und Innenarchitekturbüros in der Region.** Die haben regelmässig
   Akustikprobleme und selten jemanden, der rechnen *und* bauen kann. Ein Büro,
   das einmal anfragt, fragt wieder an.
3. **Malergeschäfte.** Sie sind die Ersten, die eine schlechte Q-Stufe sehen, und
   die Letzten, die dafür geradestehen wollen. Ein Partner für die Beurteilung
   ist für sie wertvoll.
4. **Facebook- und WhatsApp-Gruppen für Sanierung und Eigenheim** in der Region —
   nicht mit Werbung, sondern indem man drei Fragen ernsthaft beantwortet und die
   Anleitung verlinkt, in der es ausführlich steht.
5. **Handwerkerplattformen** ([Ofri](https://www.ofri.ch/),
   [Renovero](https://www.renovero.ch/de/), Buildigo): schnellster Zugang zu
   echten Anfragen, kostet aber pro Offerte oder Abo und führt zu Preiskampf.
   Für Beratungsleistungen taugen sie weniger als für Ausführung — als Notnagel
   für den ersten Auftrag brauchbar.

**Realistisch:** Eine Runde durch die eigenen Kontakte bringt erfahrungsgemäss
aus 20 Nachrichten 1–3 Gespräche. Ein Gespräch reicht.

**Was noch fehlt, bevor die erste Rechnung rausgeht:**

- E-Mail-Adresse im Formular und im Impressum eintragen (steht rot markiert da).
- Klären, ob Handelsregistereintrag und MWST-Pflicht bestehen — beides ab
  CHF 100'000 Jahresumsatz. Darunter: Rechnung ohne MWST, Hinweis im Impressum.
- Ein Rechnungsformular mit QR-Rechnung (jede Schweizer Bank stellt es kostenlos
  zur Verfügung).

---

## Weg 2 — Digitales Produkt. Der mittlere

Was die Anleitungen schon fast enthalten, aber nicht in mitnehmbarer Form:

- **Q-Stufen-Checkliste für die Bauabnahme** als PDF zum Ausdrucken — was bei
  welcher Stufe geschuldet ist, mit Platz für Notizen. CHF 9.–
- **Materialrechner Trennwand** als Tabelle: Länge, Höhe, Achsmass rein,
  Plattenzahl, Profilmeter, Schrauben, Spachtelmenge raus. CHF 19.–
- **Nachhall-Rechenblatt** für Akustikdecken — die Rechnung aus dem
  Akustik-Abschnitt als benutzbares Werkzeug. CHF 19.–

CHF 200 sind rund 15–20 Verkäufe. Verkauft wird über einen Anbieter, der die
Abwicklung übernimmt (Gumroad, Digistore24, Payrexx für die Schweiz) — kein
eigenes Zahlungssystem, kein Backend auf dieser Seite.

**Der eigentliche Wert liegt woanders:** Wer für CHF 19 ein Rechenblatt kauft,
ist derselbe Mensch, der zwei Wochen später für CHF 180 eine Planprüfung braucht.
Das Produkt ist die günstige Eintrittskarte in Weg 1.

---

## Weg 3 — Partnerlinks. Der langsame, aber bleibende

Die Infrastruktur steht jetzt: `assets/js/partnerlinks.js` enthält alle 29
Produktkennungen. Wird bei einer Zeile eine URL eingetragen, setzt die Seite beim
Laden `href`, `rel="sponsored nofollow noopener"` und die Kennzeichnung
„Anzeige" — die Werbekennzeichnung kann nicht mehr vergessen werden.

### Die Rechnung

```
Besuche × Klickrate auf Produktlinks × Kaufquote im Shop × Warenkorb × Provision
```

Mit Zahlen, die im Gewerbe realistisch sind:

```
4'000 Besuche × 5 % Klickrate = 200 Shop-Klicks
200 Klicks × 8 % Kaufquote     = 16 Bestellungen
16 × CHF 250 Warenkorb × 5 %   = CHF 200
```

Die Kaufquote von 3–15 % ist für Amazon-Partner ein berichteter Erfahrungsbereich
([selbstaendig-im-netz.de](https://www.selbstaendig-im-netz.de/amazon/amazon-partnerprogramm-statistiken-fuer-mehr-einnahmen-nutzen-bestseller-conversion-rate-top-seiten/)),
der durchschnittliche Warenkorb von rund EUR 250 ist eine Angabe von Galaxus zum
eigenen Partnerprogramm ([galaxus.de](https://www.galaxus.de/de/page/werden-sie-affiliate-partner-17259)).
Für Profiwerkzeug — ein Langhalsschleifer kostet über CHF 1'000 — liegt der Wert
eher höher, die Kaufquote dafür tiefer, weil länger überlegt wird.

**Grössenordnung: 3'000 bis 6'000 Besuche für die ersten 200 Franken.** Für eine
neue Seite in einem Fachthema sind das sechs bis zwölf Monate Arbeit an Inhalt
und Sichtbarkeit. Danach wiederholt es sich allerdings jeden Monat, ohne dass
noch jemand Zeit dafür aufwendet — das ist der Grund, es trotzdem zu tun.

### Welche Programme in Frage kommen

| Programm | Provision | Zugang | Anmerkung |
| --- | --- | --- | --- |
| Amazon PartnerNet | bis 8 % Baumarkt/Handwerkzeug | sofort | 24-h-Cookie, seit 2026 strengere Regeln zu eigenen Inhalten |
| Digitec Galaxus | auf Anfrage | `anmelden@digitecgalaxus.ch` | grösster Schweizer Onlineshop, hoher Warenkorb |
| Awin (Netzwerk) | je Händler | Bewerbung | u. a. Jungheinrich PROFISHOP CH, Hornbach |
| OBI (DE) | ~7 % | Bewerbung | nur für deutsche Leserschaft |
| Hersteller direkt | individuell | Anfrage | Festool, Mirka: eher Kooperation als Provision |

Für eine Seite, die aus der Schweiz kommt und Schweizer Preise nennt, ist Galaxus
der naheliegendste erste Partner — die Leserschaft kauft dort ohnehin, und der
Warenkorb ist hoch.

### Zwei Regeln, die sonst Geld kosten

1. **Kampagnenparameter je Platzierung** (`subid`, `clickref`). Ohne sie lässt
   sich nie sagen, welche Karte tatsächlich verkauft — und damit auch nicht,
   welcher Text mehr davon verdient.
2. **24 Stunden Cookie-Laufzeit bei Amazon.** Wer eine Kaufempfehlung gibt,
   sollte sie dort geben, wo jemand kurz vor dem Kauf steht — in der
   Werkzeugliste, nicht mitten in einer Anleitung.

---

## Weg 4 — Die Seite selbst als Referenz verkaufen

Der Weg, der in solchen Aufstellungen meistens fehlt: Dieses Repository ist ein
vollständiger, sauber gebauter Fachauftritt ohne Baukasten, ohne monatliche
Gebühr, mit eigenen Zeichnungen. Handwerksbetriebe zahlen für so etwas
CHF 1'500 bis 4'000 — und die meisten bekommen dafür einen Baukasten mit
Stockfotos.

Wer den Trockenbau kennt *und* eine solche Seite vorweisen kann, hat gegenüber
jeder Agentur ein Argument, das keine Agentur hat: Er versteht, wovon die Seite
handelt. Ein Auftrag deckt das 200-Franken-Ziel zehnfach.

Voraussetzung ist nur, dass die Seite live ist. Solange sie auf keiner Domain
liegt, ist sie keine Referenz.

---

## Was diese Woche zu tun ist

Die kürzeste Strecke zu den 200 Franken, in der Reihenfolge:

1. **Domain registrieren und Seite live stellen.** Statisches HTML — GitHub Pages,
   Netlify oder Cloudflare Pages hosten das kostenlos, eine `.ch`-Domain kostet
   rund CHF 12 im Jahr. Danach die Platzhalter-Domain `wandfuerwand.ch` in
   `robots.txt`, `sitemap.xml` und den `canonical`-Tags ersetzen.
2. **E-Mail-Adresse eintragen** — in `angebot.html`, `impressum.html`,
   `datenschutz.html`. Ohne sie kann niemand buchen.
3. **Impressum und Datenschutz ausfüllen** (beide sind jetzt auf Schweizer Recht
   umgeschrieben, die offenen Punkte stehen am Ende jeder Seite).
4. **Zwanzig Nachrichten** an ehemalige Kundschaft, Bauleiter, Architekturbüros
   und Malergeschäfte. Das ist der Schritt, der die 200 Franken bringt — die
   Punkte 1 bis 3 machen ihn nur möglich.
5. **Parallel dazu:** Anmeldung bei Digitec Galaxus und Amazon PartnerNet. Beides
   dauert Tage bis Wochen, also früh anstossen; verdienen wird es erst später.

Punkt 4 ist der einzige, der nicht im Code steht und nicht delegierbar ist.

---

## Was hier nicht steht

Keine Methode, die Geld verspricht, ohne dass jemand etwas dafür bekommt: keine
gekauften Klicks, keine automatisch erzeugten Texte in Masse, keine
Empfehlungslisten für Produkte, die niemand in der Hand hatte. Das trägt in einem
Fachthema nicht — die Leserschaft dieser Seite besteht aus Leuten, die eine Wand
bauen und sofort merken, ob jemand weiss, wovon er redet.

Der Wert dieser Seite liegt genau darin, dass sie es weiss. Er lässt sich
verkaufen, aber nicht abkürzen.
