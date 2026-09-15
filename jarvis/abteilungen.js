/* Die Weiche — welche Abteilung bearbeitet die Frage?

   Jarvis hat mehrere Arbeitsplätze (jarvis/abteilungen.json): Baustelle,
   Angebot, Büro, Galicien, Alltag. Jeder bringt seinen eigenen Kontext und
   seine eigenen Werkzeuge mit. Diese Datei entscheidet nur, welcher dran ist.

   Zwei Stufen, in dieser Reihenfolge:

     1. Weckworte. Kostet nichts, dauert nichts. „Wie dick spachtle ich auf
        Q3?" trifft „spachtel" und „q3" — fertig, das ist die Baustelle.
     2. Bleibt es unklar, fragt app.js einmal kurz das billige Modell
        (Betriebsart „leiten"). Dessen Antwort geht durch lesen() und ist
        damit garantiert eine Abteilung, die es wirklich gibt.

   Getrennt vom Rest, weil sich diese Entscheidung so ohne Browser prüfen
   lässt — siehe scripts/pruefe-aufbau.mjs. */

(function () {
  'use strict';

  var KEY_FEST = 'jarvis.abteilung-fest.v1';

  var DATEN = { standard: 'alltag', leiten_mit_modell: true, abteilungen: {} };

  /* Umlaute und Akzente vereinheitlichen, damit „Dämmung" und „Daemmung"
     dasselbe Wort sind — in den Weckworten stehen beide Schreibweisen, und
     Damaso tippt mal so, mal so. */
  function glatt(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function laden(daten) {
    if (!daten || typeof daten !== 'object') return;
    if (daten.abteilungen && typeof daten.abteilungen === 'object') DATEN.abteilungen = daten.abteilungen;
    if (DATEN.abteilungen[daten.standard]) DATEN.standard = daten.standard;
    else DATEN.standard = Object.keys(DATEN.abteilungen)[0] || 'alltag';
    DATEN.leiten_mit_modell = daten.leiten_mit_modell !== false;
  }

  function gibtEs(id) {
    return !!(id && Object.prototype.hasOwnProperty.call(DATEN.abteilungen, id));
  }

  function liste() {
    return Object.keys(DATEN.abteilungen).map(function (id) {
      return { id: id, name: DATEN.abteilungen[id].name || id, kurz: DATEN.abteilungen[id].kurz || '' };
    });
  }

  function name(id) {
    return gibtEs(id) ? (DATEN.abteilungen[id].name || id) : (DATEN.abteilungen[DATEN.standard] || {}).name || 'Alltag';
  }

  /* Stufe 1: Weckworte zählen. Gibt { abteilung, sicher } zurück — „sicher"
     heißt: es muss niemand mehr gefragt werden. */
  function weiche(text) {
    var geglaettet = glatt(text);
    var woerter = geglaettet.split(/[^a-z0-9]+/).filter(Boolean);
    var beste = null;
    var punkteBest = 0;
    var gleichstand = false;

    Object.keys(DATEN.abteilungen).forEach(function (id) {
      var worte = DATEN.abteilungen[id].weckworte || [];
      var punkte = 0;
      worte.forEach(function (rohwort) {
        var wort = glatt(rohwort);
        if (!wort) return;
        if (wort.indexOf(' ') >= 0) {
          // Mehrwortiges Weckwort („haus kaufen") — im ganzen Text suchen.
          if (geglaettet.indexOf(wort) >= 0) punkte++;
          return;
        }
        for (var i = 0; i < woerter.length; i++) {
          // Wortanfang genügt: „gips" trifft auch „Gipskartonplatte".
          if (woerter[i].indexOf(wort) === 0) { punkte++; return; }
        }
      });
      if (punkte > punkteBest) { punkteBest = punkte; beste = id; gleichstand = false; }
      else if (punkte === punkteBest && punkte > 0 && id !== beste) { gleichstand = true; }
    });

    if (!punkteBest || gleichstand) return { abteilung: DATEN.standard, sicher: false };
    return { abteilung: beste, sicher: true };
  }

  /* Stufe 2: was das Modell geantwortet hat, auf eine echte Abteilung
     zurückführen. Es soll nur den Namen schreiben, aber verlassen tun wir uns
     darauf nicht. */
  function lesen(antwort) {
    var geglaettet = glatt(antwort);
    var ids = Object.keys(DATEN.abteilungen);
    for (var i = 0; i < ids.length; i++) {
      if (geglaettet.indexOf(glatt(ids[i])) >= 0) return ids[i];
    }
    for (var j = 0; j < ids.length; j++) {
      if (geglaettet.indexOf(glatt(DATEN.abteilungen[ids[j]].name)) >= 0) return ids[j];
    }
    return DATEN.standard;
  }

  /* Festgehalten: Damaso hat im Kopf der App eine Abteilung ausgewählt. Dann
     wird nicht mehr geleitet, bis er wieder auf „automatisch" stellt. */
  function fest(id) {
    try {
      if (id === undefined) {
        var gespeichert = localStorage.getItem(KEY_FEST);
        return gibtEs(gespeichert) ? gespeichert : null;
      }
      if (id === null) localStorage.removeItem(KEY_FEST);
      else if (gibtEs(id)) localStorage.setItem(KEY_FEST, id);
    } catch (e) { /* privater Modus */ }
    return gibtEs(id) ? id : null;
  }

  window.Abteilungen = {
    laden: laden,
    liste: liste,
    name: name,
    gibtEs: gibtEs,
    weiche: weiche,
    lesen: lesen,
    fest: fest,
    standard: function () { return DATEN.standard; },
    mitModell: function () { return DATEN.leiten_mit_modell; }
  };
})();
