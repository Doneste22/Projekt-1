/* Wand für Wand — Partnerlinks an einer einzigen Stelle.
   ---------------------------------------------------------------------------
   Hier steht je Produktkennung die Ziel-URL des Partnerprogramms. Solange der
   Eintrag leer ist, bleibt die Karte auf „Partnerlink folgt“ und der Link tot —
   die Seite ist also jederzeit veröffentlichbar, auch halb ausgefüllt.

   Eintragen:
       'festool-planex-lhs-2-225-eqi': 'https://www.example.com/…?tag=…',

   Beim Laden der Seite setzt der Code darunter für jede ausgefüllte Zeile
       href      auf die Ziel-URL
       rel       auf "sponsored nofollow noopener"
       target    auf _blank
       Status    von „Partnerlink folgt“ auf „Anzeige“
   Damit ist die Werbekennzeichnung immer dort, wo auch der bezahlte Link ist —
   sie kann nicht vergessen werden.

   Zwei Regeln, die Geld kosten, wenn man sie bricht:
   1. Jedes Programm verlangt die Kennzeichnung. Sie wird hier automatisch
      gesetzt; den Hinweistext im Abschnitt „Empfehlungen“ trotzdem stehen lassen.
   2. Kampagnen-Parameter (subid, clickref, utm) je Platzierung vergeben, sonst
      lässt sich später nicht sagen, welche Karte tatsächlich verkauft.
   --------------------------------------------------------------------------- */
(function () {
  'use strict';

  var LINKS = {
    /* Festool PLANEX LHS 2 225 EQI */
    'festool-planex-lhs-2-225-eqi': '',
    /* Mirka LEROS 950CV */
    'mirka-leros-950cv': '',
    /* Flex Giraffe GE 5 R mit VCE 33 L AC */
    'flex-giraffe-ge-5-r-mit-vce-33-l-ac': '',
    /* Mirka Abranet Schleifgitter */
    'mirka-abranet-schleifgitter': '',
    /* Festool DURADRIVE DWC 18-4500 */
    'festool-duradrive-dwc-18-4500': '',
    /* Makita DFS452 Schnellbauschrauber */
    'makita-dfs452-schnellbauschrauber': '',
    /* Bosch Professional GLL 3-80 Linienlaser */
    'bosch-professional-gll-3-80-linienlaser': '',
    /* Stabila Type 196-2 Wasserwaage */
    'stabila-type-196-2-wasserwaage': '',
    /* Collomix Xo 4 Handrührwerk */
    'collomix-xo-4-handruehrwerk': '',
    /* Tajima Cuttermesser & Trockenbausäge */
    'tajima-cuttermesser-trockenbausaege': '',
    /* Knauf Diamant Hartgipsplatte */
    'knauf-diamant-hartgipsplatte': '',
    /* Rigips Habito Schwerlastplatte */
    'rigips-habito-schwerlastplatte': '',
    /* Fermacell Gipsfaserplatte */
    'fermacell-gipsfaserplatte': '',
    /* Knauf / Rigips Imprägnierte Platte (GKBI / RBI) */
    'knauf-rigips-impraegnierte-platte-gkbi-rbi': '',
    /* Protektor / Knauf CW- und UW-Profile */
    'protektor-knauf-cw-und-uw-profile': '',
    /* Flumroc · Isover · Rockwool Ständerwerk-Dämmung aus Steinwolle */
    'flumroc-staenderwerk-daemmung-aus-steinwolle': '',
    /* Knauf Uniflott Fugenspachtel */
    'knauf-uniflott-fugenspachtel': '',
    /* Knauf · Rigips Fertig angerührte Flächenspachtel */
    'knauf-fertig-angeruehrte-flaechenspachtel': '',
    /* Knauf · Rigips Papier-Bewehrungsstreifen */
    'knauf-papier-bewehrungsstreifen': '',
    /* Knauf · Protektor Anschlussdichtband & Trennwandkitt */
    'knauf-anschlussdichtband-trennwandkitt': '',
    /* Knauf Cleaneo Akustikplatte */
    'knauf-cleaneo-akustikplatte': '',
    /* Rigips Rigitone & Gyptone */
    'rigips-rigitone-gyptone': '',
    /* Ecophon Focus Deckensystem */
    'ecophon-focus-deckensystem': '',
    /* Heradesign Holzwolle-Akustikplatte */
    'heradesign-holzwolle-akustikplatte': '',
    /* Systemzubehör Akustikvlies, schwarz */
    'systemzubehoer-akustikvlies-schwarz': '',
    /* Knauf · Protektor Nonius-Abhänger & CD 60/27 */
    'knauf-nonius-abhaenger-cd-60-27': '',
    /* 3M · Dräger Halbmaske FFP2 / FFP3 */
    '3m-halbmaske-ffp2-ffp3': '',
    /* Arbeitsschutz Knieschoner mit Gelkern */
    'arbeitsschutz-knieschoner-mit-gelkern': '',
    /* Edma · Wolfcraft Plattenheber / Deckenlift */
    'edma-plattenheber-deckenlift': '',
  };

  /* --- Aktivierung ------------------------------------------------------- */
  var karten = document.querySelectorAll('a.link[data-produkt]');
  var aktiv = 0;

  karten.forEach(function (a) {
    var ziel = LINKS[a.getAttribute('data-produkt')];
    if (!ziel) return;

    a.setAttribute('href', ziel);
    a.setAttribute('rel', 'sponsored nofollow noopener');
    a.setAttribute('target', '_blank');
    a.setAttribute('data-affiliate', 'aktiv');

    var karte = a.closest('.produkt');
    var status = karte && karte.querySelector('.status');
    if (status) status.textContent = 'Anzeige';
    aktiv++;
  });

  /* Für die Kontrolle in der Konsole: wie viele der Karten verdienen schon? */
  if (window.console && karten.length) {
    console.info('Partnerlinks aktiv: ' + aktiv + ' von ' + karten.length);
  }
})();
