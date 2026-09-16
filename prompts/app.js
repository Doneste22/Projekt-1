/* Prompt-Werkstatt — alles, was die Seite an Bewegung braucht.
 *
 * Grundsatz: die Seite funktioniert auch ohne dieses Skript. Dann stehen in
 * den Aufträgen eben die eckigen Klammern statt der eigenen Angaben, und man
 * markiert den Text von Hand. Das Skript nimmt nur Arbeit ab.
 *
 * Gespeichert wird ausschließlich im Browser (localStorage). Nichts geht
 * hinaus — kein Server, kein Zählpixel, keine externe Datei.
 */

(function () {
  'use strict';

  var KEY_STATE = 'prompt-werkstatt.v1';

  var toastEl = document.getElementById('meldung');
  var toastTimer = null;

  /* ---------- Ablage ---------- */

  /* localStorage kann fehlen (privates Fenster, gesperrte Cookies). Dann läuft
     die Seite weiter, sie merkt sich nur nichts. */
  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(KEY_STATE)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveState() {
    try {
      localStorage.setItem(KEY_STATE, JSON.stringify(state));
    } catch (e) {
      /* Nicht speichern zu können ist kein Grund, die Seite anzuhalten. */
    }
  }

  var state = loadState();
  if (!state.answers) state.answers = {};
  if (!state.done) state.done = {};

  /* ---------- Meldung am unteren Rand ---------- */

  function toast(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.setAttribute('data-sichtbar', 'ja');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.removeAttribute('data-sichtbar');
    }, 2200);
  }

  /* ---------- Angaben in die Aufträge einsetzen ---------- */

  var inputs = Array.prototype.slice.call(document.querySelectorAll('input[data-ph]'));
  var slots = Array.prototype.slice.call(document.querySelectorAll('.auftrag .ph'));

  /* Der Text in der HTML-Datei ist der Standard ("[Thema des Kanals]"). Er
     wird einmal gesichert, damit er beim Leeren zurückkommt. */
  slots.forEach(function (slot) {
    slot.setAttribute('data-standard', slot.textContent);
  });

  function fill(name, value) {
    var clean = (value || '').trim();
    slots.forEach(function (slot) {
      if (slot.getAttribute('data-ph') !== name) return;
      if (clean) {
        slot.textContent = clean;
        slot.setAttribute('data-gefuellt', 'ja');
      } else {
        slot.textContent = slot.getAttribute('data-standard');
        slot.removeAttribute('data-gefuellt');
      }
    });
  }

  inputs.forEach(function (input) {
    var name = input.getAttribute('data-ph');
    if (state.answers[name]) input.value = state.answers[name];
    fill(name, input.value);

    input.addEventListener('input', function () {
      state.answers[name] = input.value;
      fill(name, input.value);
      saveState();
    });
  });

  var clearBtn = document.getElementById('leeren');
  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      inputs.forEach(function (input) {
        input.value = '';
        fill(input.getAttribute('data-ph'), '');
      });
      state.answers = {};
      saveState();
      toast('Angaben gelöscht');
      if (inputs[0]) inputs[0].focus();
    });
  }

  /* ---------- Lange Aufträge kürzen ---------- */

  /* Erst hier, nicht im CSS: ohne Skript soll der ganze Auftrag dastehen, denn
     dann gäbe es auch keinen Knopf zum Aufklappen. Gekürzt wird nur, was
     deutlich länger ist als der Rahmen — sonst blinkt ein "Ganz anzeigen" an
     einem Auftrag, bei dem es zwei Zeilen bringt. */
  var CLAMP_HEIGHT = 300;

  document.querySelectorAll('.karte').forEach(function (card) {
    var body = card.querySelector('.auftrag');
    if (!body || body.scrollHeight <= CLAMP_HEIGHT + 60) return;

    card.setAttribute('data-gekuerzt', 'ja');

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'mehr';
    toggle.textContent = 'Ganz anzeigen';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', body.id);
    body.insertAdjacentElement('afterend', toggle);

    toggle.addEventListener('click', function () {
      var open = card.getAttribute('data-gekuerzt') === 'ja';
      card.setAttribute('data-gekuerzt', open ? 'nein' : 'ja');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.textContent = open ? 'Wieder einklappen' : 'Ganz anzeigen';
      if (!open) card.scrollIntoView({ block: 'nearest' });
    });
  });

  /* ---------- Kopieren ---------- */

  /* navigator.clipboard gibt es nur über https und localhost. Auf einer Datei
     im Download-Ordner oder über http fehlt es — dann der alte Weg über ein
     kurz eingehängtes, ausgewähltes Textfeld. */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var helper = document.createElement('textarea');
      helper.value = text;
      helper.setAttribute('readonly', '');
      helper.style.position = 'fixed';
      helper.style.top = '-1000px';
      document.body.appendChild(helper);
      helper.select();
      var ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (e) {
        ok = false;
      }
      document.body.removeChild(helper);
      if (ok) { resolve(); } else { reject(new Error('Kopieren abgelehnt')); }
    });
  }

  /* Der Knopf sagt selbst, was passiert ist. Die Beschriftung wird gemerkt,
     damit mehrfaches Drücken sie nicht überschreibt. */
  function flash(button, mode, label) {
    var original = button.getAttribute('data-beschriftung') || button.textContent;
    button.setAttribute('data-beschriftung', original);
    button.setAttribute('data-zustand', mode);
    button.textContent = label;
    setTimeout(function () {
      button.textContent = original;
      button.removeAttribute('data-zustand');
    }, 1800);
  }

  function copyFor(button, text, message) {
    copyText(text).then(function () {
      flash(button, 'fertig', 'Kopiert');
      toast(message);
    }).catch(function () {
      flash(button, 'fehler', 'Ging nicht');
      toast('Kopieren hat nicht geklappt — Text von Hand markieren');
    });
  }

  document.querySelectorAll('[data-kopieren]').forEach(function (button) {
    button.addEventListener('click', function () {
      var source = document.getElementById(button.getAttribute('data-kopieren'));
      if (!source) return;
      /* textContent, nicht innerText: so kommt genau der Text heraus, der in
         der Datei steht — mit den eingesetzten Angaben und ohne Umbrüche, die
         nur vom Fensterrand kommen. */
      copyFor(button, source.textContent, 'Auftrag kopiert — in die KI einfügen');
    });
  });

  var copyAllBtn = document.getElementById('allesKopieren');
  if (copyAllBtn) {
    copyAllBtn.addEventListener('click', function () {
      var parts = [];
      document.querySelectorAll('.karte').forEach(function (card) {
        var body = card.querySelector('.auftrag');
        var title = card.querySelector('h2');
        if (!body || !title) return;
        var number = card.querySelector('.karte__nr');
        var heading = (number ? number.textContent + '. ' : '') + title.textContent;
        parts.push(heading + '\n' + new Array(heading.length + 1).join('=') + '\n\n' + body.textContent);
      });
      copyFor(copyAllBtn, parts.join('\n\n\n'), parts.length + ' Aufträge kopiert');
    });
  }

  /* ---------- Abgehakt ---------- */

  var checks = Array.prototype.slice.call(document.querySelectorAll('input[data-erledigt]'));

  function showProgress() {
    var label = document.getElementById('fortschritt');
    if (!label) return;
    var done = checks.filter(function (check) { return check.checked; }).length;
    label.textContent = done === 0
      ? 'Noch keiner der ' + checks.length + ' Schritte abgehakt'
      : done + ' von ' + checks.length + ' Schritten erledigt';
  }

  checks.forEach(function (check) {
    var number = check.getAttribute('data-erledigt');
    var card = check.closest('.karte');
    check.checked = state.done[number] === true;
    if (card) card.setAttribute('data-erledigt', check.checked ? 'ja' : 'nein');

    check.addEventListener('change', function () {
      state.done[number] = check.checked;
      if (card) card.setAttribute('data-erledigt', check.checked ? 'ja' : 'nein');
      saveState();
      showProgress();
    });
  });

  showProgress();
})();
