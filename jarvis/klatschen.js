/* Zweimal klatschen, und Jarvis wacht auf.

   Zwei Teile, bewusst getrennt:

   Klatschen.erkenner()  entscheidet nur anhand von Lautstärkewerten, ob gerade
                         zweimal geklatscht wurde. Kein Mikrofon, keine
                         Browser-API — deshalb lässt sich das prüfen, ohne dass
                         jemand vor dem Rechner in die Hände klatschen muss.
   Klatschen.hoerer()    hängt das Mikrofon davor.

   Ehrliche Grenze: das läuft nur, solange die App offen und im Vordergrund
   ist. Ein Browser darf nicht im Hintergrund mithören — das kann nur ein
   Programm außerhalb des Browsers. */

(function () {
  'use strict';

  /* Ein Klatschen ist ein sehr kurzer, sehr lauter Ausschlag aus der Stille
     heraus. Zwei davon kurz hintereinander sind das Zeichen. Sprache erzeugt
     das kaum, eine zufallende Tür schon — deshalb ist das Ganze abschaltbar. */
  function erkenner(opt) {
    opt = opt || {};
    var LAUT = opt.laut === undefined ? 0.30 : opt.laut;        // ab hier gilt es als Knall
    var LEISE = opt.leise === undefined ? 0.10 : opt.leise;     // so leise muss es vorher sein
    var MIN = opt.min === undefined ? 120 : opt.min;            // ms — schneller klatscht niemand
    var MAX = opt.max === undefined ? 900 : opt.max;            // ms — langsamer sind es zwei Geräusche
    var SPERRE = opt.sperre === undefined ? 2000 : opt.sperre;  // ms Ruhe nach einem Treffer

    // null statt 0: eine Zeitmarke darf selbst 0 sein, und „noch nichts
    // gehört" muss davon unterscheidbar bleiben.
    var leiseGesehen = true;
    var ersterKnall = null;
    var letzterTreffer = null;

    return {
      /* wert: 0…1, jetzt: Millisekunden. Gibt true zurück, wenn genau jetzt
         das zweite Klatschen gefallen ist. */
      pegel: function (wert, jetzt) {
        if (letzterTreffer !== null && jetzt - letzterTreffer < SPERRE) {
          if (wert < LEISE) leiseGesehen = true;
          return false;
        }
        if (wert < LEISE) {
          leiseGesehen = true;
          return false;
        }
        if (wert < LAUT || !leiseGesehen) return false;

        // Ein Knall. Zählt er als zweiter?
        leiseGesehen = false;
        var abstand = jetzt - ersterKnall;
        if (ersterKnall !== null && abstand >= MIN && abstand <= MAX) {
          ersterKnall = null;
          letzterTreffer = jetzt;
          return true;
        }
        ersterKnall = jetzt;
        return false;
      },

      /* Nach einer Pause weiß niemand mehr, was vorher war. */
      zuruecksetzen: function () {
        leiseGesehen = true;
        ersterKnall = null;
        letzterTreffer = null;
      }
    };
  }

  /* Das Mikrofon davor. `beiKlatschen` wird gerufen, wenn es soweit ist. */
  function hoerer(beiKlatschen, opt) {
    var pruefer = erkenner(opt);
    var ctx = null;
    var spur = null;
    var analyse = null;
    var puffer = null;
    var takt = 0;
    var pausiert = false;

    function messen() {
      if (!analyse || pausiert) return;
      analyse.getByteTimeDomainData(puffer);
      var spitze = 0;
      for (var i = 0; i < puffer.length; i++) {
        var abweichung = Math.abs(puffer[i] - 128) / 128;
        if (abweichung > spitze) spitze = abweichung;
      }
      if (pruefer.pegel(spitze, Date.now())) beiKlatschen();
    }

    return {
      async start() {
        if (ctx) return true;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
        var strom;
        try {
          strom = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
          return false;   // kein Mikrofon oder abgelehnt
        }
        var Kontext = window.AudioContext || window.webkitAudioContext;
        if (!Kontext) {
          strom.getTracks().forEach(function (t) { t.stop(); });
          return false;
        }
        ctx = new Kontext();
        spur = strom;
        analyse = ctx.createAnalyser();
        analyse.fftSize = 2048;
        puffer = new Uint8Array(analyse.fftSize);
        ctx.createMediaStreamSource(strom).connect(analyse);
        takt = setInterval(messen, 25);
        return true;
      },

      stop() {
        clearInterval(takt);
        takt = 0;
        if (spur) spur.getTracks().forEach(function (t) { t.stop(); });
        if (ctx) { try { ctx.close(); } catch (e) { /* egal */ } }
        ctx = null;
        spur = null;
        analyse = null;
        pruefer.zuruecksetzen();
      },

      /* Während die Spracherkennung läuft, gehört das Mikrofon ihr. */
      pause(an) {
        pausiert = !!an;
        if (!an) pruefer.zuruecksetzen();
      },

      laeuft() { return !!ctx; }
    };
  }

  window.Klatschen = { erkenner: erkenner, hoerer: hoerer };
})();
