/* Jarvis — Oberfläche.
   Das Modell wird nie direkt aus dem Browser angesprochen: alle Anfragen laufen
   über /api/jarvis (Netlify-Function), die den API-Schlüssel serverseitig hält. */

(function () {
  'use strict';

  var API_URL = '/api/jarvis';
  var STIMME_URL = '/api/stimme';
  var WETTER_URL = 'https://api.open-meteo.com/v1/forecast';
  var KEY_MESSAGES = 'jarvis.messages.v1';
  var KEY_PASSCODE = 'jarvis.passcode.v1';
  var KEY_VOICE = 'jarvis.voice.v1';
  var KEY_INSTALL_HIDDEN = 'jarvis.install-hidden.v1';
  var KEY_TON = 'jarvis.ton.v1';
  var KEY_FREIHAND = 'jarvis.freihand.v1';
  var KEY_KLATSCHEN = 'jarvis.klatschen.v1';
  var KEY_GRUSS = 'jarvis.gruss.v1';
  var KEY_MERKEN = 'jarvis.merken.v1';
  var MAX_STORED = 200;
  var MAX_CONTEXT = 24;

  // Voreinstellung für den Fall, dass konfiguration.json fehlt oder kaputt ist.
  // Jarvis soll dann trotzdem laufen, nur eben ohne Wetter und mit dem
  // schlichten Ton.
  var KONFIG = {
    ort: null,
    morgen: { beim_start_gruessen: false, lied: '' },
    stimme: { an: true },
    gedaechtnis: { an: true, automatisch: true },
    ton: 'sachlich',
    toene: { sachlich: { name: 'Sachlich' } }
  };

  var app = document.getElementById('app');
  var chatEl = document.getElementById('chat');
  var inputEl = document.getElementById('input');
  var sendBtn = document.getElementById('sendBtn');
  var micBtn = document.getElementById('micBtn');
  var voiceOutBtn = document.getElementById('voiceOutBtn');
  var resetBtn = document.getElementById('resetBtn');
  var stateLabel = document.getElementById('stateLabel');
  var installBar = document.getElementById('installBar');
  var installBtn = document.getElementById('installBtn');
  var installClose = document.getElementById('installClose');
  var installText = document.getElementById('installText');
  var warnBar = document.getElementById('warnBar');
  var warnText = document.getElementById('warnText');
  var warnClose = document.getElementById('warnClose');
  var freihandBtn = document.getElementById('freihandBtn');
  var menuBtn = document.getElementById('menuBtn');
  var sheet = document.getElementById('sheet');
  var sheetClose = document.getElementById('sheetClose');
  var tonWahl = document.getElementById('tonWahl');
  var klatschBox = document.getElementById('klatschBox');
  var grussBtn = document.getElementById('grussBtn');
  var stimmeInfo = document.getElementById('stimmeInfo');
  var abteilungBtn = document.getElementById('abteilungBtn');
  var abteilungWahl = document.getElementById('abteilungWahl');
  var notizenListe = document.getElementById('notizenListe');
  var gedaechtnisInfo = document.getElementById('gedaechtnisInfo');
  var notizNeuBtn = document.getElementById('notizNeuBtn');
  var notizenLeerenBtn = document.getElementById('notizenLeerenBtn');
  var merkBox = document.getElementById('merkBox');
  var aufbau = document.getElementById('aufbau');
  var gate = document.getElementById('gate');
  var gateForm = document.getElementById('gateForm');
  var gateInput = document.getElementById('gateInput');
  var gateText = document.getElementById('gateText');
  var GATE_DEFAULT = gateText.textContent;

  var messages = [];        // { role, content, local? }
  var voiceOutput = false;
  var busy = false;
  var controller = null;    // AbortController der laufenden Anfrage
  var listening = false;
  var deferredInstall = null;
  var freihand = false;     // hört dauerhaft auf das Weckwort „Jarvis"
  var serverStimme = false; // hat der Server einen ElevenLabs-Schlüssel?
  var serverLokal = false;  // läuft der Server auf Damasos Gerät (dann gibt es Werkzeuge)?
  var stimmeDefekt = false; // in dieser Sitzung schon einmal fehlgeschlagen
  var klatschHoerer = null;
  var abteilungJetzt = '';      // welche Abteilung die laufende Frage bearbeitet
  var abteilungGezeigt = '';    // welche zuletzt im Verlauf angeschrieben wurde
  var erinnerungenJetzt = [];   // die Notizen, die mit dieser Frage mitgehen
  var leitet = false;           // die Weiche läuft gerade

  /* ---------- kleiner, sicherer Speicher ---------- */

  function store(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* privater Modus, voller Speicher */ }
  }
  function read(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function drop(key) {
    try { localStorage.removeItem(key); } catch (e) { /* egal */ }
  }

  function saveMessages() {
    store(KEY_MESSAGES, JSON.stringify(messages.slice(-MAX_STORED)));
  }

  function loadMessages() {
    var raw = read(KEY_MESSAGES);
    if (!raw) return false;
    try {
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || !parsed.length) return false;
      messages = parsed.filter(function (m) {
        return m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string';
      });
      messages.forEach(function (m) { renderMessage(m.role, m.content); });
      return messages.length > 0;
    } catch (e) {
      return false;
    }
  }

  /* ---------- Konfiguration ---------- */
  /* jarvis/konfiguration.json ist das eine Blatt, auf dem steht, wie Jarvis
     sein soll: Ort fürs Wetter, Stimme, Ton, Morgenlied. Keine Schlüssel —
     die stehen serverseitig in den Umgebungsvariablen. */

  async function ladeKonfig() {
    try {
      var antwort = await fetch('konfiguration.json', { cache: 'no-cache' });
      if (!antwort.ok) return;
      var gelesen = await antwort.json();
      KONFIG = Object.assign(KONFIG, gelesen);
      KONFIG.morgen = Object.assign({}, KONFIG.morgen, gelesen.morgen);
      KONFIG.stimme = Object.assign({}, KONFIG.stimme, gelesen.stimme);
      KONFIG.gedaechtnis = Object.assign({}, KONFIG.gedaechtnis, gelesen.gedaechtnis);
    } catch (e) {
      // Ohne Konfiguration läuft Jarvis weiter, nur schlichter.
    }
  }

  /* Die Abteilungen stehen in einer eigenen Datei — jede bringt Weckworte,
     einen Kontext und ihre Werkzeuge mit. Fehlt die Datei, arbeitet Jarvis
     wie vorher: eine Abteilung, keine Weiche. */
  async function ladeAbteilungen() {
    try {
      var antwort = await fetch('abteilungen.json', { cache: 'no-cache' });
      if (!antwort.ok) return;
      window.Abteilungen.laden(await antwort.json());
    } catch (e) {
      // Ohne Abteilungen läuft Jarvis weiter, nur ungeteilt.
    }
  }

  /* Welcher Ton gilt gerade: was Damaso zuletzt gewählt hat, sonst der aus der
     Konfiguration. Der Server glaubt das nicht ungeprüft — dort muss der Name
     in der Konfiguration stehen, sonst nimmt er den Standard. */
  function tonAktuell() {
    var gewaehlt = read(KEY_TON);
    if (gewaehlt && KONFIG.toene && KONFIG.toene[gewaehlt]) return gewaehlt;
    return KONFIG.ton;
  }

  /* ---------- Zustand ---------- */

  var LABELS = {
    idle: 'bereit',
    listening: 'hört zu',
    thinking: 'denkt nach',
    speaking: 'spricht',
    offline: 'offline'
  };

  function setState(name) {
    if (!navigator.onLine && name === 'idle') name = 'offline';
    app.setAttribute('data-state', name);
    stateLabel.textContent = LABELS[name] || name;
  }

  function setBusy(value) {
    busy = value;
    sendBtn.classList.toggle('stop', value);
    sendBtn.title = value ? 'Abbrechen' : 'Senden';
    sendBtn.setAttribute('aria-label', value ? 'Antwort abbrechen' : 'Senden');
  }

  /* ---------- Text ausgeben ---------- */

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Bewusst kleiner Markdown-Satz: fett, kursiv, Code, Listen, Zwischentitel,
  // Links. Der Text wird zuerst maskiert, es kann also kein HTML durchrutschen.
  function renderMarkdown(text) {
    var blocks = escapeHtml(text).split(/```/);
    var html = '';
    blocks.forEach(function (block, index) {
      if (index % 2 === 1) {
        html += '<pre><code>' + block.replace(/^\n/, '') + '</code></pre>';
        return;
      }
      html += renderProse(block);
    });
    return html;
  }

  function inline(text) {
    return text
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  }

  function renderProse(text) {
    var lines = text.split('\n');
    var html = '';
    var list = null;   // 'ul' | 'ol' | null
    var para = [];

    function flushPara() {
      if (!para.length) return;
      html += '<p>' + inline(para.join('<br>')) + '</p>';
      para = [];
    }
    function flushList() {
      if (!list) return;
      html += '</' + list + '>';
      list = null;
    }

    lines.forEach(function (line) {
      var bullet = line.match(/^\s*[-*•]\s+(.*)$/);
      var number = line.match(/^\s*\d+[.)]\s+(.*)$/);
      var heading = line.match(/^\s*#{1,6}\s+(.*)$/);

      if (bullet || number) {
        flushPara();
        var want = bullet ? 'ul' : 'ol';
        if (list !== want) { flushList(); html += '<' + want + '>'; list = want; }
        html += '<li>' + inline((bullet || number)[1]) + '</li>';
        return;
      }
      flushList();
      if (heading) {
        flushPara();
        html += '<h3>' + inline(heading[1]) + '</h3>';
        return;
      }
      if (!line.trim()) { flushPara(); return; }
      para.push(line);
    });

    flushList();
    flushPara();
    return html;
  }

  function isNearBottom() {
    return chatEl.scrollHeight - chatEl.scrollTop - chatEl.clientHeight < 90;
  }

  function scrollToBottom(force) {
    if (force || isNearBottom()) chatEl.scrollTop = chatEl.scrollHeight;
  }

  function renderMessage(role, text) {
    var stick = isNearBottom();
    var div = document.createElement('div');
    div.className = 'msg ' + role;
    if (role === 'assistant') {
      div.innerHTML = renderMarkdown(text);
    } else {
      div.textContent = text;
    }
    chatEl.appendChild(div);
    scrollToBottom(stick);
    return div;
  }

  /* `aktion` ist entweder true (dann „Nochmal versuchen"), oder
     { text, tun } für einen eigenen Knopf. */
  function renderError(text, aktion, kind) {
    var div = document.createElement('div');
    div.className = 'msg ' + (kind || 'error');
    div.setAttribute('role', 'alert');
    var p = document.createElement('span');
    p.textContent = text;
    div.appendChild(p);
    if (aktion) {
      var eigen = typeof aktion === 'object';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = eigen ? aktion.text : 'Nochmal versuchen';
      btn.addEventListener('click', function () {
        div.remove();
        if (eigen) aktion.tun(); else ask();
      });
      div.appendChild(btn);
    }
    chatEl.appendChild(div);
    scrollToBottom(true);
  }

  /* Eine Antwort, die unterwegs abgerissen ist, noch einmal von vorn zu
     verlangen, hilft nicht: sie reißt an derselben Stelle wieder ab. Was
     hilft, ist weiterschreiben zu lassen — das Stück steht ja schon da. */
  function weiterschreiben() {
    var text = 'Schreib bitte genau da weiter, wo du aufgehört hast. Ohne Einleitung, ohne Wiederholung.';
    messages.push({ role: 'user', content: text });
    renderMessage('user', text);
    saveMessages();
    scrollToBottom(true);
    ask();
  }

  /* ---------- Vorlesen ---------- */
  /* Jarvis hat zwei Stimmen. Erste Wahl ist die von ElevenLabs — die klingt
     wie ein Mensch, kostet aber Kontingent (10.000 Zeichen im Monat sind
     gratis) und braucht Netz. Geht die nicht, redet die eingebaute Stimme des
     Browsers weiter: die klingt nach Automat, ist dafür immer da.

     Die Stücke werden satzweise abgeholt und der Reihe nach abgespielt, damit
     Jarvis schon spricht, während der Rest der Antwort noch läuft. */

  var speechBuffer = '';
  var stimmeLaeuft = 0;        // wie viele Stücke gerade sprechen oder warten
  var stimmeMarke = 0;         // hochzählen lässt alles Laufende verfallen
  var stimmeKette = Promise.resolve();
  var audioEl = null;
  var tonGesperrt = false;     // Browser lässt Ton erst nach einer Berührung zu

  function plainText(text) {
    return text
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[`*#_>]/g, '')
      .replace(/^\s*[-•]\s+/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function pickVoice() {
    if (!('speechSynthesis' in window)) return null;
    var voices = window.speechSynthesis.getVoices() || [];
    for (var i = 0; i < voices.length; i++) {
      if (voices[i].lang && voices[i].lang.toLowerCase().indexOf('de') === 0) return voices[i];
    }
    return null;
  }

  // Die eingebaute Stimme. Das Versprechen ist erfüllt, wenn sie fertig ist.
  function browserStimme(text) {
    return new Promise(function (fertig) {
      if (!('speechSynthesis' in window)) return fertig();
      try {
        var u = new SpeechSynthesisUtterance(text);
        var voice = pickVoice();
        if (voice) u.voice = voice;
        u.lang = voice ? voice.lang : 'de-DE';
        u.rate = 1.02;
        u.onend = u.onerror = function () { fertig(); };
        window.speechSynthesis.speak(u);
      } catch (e) { fertig(); }
    });
  }

  // ElevenLabs über den eigenen Endpunkt — der Schlüssel bleibt auf dem Server.
  async function holeStimme(text) {
    var headers = { 'Content-Type': 'application/json' };
    var code = read(KEY_PASSCODE);
    if (code) headers['X-Jarvis-Passcode'] = code;

    var antwort = await fetch(STIMME_URL, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ text: text })
    });
    if (!antwort.ok) {
      var grund = '';
      try { grund = (await antwort.json()).error || ''; } catch (e) { /* kein JSON */ }
      throw new Error(grund || ('Status ' + antwort.status));
    }
    return URL.createObjectURL(await antwort.blob());
  }

  function spieleAb(url, marke) {
    return new Promise(function (fertig) {
      var el = new Audio(url);
      var erledigt = false;
      function aufraeumen() {
        if (erledigt) return;
        erledigt = true;
        URL.revokeObjectURL(url);
        if (audioEl === el) audioEl = null;
        fertig();
      }
      el.addEventListener('ended', aufraeumen);
      el.addEventListener('error', aufraeumen);
      if (marke !== stimmeMarke) return aufraeumen();
      audioEl = el;
      var versuch = el.play();
      if (versuch && versuch.catch) {
        versuch.catch(function () {
          // Kein Fehler, sondern eine Regel: ohne vorherige Berührung der Seite
          // darf ein Browser keinen Ton abspielen.
          if (!tonGesperrt) {
            tonGesperrt = true;
            showWarning('Einmal irgendwo tippen — vorher lässt der Browser Jarvis nicht sprechen.');
          }
          aufraeumen();
        });
      }
    });
  }

  /* Ein Stück Text sprechen. Die Stücke stehen in einer Kette, damit sie
     nacheinander kommen und nicht durcheinander. */
  function sprich(text) {
    var clean = plainText(text);
    if (!clean || !voiceOutput) return;

    var marke = stimmeMarke;
    stimmeLaeuft++;
    setState('speaking');

    stimmeKette = stimmeKette.then(function () {
      if (marke !== stimmeMarke) return;
      if (!serverStimme || stimmeDefekt || KONFIG.stimme.an === false) return browserStimme(clean);
      return holeStimme(clean).then(function (url) {
        return spieleAb(url, marke);
      }).catch(function (err) {
        // Einmal sagen, was los ist, dann still auf die Browserstimme umsteigen.
        if (!stimmeDefekt) {
          stimmeDefekt = true;
          showWarning(err.message + ' Jarvis spricht weiter mit der Stimme des Browsers.');
        }
        if (marke !== stimmeMarke) return;
        return browserStimme(clean);
      });
    }).then(function () {
      stimmeLaeuft = Math.max(0, stimmeLaeuft - 1);
      if (!stimmeLaeuft && !busy) setState('idle');
    });
  }

  // Satzweise vorlesen, damit Jarvis schon spricht, während der Rest noch läuft.
  function feedSpeech(chunk, flush) {
    if (!voiceOutput) return;
    speechBuffer += chunk;
    var match;
    while ((match = speechBuffer.match(/^[\s\S]*?[.!?:…]["')]?\s/))) {
      sprich(match[0]);
      speechBuffer = speechBuffer.slice(match[0].length);
    }
    if (flush) {
      sprich(speechBuffer);
      speechBuffer = '';
    }
  }

  function stopSpeech() {
    speechBuffer = '';
    stimmeLaeuft = 0;
    stimmeMarke++;                    // alles Wartende verfällt
    stimmeKette = Promise.resolve();
    if (audioEl) {
      try { audioEl.pause(); } catch (e) { /* egal */ }
      audioEl = null;
    }
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch (e) { /* egal */ }
    }
  }

  /* ---------- Weiche und Gedächtnis ---------- */
  /* Die beiden Schichten zwischen „Damaso tippt" und „Jarvis antwortet":

       leiten   Welche Abteilung bearbeitet das? Erst die Weckworte (kostet
                nichts), und nur wenn die nichts Eindeutiges ergeben, ein
                kurzer Griff zum billigen Modell.
       merken   Was aus dem Austausch ist in Wochen noch wahr? Läuft danach,
                im Hintergrund, ebenfalls auf dem billigen Modell.

     Beide dürfen scheitern, ohne dass das Gespräch davon etwas mitbekommt:
     eine Weiche, die nicht antwortet, nimmt die Standardabteilung, und ein
     Gedächtnis, das nicht antwortet, merkt sich diesmal eben nichts. */

  /* Eine einzelne kurze Frage ans billige Modell. Sammelt den Text ein und
     gibt ihn zurück — kein Einfluss auf die Oberfläche, kein Vorlesen. */
  function kurzfrage(modus, text, frist) {
    var abbruch = new AbortController();
    var wecker = setTimeout(function () { abbruch.abort(); }, frist || 6000);
    var headers = { 'Content-Type': 'application/json' };
    var code = read(KEY_PASSCODE);
    if (code) headers['X-Jarvis-Passcode'] = code;

    return fetch(API_URL, {
      method: 'POST',
      headers: headers,
      signal: abbruch.signal,
      body: JSON.stringify({ messages: [{ role: 'user', content: text }], modus: modus })
    }).then(function (antwort) {
      if (!antwort.ok || !antwort.body) throw new Error('Kurzfrage abgelehnt: ' + antwort.status);
      var gesammelt = '';
      return readStream(antwort.body, function (ereignis, daten) {
        if (ereignis === 'content_block_delta' && daten.delta && daten.delta.type === 'text_delta') {
          gesammelt += daten.delta.text;
        }
      }).then(function () { return gesammelt; });
    }).then(function (ergebnis) {
      clearTimeout(wecker);
      return ergebnis;
    }, function (fehler) {
      clearTimeout(wecker);
      throw fehler;
    });
  }

  function abteilungAnzeigen() {
    var fest = window.Abteilungen.fest();
    abteilungBtn.textContent = window.Abteilungen.name(abteilungJetzt || fest || window.Abteilungen.standard());
    abteilungBtn.dataset.fest = fest ? '1' : '0';
    abteilungBtn.title = fest
      ? 'Abteilung „' + window.Abteilungen.name(fest) + '" ist festgehalten'
      : 'Abteilung — Jarvis wählt selbst';
  }

  /* Welche Abteilung bearbeitet diese Frage? */
  function leiten(text) {
    var fest = window.Abteilungen.fest();
    if (fest) return Promise.resolve(fest);

    var geraten = window.Abteilungen.weiche(text);
    if (geraten.sicher || !window.Abteilungen.mitModell() || !navigator.onLine) {
      return Promise.resolve(geraten.abteilung);
    }
    return kurzfrage('leiten', text, 5000).then(function (antwort) {
      return antwort ? window.Abteilungen.lesen(antwort) : geraten.abteilung;
    }, function () {
      return geraten.abteilung;      // Weiche klemmt: dann eben die Standardabteilung
    });
  }

  /* Vor dem Senden: Abteilung bestimmen, passende Notizen heraussuchen. */
  function vorbereiten(text) {
    return leiten(text).then(function (abteilung) {
      abteilungJetzt = abteilung;
      abteilungAnzeigen();
      erinnerungenJetzt = gedaechtnisAn() ? window.Gedaechtnis.passende(text, abteilung) : [];
    });
  }

  function gedaechtnisAn() {
    return KONFIG.gedaechtnis.an !== false;
  }

  function merkenAn() {
    if (!gedaechtnisAn()) return false;
    var gespeichert = read(KEY_MERKEN);
    if (gespeichert === '0') return false;
    if (gespeichert === '1') return true;
    return KONFIG.gedaechtnis.automatisch !== false;
  }

  /* Nach der Antwort: das billige Modell einmal nachsehen lassen, was bleibt.
     `zeigen` schreibt das Ergebnis in die Blase, zu der es gehört. */
  function merkenLassen(frage, antwort, abteilung, zeigen) {
    if (!merkenAn() || !navigator.onLine || !frage || !antwort) return;

    var austausch = ('Damaso: ' + frage + '\n\nJarvis: ' + antwort).slice(0, 6000);
    kurzfrage('merken', austausch, 20000).then(function (text) {
      var neu = window.Gedaechtnis.aufnehmen(text, abteilung);
      if (!neu.length) return;
      gedaechtnisAnzeigen();
      if (zeigen) zeigen(neu);
    }, function () {
      // Das Gedächtnis darf schweigen. Es ist kein Fehler, den Damaso sehen muss.
    });
  }

  /* ---------- Anfrage ans Modell ---------- */

  function apiMessages() {
    var history = messages.filter(function (m) { return !m.local; }).slice(-MAX_CONTEXT);
    while (history.length && history[0].role !== 'user') history.shift();
    return history.map(function (m) { return { role: m.role, content: m.content }; });
  }

  function showWarning(text) {
    warnText.textContent = text;
    warnBar.hidden = false;
  }

  // Was Jarvis gerade tut — in Worten, die Damaso etwas sagen.
  var WERKZEUG_NAMEN = {
    speicher_uebersicht: 'sieht den Speicher an',
    ordner_lesen: 'liest den Ordner',
    dateien_suchen: 'sucht Dateien',
    aufraeumen_pruefen: 'prüft, was doppelt ist',
    aufraeumen_ausfuehren: 'räumt auf',
    grenze: 'abgebrochen'
  };

  // Fehler, die mitten im Strom kommen, meldet die Modell-API selbst.
  function apiErrorText(type) {
    if (type === 'overloaded_error' || type === 'rate_limit_error') {
      return 'Das Modell ist gerade ausgelastet. Gleich nochmal versuchen.';
    }
    if (type === 'invalid_request_error') {
      return 'Die Anfrage wurde abgelehnt. Lösch den Verlauf und versuch es neu.';
    }
    return 'Das Modell hat die Antwort abgebrochen. Versuch es nochmal.';
  }

  function errorText(status, message) {
    if (status === 401) return 'Der Zugangscode stimmt nicht.';
    if (status === 429) return 'Zu viele Anfragen — kurz warten und nochmal senden.';
    if (status === 503) return message || 'Der Server hat noch keinen API-Schlüssel.';
    if (!navigator.onLine) return 'Keine Verbindung. Die Antwort braucht Netz.';
    return message || 'Da ist etwas schiefgelaufen. Versuch es nochmal.';
  }

  async function ask() {
    var payload = apiMessages();
    if (!payload.length) return;

    var frage = payload[payload.length - 1].content;
    var mitgegeben = erinnerungenJetzt;      // für diese Antwort festgehalten
    var abteilung = abteilungJetzt || window.Abteilungen.standard();

    controller = new AbortController();
    setBusy(true);
    setState('thinking');

    var bubble = null;
    var werkzeugTeil = null;
    var textTeil = null;
    var answer = '';
    var finished = false;   // erst message_stop macht eine Antwort vollständig
    var stopReason = null;

    // Die Blase hat zwei Teile: oben was Jarvis anfasst, darunter was er sagt.
    // Beides getrennt, damit der laufende Text die Werkzeugzeilen nicht
    // überschreibt.
    function blaseSicherstellen() {
      if (bubble) return;
      bubble = renderMessage('assistant', '');
      bubble.innerHTML = '';
      werkzeugTeil = document.createElement('div');
      werkzeugTeil.className = 'msg__werkzeuge';
      textTeil = document.createElement('div');
      textTeil.className = 'msg__text';
      bubble.appendChild(werkzeugTeil);
      bubble.appendChild(textTeil);

      // Wechselt die Abteilung, steht das über der Antwort. Bleibt sie
      // dieselbe, wäre die Zeile bei jeder Antwort nur Lärm.
      if (abteilung !== abteilungGezeigt) {
        var zeile = document.createElement('div');
        zeile.className = 'werkzeug abteilung';
        zeile.textContent = 'Abteilung ' + window.Abteilungen.name(abteilung);
        werkzeugTeil.appendChild(zeile);
        abteilungGezeigt = abteilung;
      }
    }

    // Was Jarvis sich aus dieser Antwort gemerkt hat — leise, in derselben
    // Zeile wie die Werkzeuge.
    function gemerktZeigen(neu) {
      if (!bubble || !bubble.isConnected || !werkzeugTeil) return;
      var stick = isNearBottom();
      var zeile = document.createElement('div');
      zeile.className = 'werkzeug fertig';
      zeile.textContent = neu.length === 1 ? 'gemerkt: ' + neu[0].text : 'gemerkt: ' + neu.length + ' Notizen';
      werkzeugTeil.appendChild(zeile);
      scrollToBottom(stick);
    }

    function append(text) {
      var neu = !bubble;
      blaseSicherstellen();
      if (neu) {
        bubble.classList.add('streaming');
        setState('speaking');   // das Gesicht redet mit, sobald die Antwort läuft
      }
      var stick = isNearBottom();
      answer += text;
      textTeil.innerHTML = renderMarkdown(answer);
      scrollToBottom(stick);
      feedSpeech(text, false);
    }

    function werkzeugZeigen(data) {
      blaseSicherstellen();
      var stick = isNearBottom();
      var name = WERKZEUG_NAMEN[data.name] || data.name;
      if (data.status === 'laeuft') {
        var zeile = document.createElement('div');
        zeile.className = 'werkzeug laeuft';
        zeile.dataset.werkzeug = data.name;
        zeile.textContent = name + ' …';
        werkzeugTeil.appendChild(zeile);
      } else {
        var offen = werkzeugTeil.querySelector('.werkzeug.laeuft[data-werkzeug="' + data.name + '"]');
        if (!offen) {
          offen = document.createElement('div');
          offen.className = 'werkzeug laeuft';
          werkzeugTeil.appendChild(offen);
        }
        offen.className = 'werkzeug ' + (data.fehler ? 'fehler' : 'fertig');
        offen.textContent = data.text || name;
      }
      scrollToBottom(stick);
    }

    try {
      var headers = { 'Content-Type': 'application/json' };
      var code = read(KEY_PASSCODE);
      if (code) headers['X-Jarvis-Passcode'] = code;

      var response = await fetch(API_URL, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          messages: payload,
          ton: tonAktuell(),
          abteilung: abteilung,
          // Nur der Text geht mit; Marken und Zählerstand bleiben hier.
          erinnerungen: mitgegeben.map(function (n) { return n.text; })
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        var detail = '';
        try { detail = (await response.json()).error || ''; } catch (e) { /* kein JSON */ }
        if (response.status === 401) {
          // Beim ersten Mal war noch gar kein Code hinterlegt — dann ist die
          // Abfrage die Antwort, keine Fehlermeldung.
          openGate(code ? 'Der Code stimmt nicht. Versuch es nochmal.' : null);
          drop(KEY_PASSCODE);
          throw Object.assign(new Error(detail), { status: response.status, handled: true });
        }
        throw Object.assign(new Error(detail), { status: response.status });
      }

      // Der Server sagt in der Kopfzeile, ob er eine echte Stimme hat — und ob
      // er auf Damasos eigenem Gerät läuft. Nur dort gibt es Werkzeuge.
      serverStimme = response.headers.get('x-jarvis-stimme') === '1';
      serverLokal = response.headers.get('x-jarvis-lokal') === '1';
      aufbauAnzeigen();

      if (response.headers.get('x-jarvis-unprotected') === '1') {
        showWarning(response.headers.get('x-jarvis-lokal') === '1'
          ? 'Dieser Jarvis läuft ohne Zugangscode. Im WLAN käme jeder dran — starte den Server mit JARVIS_PASSCODE.'
          : 'Dieser Jarvis ist ohne Zugangscode erreichbar. Setz JARVIS_PASSCODE in den Netlify-Variablen.');
      }

      // Der Server reicht den Strom der Modell-API unverändert durch (siehe
      // server/core.mjs), ausgewertet wird er hier.
      await readStream(response.body, function (event, data) {
        if (event === 'content_block_delta') {
          if (data.delta && data.delta.type === 'text_delta') append(data.delta.text);
        } else if (event === 'message_delta') {
          if (data.delta && data.delta.stop_reason) stopReason = data.delta.stop_reason;
        } else if (event === 'message_stop') {
          finished = true;
        } else if (event === 'werkzeug') {
          werkzeugZeigen(data);
        } else if (event === 'error') {
          var info = data.error || {};
          // Der lokale Server schreibt seine Fehler schon auf Deutsch.
          var text = info.type === 'jarvis_fehler' && info.message ? info.message : apiErrorText(info.type);
          throw Object.assign(new Error(text), { status: 500 });
        }
      });

      if (answer.trim()) {
        messages.push({ role: 'assistant', content: answer });
        saveMessages();
        feedSpeech('', true);
        // Welche Notizen dabei waren, zählt für später: was oft hilft, bleibt
        // im Gedächtnis stehen, wenn es einmal eng wird.
        window.Gedaechtnis.benutzt(mitgegeben);
        merkenLassen(frage, answer, abteilung, gemerktZeigen);
        if (!finished) {
          // Ohne message_stop ist die Verbindung unterwegs abgerissen. Das Stück
          // bleibt stehen, aber es muss dranstehen — sonst liest sich eine halbe
          // Antwort wie eine ganze.
          //
          // Beobachtet an der veröffentlichten Seite: sehr lange Antworten
          // werden nach rund einer Minute abgeschnitten. Deshalb hier nicht
          // „Nochmal versuchen" — das liefe in dieselbe Grenze —, sondern
          // weiterschreiben lassen.
          renderError('Die Antwort ist unvollständig — sie war zu lang für eine Übertragung.',
            { text: 'Weiterschreiben', tun: weiterschreiben });
        } else if (stopReason === 'max_tokens') {
          renderError('Die Antwort war zu lang und ist hier zu Ende.',
            { text: 'Weiterschreiben', tun: weiterschreiben }, 'note');
        }
      } else if (bubble) {
        if (stopReason === 'refusal') {
          bubble.remove();
          renderError('Dazu kann ich nichts sagen. Frag mich etwas anderes.', false, 'note');
        } else {
          // Werkzeugzeilen stehen lassen — sie zeigen, wie weit er gekommen ist.
          if (!werkzeugTeil || !werkzeugTeil.children.length) bubble.remove();
          renderError('Jarvis hat nichts geantwortet. Versuch es nochmal.', true);
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        // Abgebrochen: das Bruchstück bleibt stehen, damit nichts verloren geht.
        if (answer.trim()) {
          messages.push({ role: 'assistant', content: answer });
          saveMessages();
        } else if (bubble) {
          bubble.remove();
        }
      } else {
        if (bubble && !answer.trim()) bubble.remove();
        // Die Code-Abfrage steht schon auf dem Schirm; eine rote Blase dazu
        // wäre nur Lärm.
        if (!err.handled) renderError(errorText(err.status, err.message), true);
      }
    } finally {
      if (bubble) bubble.classList.remove('streaming');
      controller = null;
      setBusy(false);
      if (!stimmeLaeuft) setState('idle');
    }
  }

  // Server-Sent-Events aus dem Antwortstrom lesen.
  async function readStream(body, onEvent) {
    var reader = body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';

    while (true) {
      var step = await reader.read();
      if (step.done) break;
      buffer += decoder.decode(step.value, { stream: true });

      var parts = buffer.split('\n\n');
      buffer = parts.pop();

      for (var i = 0; i < parts.length; i++) {
        var name = 'message';
        var payload = '';
        parts[i].split('\n').forEach(function (line) {
          if (line.indexOf('event:') === 0) name = line.slice(6).trim();
          else if (line.indexOf('data:') === 0) payload += line.slice(5).trim();
        });
        if (!payload) continue;
        try { onEvent(name, JSON.parse(payload)); } catch (e) {
          if (e instanceof SyntaxError) continue;
          throw e;
        }
      }
    }
  }

  /* ---------- Senden ---------- */

  function send() {
    if (busy) {
      if (controller) controller.abort();
      stopSpeech();
      return;
    }
    if (leitet) return;          // die Weiche läuft schon, zweimal senden hilft nicht
    var text = inputEl.value.trim();
    if (!text) return;

    inputEl.value = '';
    inputEl.style.height = 'auto';
    stopSpeech();

    messages.push({ role: 'user', content: text });
    renderMessage('user', text);
    saveMessages();
    scrollToBottom(true);

    /* Zwischen Absenden und Frage liegt die Weiche. Meistens dauert das gar
       nichts (Weckworte); muss das billige Modell ran, sind es ein paar
       Zehntelsekunden — deshalb steht das Gesicht schon auf „denkt". */
    leitet = true;
    setState('thinking');
    vorbereiten(text).then(function () {
      leitet = false;
      ask();
    }, function () {
      leitet = false;
      ask();
    });
  }

  sendBtn.addEventListener('click', send);

  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  inputEl.addEventListener('input', function () {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
  });

  inputEl.addEventListener('focus', function () {
    setTimeout(function () { scrollToBottom(true); }, 250);
  });

  /* ---------- Vorlesen an/aus ---------- */

  voiceOutput = read(KEY_VOICE) === '1';
  voiceOutBtn.setAttribute('aria-pressed', String(voiceOutput));

  voiceOutBtn.addEventListener('click', function () {
    voiceOutput = !voiceOutput;
    voiceOutBtn.setAttribute('aria-pressed', String(voiceOutput));
    store(KEY_VOICE, voiceOutput ? '1' : '0');
    if (!voiceOutput) {
      stopSpeech();
      if (!busy) setState('idle');
    } else if ('speechSynthesis' in window) {
      // iOS gibt die Stimmen erst nach einer Nutzeraktion frei.
      try { window.speechSynthesis.getVoices(); } catch (e) { /* egal */ }
    }
    aufbauAnzeigen();
  });

  /* ---------- Verlauf löschen ---------- */

  resetBtn.addEventListener('click', function () {
    if (!window.confirm('Gesprächsverlauf wirklich löschen?')) return;
    if (controller) controller.abort();
    stopSpeech();
    messages = [];
    chatEl.innerHTML = '';
    drop(KEY_MESSAGES);
    greet();
  });

  /* ---------- Spracheingabe ---------- */
  /* Zwei Betriebsarten:
       Knopf drücken   einmal zuhören, dann senden.
       Freihändig      dauerhaft zuhören und auf das Weckwort „Jarvis" warten.

     Freihändig hat eine Falle, die zwei Anläufe gekostet hat: der Lautsprecher
     spielt Jarvis' Antwort ab, das Mikrofon hört sie, und Jarvis redet mit
     sich selbst. Deshalb wird nur zugehört, wenn er weder denkt noch spricht —
     dafür sorgt der Takt weiter unten, statt an fünf Stellen im Code. */

  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recognition = null;
  var wartetAufBefehl = 0;      // Zeitpunkt, bis zu dem „Jarvis?" noch nachwirkt
  var NACHWIRKUNG = 8000;

  function weckantwort() {
    var ton = (KONFIG.toene || {})[tonAktuell()];
    return (ton && ton.weckantwort) || 'Ja?';
  }

  function hoerenStarten(dauerhaft) {
    if (!recognition || listening) return;
    recognition.continuous = !!dauerhaft;
    if (klatschHoerer) klatschHoerer.pause(true);
    try { recognition.start(); } catch (e) { /* läuft schon */ }
  }

  function befehlAusfuehren(text) {
    if (!text) return;
    inputEl.value = text;
    send();
  }

  if (Recognition) {
    micBtn.hidden = false;
    recognition = new Recognition();
    recognition.lang = 'de-DE';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    micBtn.addEventListener('click', function () {
      if (listening) { recognition.stop(); return; }
      stopSpeech();
      hoerenStarten(false);
    });

    recognition.addEventListener('start', function () {
      listening = true;
      micBtn.setAttribute('aria-pressed', 'true');
      setState('listening');
    });

    recognition.addEventListener('end', function () {
      listening = false;
      micBtn.setAttribute('aria-pressed', 'false');
      if (klatschHoerer) klatschHoerer.pause(false);
      if (!busy && !stimmeLaeuft) setState('idle');
      // Neu gestartet wird nicht hier, sondern im Takt — sonst dreht sich das
      // im Kreis, wenn der Browser die Erkennung sofort wieder beendet.
    });

    recognition.addEventListener('error', function (e) {
      listening = false;
      micBtn.setAttribute('aria-pressed', 'false');
      if (klatschHoerer) klatschHoerer.pause(false);
      // Ohne Erlaubnis fürs Mikrofon hat Freihändig keinen Sinn — dann aus,
      // statt es alle paar Sekunden erfolglos zu versuchen.
      if (e && (e.error === 'not-allowed' || e.error === 'service-not-allowed')) {
        freihandSetzen(false);
        showWarning('Kein Zugriff aufs Mikrofon. Freihändig ist aus.');
      }
      if (!busy && !stimmeLaeuft) setState('idle');
    });

    recognition.addEventListener('result', function (e) {
      var text = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) text += e.results[i][0].transcript;
      }
      text = text.trim();
      if (!text) return;

      if (!freihand) {
        befehlAusfuehren(text);
        return;
      }

      // Freihändig: nur mit Weckwort — oder kurz danach, wenn schon „Jarvis"
      // gesagt wurde und die Antwort noch aussteht.
      var treffer = text.match(/\bjarvis\b[\s,.:;!?-]*/i);
      if (treffer) {
        var befehl = text.slice(treffer.index + treffer[0].length).trim();
        if (befehl) {
          wartetAufBefehl = 0;
          befehlAusfuehren(befehl);
        } else {
          // Nur der Name. Kurz antworten, ohne das Modell zu fragen.
          wartetAufBefehl = Date.now() + NACHWIRKUNG;
          var vorherAn = voiceOutput;
          voiceOutput = true;
          sprich(weckantwort());
          voiceOutput = vorherAn;
        }
        return;
      }

      if (wartetAufBefehl && Date.now() < wartetAufBefehl) {
        wartetAufBefehl = 0;
        befehlAusfuehren(text);
      }
    });
  }

  /* ---------- Freihändig ---------- */

  function freihandSetzen(an) {
    freihand = !!an && !!Recognition;
    store(KEY_FREIHAND, freihand ? '1' : '0');
    if (freihandBtn) {
      freihandBtn.setAttribute('aria-pressed', String(freihand));
      freihandBtn.hidden = !Recognition;
    }
    if (!freihand && listening) {
      try { recognition.stop(); } catch (e) { /* egal */ }
    }
  }

  if (freihandBtn) {
    freihandBtn.hidden = !Recognition;
    freihandBtn.addEventListener('click', function () { freihandSetzen(!freihand); });
  }

  // Der Takt hält den gewünschten Zustand nach: zuhören, sobald Jarvis weder
  // denkt noch spricht. Selbstheilend — verschluckt der Browser einen Start,
  // ist es beim nächsten Durchlauf wieder in Ordnung.
  setInterval(function () {
    if (!freihand || listening || busy || stimmeLaeuft) return;
    if (document.hidden) return;
    hoerenStarten(true);
  }, 700);

  /* ---------- Auf Klatschen hören ---------- */
  /* Zweimal klatschen startet den Morgengruß. Das geht nur, solange die App
     offen und sichtbar ist — im Hintergrund darf kein Browser mithören. */

  async function klatschenSetzen(an) {
    if (an) {
      if (!window.Klatschen) return false;
      if (!klatschHoerer) {
        klatschHoerer = window.Klatschen.hoerer(function () {
          if (busy || stimmeLaeuft) return;
          morgengruss(true);
        });
      }
      var ok = await klatschHoerer.start();
      if (!ok) {
        showWarning('Kein Zugriff aufs Mikrofon — auf Klatschen kann Jarvis nicht hören.');
        store(KEY_KLATSCHEN, '0');
        if (klatschBox) klatschBox.checked = false;
        return false;
      }
      store(KEY_KLATSCHEN, '1');
      return true;
    }
    if (klatschHoerer) klatschHoerer.stop();
    store(KEY_KLATSCHEN, '0');
    return true;
  }

  // Im Hintergrund braucht niemand ein offenes Mikrofon.
  document.addEventListener('visibilitychange', function () {
    if (!klatschHoerer) return;
    klatschHoerer.pause(document.hidden);
  });

  /* ---------- Zugangscode ---------- */

  function openGate(hint) {
    gateText.textContent = hint || GATE_DEFAULT;
    gate.hidden = false;
    setTimeout(function () { gateInput.focus(); }, 50);
  }

  gateForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var value = gateInput.value.trim();
    if (!value) return;
    store(KEY_PASSCODE, value);
    gateInput.value = '';
    gate.hidden = true;
    // Steht schon eine Frage an, kommt die dran. Sonst war es der Morgengruß,
    // der am Code hängengeblieben ist.
    if (apiMessages().length) ask();
    else morgengruss(false);
  });

  /* ---------- Verbindung ---------- */

  window.addEventListener('online', function () {
    warnBar.hidden = true;
    if (!busy && !stimmeLaeuft) setState('idle');
  });
  window.addEventListener('offline', function () {
    showWarning('Keine Verbindung. Der Verlauf bleibt, Antworten brauchen Netz.');
    if (!busy) setState('offline');
  });
  warnClose.addEventListener('click', function () { warnBar.hidden = true; });

  /* ---------- Installieren ---------- */

  function standalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function maybeOfferInstall() {
    if (standalone() || read(KEY_INSTALL_HIDDEN) === '1') return;
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (deferredInstall) {
      installText.textContent = 'Jarvis auf den Startbildschirm legen?';
      installBtn.hidden = false;
      installBar.hidden = false;
    } else if (ios) {
      installText.textContent = 'Installieren: unten auf „Teilen“ tippen, dann „Zum Home-Bildschirm“.';
      installBtn.hidden = true;
      installBar.hidden = false;
    }
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredInstall = e;
    maybeOfferInstall();
  });

  window.addEventListener('appinstalled', function () {
    deferredInstall = null;
    installBar.hidden = true;
    store(KEY_INSTALL_HIDDEN, '1');
  });

  installBtn.addEventListener('click', async function () {
    if (!deferredInstall) return;
    installBar.hidden = true;
    deferredInstall.prompt();
    try { await deferredInstall.userChoice; } catch (e) { /* egal */ }
    deferredInstall = null;
  });

  installClose.addEventListener('click', function () {
    installBar.hidden = true;
    store(KEY_INSTALL_HIDDEN, '1');
  });

  /* ---------- Wetter ---------- */
  /* Open-Meteo, ohne Schlüssel und ohne Anmeldung — deshalb darf das
     ausnahmsweise direkt aus dem Browser gehen. Es gibt nichts zu verraten. */

  var WETTERLAGE = {
    0: 'klar', 1: 'überwiegend klar', 2: 'teils bewölkt', 3: 'bedeckt',
    45: 'Nebel', 48: 'gefrierender Nebel',
    51: 'leichter Nieselregen', 53: 'Nieselregen', 55: 'dichter Nieselregen',
    56: 'gefrierender Nieselregen', 57: 'gefrierender Nieselregen',
    61: 'leichter Regen', 63: 'Regen', 65: 'starker Regen',
    66: 'gefrierender Regen', 67: 'gefrierender Regen',
    71: 'leichter Schneefall', 73: 'Schneefall', 75: 'starker Schneefall',
    77: 'Schneegriesel',
    80: 'Regenschauer', 81: 'Regenschauer', 82: 'kräftige Regenschauer',
    85: 'Schneeschauer', 86: 'kräftige Schneeschauer',
    95: 'Gewitter', 96: 'Gewitter mit Hagel', 99: 'schweres Gewitter mit Hagel'
  };

  async function holeWetter() {
    var ort = KONFIG.ort;
    if (!ort || typeof ort.breite !== 'number' || typeof ort.laenge !== 'number') return null;
    var url = WETTER_URL +
      '?latitude=' + encodeURIComponent(ort.breite) +
      '&longitude=' + encodeURIComponent(ort.laenge) +
      '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m' +
      '&timezone=auto';
    try {
      // Ohne Zeitlimit wartet ein fetch, bis der Browser aufgibt — im Zug mit
      // einem Balken Empfang sind das Minuten. Vier Sekunden oder nichts.
      var antwort = await fetch(url, {
        signal: AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined
      });
      if (!antwort.ok) return null;
      var jetzt = (await antwort.json()).current;
      if (!jetzt) return null;
      return {
        ort: ort.name || '',
        grad: Math.round(jetzt.temperature_2m),
        gefuehlt: Math.round(jetzt.apparent_temperature),
        lage: WETTERLAGE[jetzt.weather_code] || 'wechselhaft',
        wind: Math.round(jetzt.wind_speed_10m)
      };
    } catch (e) {
      return null;   // kein Netz, keine Ortsangabe, egal — dann eben ohne
    }
  }

  /* ---------- Begrüßung und Morgengruß ---------- */

  var TAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  var MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
                'August', 'September', 'Oktober', 'November', 'Dezember'];

  function tageszeit(stunde) {
    return stunde < 11 ? 'Guten Morgen' : stunde < 18 ? 'Guten Tag' : 'Guten Abend';
  }

  // Die schlichte Begrüßung ohne Modell und ohne Netz. Sie steht sofort da.
  function greet() {
    var text = tageszeit(new Date().getHours()) + ', Damaso. Ich bin Jarvis – womit kann ich helfen?';
    messages.push({ role: 'assistant', content: text, local: true });
    renderMessage('assistant', text);
    saveMessages();
  }

  /* Der gesprochene Morgengruß: Tageszeit plus Wetter, zwei Sätze, vorgelesen.
     Er läuft auf dem billigen Modell (siehe MODI in server/core.mjs) — er
     kommt bei jedem Start und darf deshalb nichts kosten. Einmal am Tag von
     selbst, danach nur noch auf Knopfdruck. */

  function heute() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  async function morgengruss(vonHand) {
    if (busy) return;
    if (!vonHand) {
      if (!KONFIG.morgen.beim_start_gruessen) return;
      if (read(KEY_GRUSS) === heute()) return;
    }
    store(KEY_GRUSS, heute());

    var jetzt = new Date();
    var wetter = await holeWetter();
    // Das Wetter darf bis zu vier Sekunden brauchen. In der Zeit kann Damaso
    // längst etwas gefragt haben — dann hat seine Frage Vorrang, sonst
    // schreiben zwei Anfragen gleichzeitig in denselben Abbruchknopf.
    if (busy) return;
    var lage = 'Es ist ' + TAGE[jetzt.getDay()] + ', der ' + jetzt.getDate() + '. ' +
      MONATE[jetzt.getMonth()] + ', ' + jetzt.getHours() + ' Uhr ' +
      String(jetzt.getMinutes()).padStart(2, '0') + '.';
    if (wetter) {
      lage += ' Wetter in ' + wetter.ort + ': ' + wetter.lage + ', ' + wetter.grad +
        ' Grad, gefühlt ' + wetter.gefuehlt + ', Wind ' + wetter.wind + ' Kilometer pro Stunde.';
    } else {
      lage += ' Wetterdaten liegen gerade nicht vor.';
    }

    controller = new AbortController();
    setBusy(true);
    setState('thinking');
    var text = '';

    try {
      var headers = { 'Content-Type': 'application/json' };
      var code = read(KEY_PASSCODE);
      if (code) headers['X-Jarvis-Passcode'] = code;

      var response = await fetch(API_URL, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          messages: [{ role: 'user', content: lage }],
          modus: 'gruss',
          ton: tonAktuell()
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        var detail = '';
        try { detail = (await response.json()).error || ''; } catch (e) { /* kein JSON */ }
        if (response.status === 401) {
          // Der Gruß ist beim Start die erste Anfrage überhaupt. Fehlt der
          // Zugangscode, muss die Abfrage jetzt kommen — sonst steht Jarvis
          // stumm da und niemand weiß, warum.
          drop(KEY_PASSCODE);
          drop(KEY_GRUSS);
          openGate(read(KEY_PASSCODE) ? 'Der Code stimmt nicht. Versuch es nochmal.' : null);
          return;
        }
        // Sonst gilt: von selbst ist der Gruß Zugabe und schweigt. Auf
        // Knopfdruck muss dranstehen, warum nichts passiert ist.
        if (vonHand) renderError(errorText(response.status, detail), false);
        return;
      }
      serverStimme = response.headers.get('x-jarvis-stimme') === '1';

      var blase = null;
      await readStream(response.body, function (event, data) {
        if (event === 'content_block_delta' && data.delta && data.delta.type === 'text_delta') {
          if (!blase) {
            blase = renderMessage('assistant', '');
            blase.classList.add('streaming');
            setState('speaking');
          }
          text += data.delta.text;
          blase.innerHTML = renderMarkdown(text);
          scrollToBottom(true);
        }
      });
      if (blase) blase.classList.remove('streaming');

      if (text.trim()) {
        // local: true — der Gruß gehört nicht in den Verlauf, den der Server
        // sieht. Sonst begänne die Unterhaltung mit einer Assistenz-Nachricht
        // und die Messages-API lehnte sie ab.
        messages.push({ role: 'assistant', content: text, local: true });
        saveMessages();
        var vorherAn = voiceOutput;
        voiceOutput = true;             // der Gruß wird immer gesprochen
        feedSpeech(text, true);
        voiceOutput = vorherAn;
      }
      if (KONFIG.morgen.lied) spieleLied();
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.warn('Morgengruß:', err);
      if (vonHand) renderError('Der Morgengruß ist nicht durchgegangen.', false);
    } finally {
      controller = null;
      setBusy(false);
      if (!stimmeLaeuft) setState('idle');
    }
  }

  /* Das Morgenlied. Ein Browser darf kein Spotify fernsteuern — er kann den
     Link nur öffnen. Auf dem Handy übernimmt dann die Spotify-App. */
  function spieleLied() {
    var link = KONFIG.morgen.lied;
    if (!link) return;
    try {
      var ziel = new URL(link, location.href);
      if (ziel.protocol !== 'https:' && ziel.protocol !== 'spotify:') return;
      window.open(ziel.href, '_blank', 'noopener');
    } catch (e) { /* kaputter Link in der Konfiguration — dann eben nicht */ }
  }

  /* ---------- Einstellungen ---------- */

  function sheetOeffnen(auf) {
    sheet.hidden = !auf;
    menuBtn.setAttribute('aria-expanded', String(!!auf));
    // Beim Öffnen frisch nachsehen — im Gedächtnis kann seit dem letzten Mal
    // einiges dazugekommen sein.
    if (auf) {
      abteilungenAnbieten();
      gedaechtnisAnzeigen();
      aufbauAnzeigen();
    }
  }

  menuBtn.addEventListener('click', function () { sheetOeffnen(sheet.hidden); });
  sheetClose.addEventListener('click', function () { sheetOeffnen(false); });
  sheet.addEventListener('click', function (e) { if (e.target === sheet) sheetOeffnen(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !sheet.hidden) sheetOeffnen(false);
  });

  // Die Tonlagen stehen in der Konfiguration, nicht im Code — Damaso kann dort
  // eigene erfinden, ohne eine Zeile JavaScript anzufassen.
  function toeneAnbieten() {
    var toene = KONFIG.toene || {};
    tonWahl.innerHTML = '';
    Object.keys(toene).forEach(function (id) {
      var option = document.createElement('option');
      option.value = id;
      option.textContent = toene[id].name || id;
      tonWahl.appendChild(option);
    });
    tonWahl.value = tonAktuell();
  }

  tonWahl.addEventListener('change', function () {
    store(KEY_TON, tonWahl.value);
    // Der neue Ton gilt ab der nächsten Antwort — der Verlauf bleibt stehen.
    renderError('Ton umgestellt auf „' + (tonWahl.options[tonWahl.selectedIndex] || {}).text + '". Gilt ab der nächsten Antwort.', false, 'note');
  });

  /* ---------- Abteilungen in den Einstellungen ---------- */

  function abteilungenAnbieten() {
    var fest = window.Abteilungen.fest();
    abteilungWahl.innerHTML = '';

    var auto = document.createElement('option');
    auto.value = '';
    auto.textContent = 'Automatisch';
    abteilungWahl.appendChild(auto);

    window.Abteilungen.liste().forEach(function (a) {
      var option = document.createElement('option');
      option.value = a.id;
      option.textContent = a.kurz ? a.name + ' — ' + a.kurz : a.name;
      abteilungWahl.appendChild(option);
    });
    abteilungWahl.value = fest || '';
  }

  abteilungWahl.addEventListener('change', function () {
    var gewaehlt = abteilungWahl.value;
    window.Abteilungen.fest(gewaehlt || null);
    if (gewaehlt) abteilungJetzt = gewaehlt;
    abteilungAnzeigen();
    aufbauAnzeigen();
  });

  abteilungBtn.addEventListener('click', function () {
    sheetOeffnen(true);
    abteilungWahl.focus();
  });

  /* ---------- Gedächtnis in den Einstellungen ---------- */
  /* Damaso muss hineinsehen und einzelne Sätze wegwerfen können. Ein
     Gedächtnis, das man weder liest noch korrigiert, wird irgendwann zur
     Quelle von Antworten, die niemand erklären kann. */

  function gedaechtnisAnzeigen() {
    notizenListe.innerHTML = '';

    if (!gedaechtnisAn()) {
      gedaechtnisInfo.textContent = 'In jarvis/konfiguration.json abgeschaltet. Jarvis fängt bei jeder Frage von vorn an.';
      notizNeuBtn.disabled = true;
      notizenLeerenBtn.disabled = true;
      return;
    }
    notizNeuBtn.disabled = false;
    notizenLeerenBtn.disabled = false;

    var notizen = window.Gedaechtnis.alle().sort(function (a, b) { return (b.zeit || 0) - (a.zeit || 0); });
    gedaechtnisInfo.textContent = notizen.length
      ? notizen.length + (notizen.length === 1 ? ' Notiz' : ' Notizen') + ' — auf diesem Gerät, nicht auf einem Server. '
        + 'Zu jeder Frage gehen höchstens ' + window.Gedaechtnis.MITGEBEN + ' davon mit, die passenden.'
      : 'Noch nichts gemerkt. Jarvis schreibt sich auf, was in Wochen noch stimmt — oder sag ihm einfach „merk dir …“.';

    notizen.slice(0, 60).forEach(function (notiz) {
      var zeile = document.createElement('li');

      var text = document.createElement('span');
      text.className = 'notiz__text';
      text.textContent = notiz.text;
      if (notiz.marken && notiz.marken.length) {
        var marken = document.createElement('span');
        marken.className = 'notiz__marken';
        marken.textContent = notiz.marken.map(function (m) { return '#' + m; }).join(' ');
        text.appendChild(marken);
      }

      var weg = document.createElement('button');
      weg.type = 'button';
      weg.className = 'notiz__weg';
      weg.setAttribute('aria-label', 'Diese Notiz vergessen');
      weg.textContent = '\u00d7';
      weg.addEventListener('click', function () {
        window.Gedaechtnis.loeschen(notiz.id);
        gedaechtnisAnzeigen();
      });

      zeile.appendChild(text);
      zeile.appendChild(weg);
      notizenListe.appendChild(zeile);
    });
  }

  notizNeuBtn.addEventListener('click', function () {
    var text = window.prompt('Was soll Jarvis sich merken? Ein Satz.');
    if (!text) return;
    window.Gedaechtnis.merken(text, { abteilung: window.Abteilungen.fest() || '' });
    gedaechtnisAnzeigen();
  });

  notizenLeerenBtn.addEventListener('click', function () {
    var anzahl = window.Gedaechtnis.alle().length;
    if (!anzahl) return;
    if (!window.confirm(anzahl + ' Notizen löschen? Das lässt sich nicht rückgängig machen.')) return;
    window.Gedaechtnis.leeren();
    gedaechtnisAnzeigen();
  });

  merkBox.addEventListener('change', function () {
    store(KEY_MERKEN, merkBox.checked ? '1' : '0');
    aufbauAnzeigen();
  });

  /* ---------- Aufbau ---------- */
  /* Die vier Schichten mit dem, was gerade wirklich an ist. Kein Schaubild,
     das etwas verspricht, was nicht läuft. */

  function schicht(id, an, text) {
    var wert = document.getElementById(id);
    if (!wert) return;
    wert.textContent = text;
    if (wert.parentNode) wert.parentNode.setAttribute('data-an', an ? '1' : '0');
  }

  function aufbauAnzeigen() {
    if (!aufbau) return;

    var hoert = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    schicht('aufbauSprechen', hoert || voiceOutput,
      (hoert ? 'Mikrofon, Weckwort, Klatschen' : 'kein Mikrofon in diesem Browser')
      + (voiceOutput ? ' · liest vor' : ' · liest nicht vor'));

    var fest = window.Abteilungen.fest();
    var anzahl = window.Abteilungen.liste().length;
    schicht('aufbauLeiten', true, fest
      ? 'festgehalten auf ' + window.Abteilungen.name(fest)
      : anzahl + ' Abteilungen, Jarvis wählt selbst');

    var notizen = gedaechtnisAn() ? window.Gedaechtnis.alle().length : 0;
    schicht('aufbauMerken', gedaechtnisAn(), gedaechtnisAn()
      ? notizen + (notizen === 1 ? ' Notiz' : ' Notizen') + (merkenAn() ? ', merkt von selbst' : ', nur auf Ansage')
      : 'abgeschaltet');

    schicht('aufbauArbeiten', serverLokal, serverLokal
      ? 'auf deinem Gerät — Jarvis darf den Speicher ansehen und aufräumen'
      : 'im Netz — Antworten ja, Zugriff auf deine Dateien nein');
  }

  klatschBox.addEventListener('change', function () {
    klatschenSetzen(klatschBox.checked);
  });

  grussBtn.addEventListener('click', function () {
    sheetOeffnen(false);
    morgengruss(true);
  });

  /* ---------- Start ---------- */

  (async function start() {
    await ladeKonfig();
    await ladeAbteilungen();
    toeneAnbieten();
    abteilungenAnbieten();
    merkBox.checked = merkenAn();
    merkBox.disabled = !gedaechtnisAn();
    abteilungJetzt = window.Abteilungen.fest() || window.Abteilungen.standard();
    abteilungAnzeigen();
    gedaechtnisAnzeigen();
    aufbauAnzeigen();

    if (KONFIG.stimme.an === false) {
      stimmeInfo.textContent = 'Die Stimme ist in der Konfiguration abgeschaltet — Jarvis liest mit der Stimme des Browsers vor.';
    } else if (KONFIG.stimme.id) {
      stimmeInfo.textContent = 'Vorgelesen wird über ElevenLabs. Fehlt der Schlüssel auf dem Server oder ist das Kontingent leer, übernimmt die Stimme des Browsers.';
    } else {
      stimmeInfo.textContent = 'In jarvis/konfiguration.json fehlt die Stimmen-ID — Jarvis liest mit der Stimme des Browsers vor.';
    }

    freihandSetzen(read(KEY_FREIHAND) === '1');
    klatschBox.checked = read(KEY_KLATSCHEN) === '1';
    if (klatschBox.checked) klatschenSetzen(true);

    var hatteVerlauf = loadMessages();
    if (!hatteVerlauf) greet();
    scrollToBottom(true);
    setState(navigator.onLine ? 'idle' : 'offline');
    if (!navigator.onLine) showWarning('Keine Verbindung. Der Verlauf bleibt, Antworten brauchen Netz.');
    setTimeout(maybeOfferInstall, 1200);

    if ('speechSynthesis' in window) {
      window.speechSynthesis.addEventListener('voiceschanged', function () { pickVoice(); });
    }

    // Der gesprochene Morgengruß, einmal am Tag. Kurz warten, damit die Seite
    // erst fertig steht — und damit der erste Fingertipp den Ton freigibt.
    if (navigator.onLine) setTimeout(function () { morgengruss(false); }, 600);
  })();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* ohne Offline-Cache läuft es auch */ });
    });
  }
})();
