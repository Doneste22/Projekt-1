/* Wand für Wand — kleine Interaktionen, alles progressive enhancement. */
(function () {
  'use strict';

  /* ---------- Mobile Navigation ---------- */
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('hauptnav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var offen = nav.classList.toggle('offen');
      toggle.setAttribute('aria-expanded', String(offen));
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        nav.classList.remove('offen');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---------- Schichten-Diagramm: Liste und Zeichnung synchron hervorheben ---------- */
  var schichtSteuerung = document.querySelectorAll('[data-schicht]');
  function setzeSchicht(nr) {
    schichtSteuerung.forEach(function (el) {
      var aktiv = el.getAttribute('data-schicht') === nr;
      el.classList.toggle('aktiv', aktiv);
      if (el.tagName === 'BUTTON') el.setAttribute('aria-pressed', String(aktiv));
    });
    var svg = document.getElementById('aufbau-svg');
    if (!svg) return;
    svg.querySelectorAll('[data-layer]').forEach(function (g) {
      var an = !nr || g.getAttribute('data-layer') === nr;
      g.style.opacity = an ? '1' : '0.22';
    });
  }
  schichtSteuerung.forEach(function (el) {
    var nr = el.getAttribute('data-schicht');
    el.addEventListener('mouseenter', function () { setzeSchicht(nr); });
    el.addEventListener('focus', function () { setzeSchicht(nr); });
    el.addEventListener('click', function () { setzeSchicht(nr); });
  });
  var aufbauBereich = document.querySelector('.aufbau-interaktiv');
  if (aufbauBereich) {
    aufbauBereich.addEventListener('mouseleave', function () { setzeSchicht(null); });
  }

  /* ---------- Absorptionsdiagramm: Fadenkreuz und Tooltip ---------- */
  var chart = document.getElementById('absorption-chart');
  if (chart) {
    var tip = document.getElementById('absorption-tip');
    var bands = chart.querySelectorAll('.band-hit');
    var crosshair = chart.querySelector('.crosshair');
    var box = chart.closest('.diagramm');

    function zeige(hit) {
      var x = parseFloat(hit.getAttribute('data-x'));
      if (crosshair) {
        crosshair.setAttribute('x1', x); crosshair.setAttribute('x2', x);
        crosshair.style.opacity = '1';
      }
      chart.querySelectorAll('.punkt').forEach(function (p) {
        p.style.opacity = p.getAttribute('data-band') === hit.getAttribute('data-band') ? '1' : '0';
      });
      if (!tip) return;
      tip.innerHTML = hit.getAttribute('data-tip');
      tip.hidden = false;
      var rect = box.getBoundingClientRect();
      var hitRect = hit.getBoundingClientRect();
      var links = hitRect.left - rect.left + hitRect.width / 2;
      var maxLinks = rect.width - tip.offsetWidth - 12;
      tip.style.left = Math.max(12, Math.min(links - tip.offsetWidth / 2, maxLinks)) + 'px';
      tip.style.top = (hitRect.top - rect.top + 12) + 'px';
    }
    function verbergen() {
      if (crosshair) crosshair.style.opacity = '0';
      chart.querySelectorAll('.punkt').forEach(function (p) { p.style.opacity = '0'; });
      if (tip) tip.hidden = true;
    }
    bands.forEach(function (hit) {
      hit.addEventListener('mouseenter', function () { zeige(hit); });
      hit.addEventListener('focus', function () { zeige(hit); });
      hit.addEventListener('blur', verbergen);
    });
    chart.addEventListener('mouseleave', verbergen);
  }

  /* ---------- Newsletter-Formular: ehrliche Rückmeldung statt stiller Sackgasse ---------- */
  var signup = document.querySelector('form.signup');
  if (signup) {
    signup.addEventListener('submit', function (e) {
      e.preventDefault();
      var hinweis = signup.parentElement.querySelector('.form-hinweis');
      if (hinweis) {
        hinweis.textContent = 'Der Verteiler wird gerade eingerichtet — die Anmeldung ist noch nicht aktiv.';
        hinweis.style.color = '#C89B6A';
      }
    });
  }

  /* ---------- Anfrageformular: baut eine fertige E-Mail ----------
     Kein Backend, kein Formulardienst: der Browser öffnet das Mailprogramm
     des Besuchers. Damit verlässt kein Datensatz die Seite und die
     Datenschutzerklärung bleibt kurz. Die Zieladresse steht genau einmal
     im HTML — im Ausweichlink unter dem Knopf. */
  var anfrage = document.getElementById('anfrage-form');
  if (anfrage) {
    var leistungsfeld = document.getElementById('af-leistung');

    /* Die Knöpfe auf den Leistungskarten wählen die passende Zeile vor. */
    document.querySelectorAll('[data-leistung]').forEach(function (knopf) {
      knopf.addEventListener('click', function () {
        var wunsch = knopf.getAttribute('data-leistung');
        Array.prototype.forEach.call(leistungsfeld.options, function (opt) {
          if (opt.text.indexOf(wunsch) === 0) leistungsfeld.value = opt.value;
        });
      });
    });

    /* Die Zieladresse einmal beim Laden merken. Sie steht im Ausweichlink und
       muss dort unangetastet bleiben — Meldungen bekommen eine eigene Zeile. */
    var ausweich = document.querySelector('#anfrage-adresse a[href^="mailto:"]');
    var adresse = ausweich ? ausweich.getAttribute('href').replace('mailto:', '') : '';

    anfrage.addEventListener('submit', function (e) {
      e.preventDefault();
      var hinweis = document.getElementById('anfrage-status');
      var name = document.getElementById('af-name');

      if (!name.value.trim()) {
        name.focus();
        hinweis.textContent = 'Bitte tragen Sie noch einen Namen ein.';
        hinweis.style.color = '#A6472A';
        return;
      }

      var leistung = leistungsfeld.value;
      var text = [
        'Leistung: ' + leistung,
        'Name: ' + name.value.trim(),
        'Ort: ' + document.getElementById('af-ort').value.trim(),
        '',
        'Vorhaben:',
        document.getElementById('af-vorhaben').value.trim(),
        ''
      ].join('\n');

      window.location.href = 'mailto:' + adresse +
        '?subject=' + encodeURIComponent('Anfrage: ' + leistung) +
        '&body=' + encodeURIComponent(text);

      hinweis.textContent = 'Ihr E-Mail-Programm sollte sich jetzt öffnen. Passiert nichts, ' +
        'schreiben Sie bitte direkt an ' + adresse + '.';
      hinweis.style.color = '#C89B6A';
    });
  }
})();
