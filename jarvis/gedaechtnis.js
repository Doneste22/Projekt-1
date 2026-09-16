/* Das Gedächtnis — was Jarvis über Gespräche hinweg behält.

   Ein Assistent, der bei jeder Frage wieder bei null anfängt, ist ein
   Suchschlitz. Damit er weiß, dass Damaso mit 85 Franken die Stunde rechnet
   oder dass die Werkstatt in Wädenswil ist, braucht er ein Gedächtnis.

   Wo es liegt: im Browser, in localStorage. Kein Konto, kein Dienst, keine
   Datenbank, kein weiterer Schlüssel — und nichts davon liegt auf fremden
   Rechnern. Der Preis dafür ist ehrlich zu nennen: das Gedächtnis hängt an
   diesem einen Gerät und an diesem einen Browser. Wer die App-Daten löscht,
   löscht es mit.

   Wie es funktioniert, in vier Schritten:

     merken     Nach jeder Antwort sieht das billige Modell kurz nach, ob
                etwas Bleibendes gefallen ist, und schreibt es als Satz auf.
     marken     Jeder Satz bekommt Marken (#preis, #baustelle). Die sind die
                Fäden zwischen den Notizen.
     suchen     Vor jeder Frage werden die passenden Notizen herausgesucht —
                nach gemeinsamen Wörtern, Marken und Abteilung.
     verknüpfen Wer über einen Faden mit einem Treffer verbunden ist, kommt
                mit. So taucht zur Frage nach dem Preis auch die Notiz über
                den Kunden auf, in der das Wort „Preis" gar nicht vorkommt.

   Kein Vektor, kein Einbettungsmodell: bei ein paar hundert Notizen gewinnt
   die Suche über Wörter und Marken nichts dazu, kostet aber nichts. */

(function () {
  'use strict';

  var KEY = 'jarvis.gedaechtnis.v1';
  var MAX_NOTIZEN = 200;      // darüber fliegt die älteste, am wenigsten benutzte raus
  var MAX_LAENGE = 240;       // ein Satz, keine Abhandlung
  var MITGEBEN = 6;           // so viele Notizen gehen höchstens mit einer Frage mit

  /* Wörter, die in jedem zweiten Satz stehen und deshalb nichts unterscheiden. */
  var FUELLWORTE = ('der die das den dem des ein eine einen einem einer eines und oder aber ' +
    'ich du er sie es wir ihr mir mich dir dich ihm ihn uns euch sich ' +
    'ist sind war waren bin bist hat habe haben hatte wird werden wurde kann kannst können koennen ' +
    'nicht kein keine noch schon auch nur mal doch wenn dann also weil dass das ' +
    'für fuer mit von vom zum zur bei auf aus über ueber unter vor nach seit ohne gegen um ' +
    'wie was wer wo wann warum welche welcher wieviel viel mehr sehr gut ' +
    'damaso jarvis bitte danke').split(' ');

  function glatt(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  /* Die Wörter, auf die es ankommt: lang genug, kein Füllwort. */
  function kernworte(text) {
    var fuell = FUELLWORTE.map(glatt);
    return glatt(text).split(/[^a-z0-9]+/).filter(function (w) {
      return w.length >= 4 && fuell.indexOf(w) < 0;
    });
  }

  /* ---------- Ablage ---------- */

  function alle() {
    try {
      var roh = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (!Array.isArray(roh)) return [];
      return roh.filter(function (n) { return n && typeof n.text === 'string' && n.text.trim(); });
    } catch (e) {
      return [];
    }
  }

  function schreiben(notizen) {
    try { localStorage.setItem(KEY, JSON.stringify(notizen)); } catch (e) { /* voller Speicher */ }
  }

  function kuerzen(notizen) {
    if (notizen.length <= MAX_NOTIZEN) return notizen;
    /* Was rausfliegt: das Älteste, das am wenigsten gebraucht wurde. Eine
       Notiz, die oft in Antworten geholfen hat, überlebt ihr Alter. */
    var sortiert = notizen.slice().sort(function (a, b) {
      var wertA = (a.benutzt || 0) * 10 + (a.zeit || 0) / 86400000;
      var wertB = (b.benutzt || 0) * 10 + (b.zeit || 0) / 86400000;
      return wertB - wertA;
    });
    return sortiert.slice(0, MAX_NOTIZEN);
  }

  /* Legt eine Notiz an. Steht sie so ähnlich schon da, wird sie nur
     aufgefrischt — sonst steht nach zehn Gesprächen zehnmal dasselbe drin. */
  function merken(text, opt) {
    opt = opt || {};
    var sauber = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_LAENGE);
    if (sauber.length < 8) return null;

    var notizen = alle();
    var schluessel = glatt(sauber);
    for (var i = 0; i < notizen.length; i++) {
      if (glatt(notizen[i].text) === schluessel) {
        notizen[i].zeit = Date.now();
        if (opt.marken) notizen[i].marken = einmalig((notizen[i].marken || []).concat(opt.marken));
        schreiben(notizen);
        return notizen[i];
      }
    }

    var notiz = {
      id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      text: sauber,
      marken: einmalig(opt.marken || []),
      abteilung: opt.abteilung || '',
      zeit: Date.now(),
      benutzt: 0
    };
    notizen.push(notiz);
    schreiben(kuerzen(notizen));
    return notiz;
  }

  function einmalig(liste) {
    var gesehen = {};
    return (liste || []).map(function (m) {
      return glatt(m).replace(/[^a-z0-9]/g, '');
    }).filter(function (m) {
      if (!m || m.length < 2 || gesehen[m]) return false;
      gesehen[m] = true;
      return true;
    }).slice(0, 6);
  }

  function loeschen(id) {
    schreiben(alle().filter(function (n) { return n.id !== id; }));
  }

  function leeren() {
    try { localStorage.removeItem(KEY); } catch (e) { /* egal */ }
  }

  /* ---------- Heraussuchen ---------- */

  /* Punkte für eine Notiz gegenüber einer Frage. */
  function punkte(notiz, worte, abteilung) {
    var eigene = kernworte(notiz.text);
    var treffer = 0;
    worte.forEach(function (w) {
      for (var i = 0; i < eigene.length; i++) {
        // Wortanfang, damit „Preise" und „Preis" zusammenfinden.
        if (eigene[i].indexOf(w) === 0 || w.indexOf(eigene[i]) === 0) { treffer++; return; }
      }
    });

    var wert = treffer * 2;
    (notiz.marken || []).forEach(function (m) {
      if (worte.indexOf(m) >= 0) wert += 3;
    });

    /* Bis hierher zählt nur, was die Notiz mit der Frage zu tun hat. Ohne das
       ist sie unpassend, und daran ändern die Zugaben unten nichts: sie
       ordnen die passenden Notizen, sie machen keine passend. Sonst käme mit
       jeder Frage alles Frische mit — und das Gedächtnis wäre wieder nur ein
       langer Zettel. */
    if (!wert) return 0;

    if (abteilung && notiz.abteilung === abteilung) wert += 1;
    // Frisches wiegt etwas schwerer — was gestern besprochen wurde, ist meist
    // noch das Thema.
    if (notiz.zeit && Date.now() - notiz.zeit < 7 * 86400000) wert += 0.5;
    return wert;
  }

  /* Die Notizen, die mit einer Frage mitgehen sollen. */
  function passende(frage, abteilung, anzahl) {
    var grenze = anzahl || MITGEBEN;
    var notizen = alle();
    if (!notizen.length) return [];

    var worte = kernworte(frage);
    if (!worte.length) return [];

    var bewertet = notizen.map(function (n) { return { notiz: n, wert: punkte(n, worte, abteilung) }; })
      .filter(function (b) { return b.wert > 0; })
      .sort(function (a, b) { return b.wert - a.wert; });

    var gewaehlt = bewertet.slice(0, grenze).map(function (b) { return b.notiz; });

    /* Der Faden: was über eine gemeinsame Marke an einem Treffer hängt, kommt
       mit — auch wenn kein Wort der Frage darin vorkommt. */
    if (gewaehlt.length && gewaehlt.length < grenze) {
      var marken = [];
      gewaehlt.forEach(function (n) { marken = marken.concat(n.marken || []); });
      if (marken.length) {
        notizen.forEach(function (n) {
          if (gewaehlt.length >= grenze) return;
          if (gewaehlt.indexOf(n) >= 0) return;
          var haengtDran = (n.marken || []).some(function (m) { return marken.indexOf(m) >= 0; });
          if (haengtDran) gewaehlt.push(n);
        });
      }
    }

    return gewaehlt;
  }

  /* Zählt mit, welche Notizen wirklich geholfen haben — das entscheidet
     später, was beim Aufräumen stehen bleibt. */
  function benutzt(notizen) {
    if (!notizen || !notizen.length) return;
    var ids = notizen.map(function (n) { return n.id; });
    var alleN = alle();
    alleN.forEach(function (n) { if (ids.indexOf(n.id) >= 0) n.benutzt = (n.benutzt || 0) + 1; });
    schreiben(alleN);
  }

  /* ---------- Was das Modell zurückschreibt ---------- */

  /* Erwartet Zeilen der Form „- Satz #marke #marke", oder „nichts".
     Alles andere wird weggeworfen: was hier durchkommt, landet im
     Systemprompt der nächsten Frage. */
  function aufnehmen(antwort, abteilung) {
    var neu = [];
    String(antwort || '').split('\n').forEach(function (zeile) {
      if (neu.length >= 5) return;
      var text = zeile.replace(/^\s*[-*•]\s*/, '').trim();
      if (!text || /^nichts\b/i.test(text)) return;

      var marken = [];
      text = text.replace(/#([\p{L}\p{N}_-]{2,24})/gu, function (_, m) {
        marken.push(m);
        return '';
      }).replace(/\s+/g, ' ').trim();

      if (text.length < 8) return;
      var notiz = merken(text, { marken: marken, abteilung: abteilung });
      if (notiz) neu.push(notiz);
    });
    return neu;
  }

  window.Gedaechtnis = {
    alle: alle,
    merken: merken,
    loeschen: loeschen,
    leeren: leeren,
    passende: passende,
    benutzt: benutzt,
    aufnehmen: aufnehmen,
    kernworte: kernworte,
    MITGEBEN: MITGEBEN
  };
})();
