/* Jarvis — Oberfläche.
   Das Modell wird nie direkt aus dem Browser angesprochen: alle Anfragen laufen
   über /api/jarvis (Netlify-Function), die den API-Schlüssel serverseitig hält. */

(function () {
  'use strict';

  var API_URL = '/api/jarvis';
  var KEY_MESSAGES = 'jarvis.messages.v1';
  var KEY_PASSCODE = 'jarvis.passcode.v1';
  var KEY_VOICE = 'jarvis.voice.v1';
  var KEY_INSTALL_HIDDEN = 'jarvis.install-hidden.v1';
  var MAX_STORED = 200;
  var MAX_CONTEXT = 24;

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

  function renderError(text, retry, kind) {
    var div = document.createElement('div');
    div.className = 'msg ' + (kind || 'error');
    div.setAttribute('role', 'alert');
    var p = document.createElement('span');
    p.textContent = text;
    div.appendChild(p);
    if (retry) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Nochmal versuchen';
      btn.addEventListener('click', function () {
        div.remove();
        ask();
      });
      div.appendChild(btn);
    }
    chatEl.appendChild(div);
    scrollToBottom(true);
  }

  /* ---------- Vorlesen ---------- */

  var speechBuffer = '';
  var speaking = 0;

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

  function utter(text) {
    var clean = plainText(text);
    if (!clean) return;
    try {
      var u = new SpeechSynthesisUtterance(clean);
      var voice = pickVoice();
      if (voice) u.voice = voice;
      u.lang = voice ? voice.lang : 'de-DE';
      u.rate = 1.02;
      speaking++;
      setState('speaking');
      u.onend = u.onerror = function () {
        speaking = Math.max(0, speaking - 1);
        if (!speaking && !busy) setState('idle');
      };
      window.speechSynthesis.speak(u);
    } catch (e) { /* Sprachausgabe ist Zugabe, kein Muss */ }
  }

  // Satzweise vorlesen, damit Jarvis schon spricht, während der Rest noch läuft.
  function feedSpeech(chunk, flush) {
    if (!voiceOutput || !('speechSynthesis' in window)) return;
    speechBuffer += chunk;
    var match;
    while ((match = speechBuffer.match(/^[\s\S]*?[.!?:…]["')]?\s/))) {
      utter(match[0]);
      speechBuffer = speechBuffer.slice(match[0].length);
    }
    if (flush) {
      utter(speechBuffer);
      speechBuffer = '';
    }
  }

  function stopSpeech() {
    speechBuffer = '';
    speaking = 0;
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch (e) { /* egal */ }
    }
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
        body: JSON.stringify({ messages: payload }),
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
        if (!finished) {
          // Ohne message_stop ist die Verbindung unterwegs abgerissen. Das Stück
          // bleibt stehen, aber es muss dranstehen — sonst liest sich eine halbe
          // Antwort wie eine ganze.
          renderError('Die Verbindung ist abgerissen, die Antwort ist unvollständig.', true);
        } else if (stopReason === 'max_tokens') {
          renderError('Die Antwort war zu lang und ist hier zu Ende. Frag nach dem Rest.', false, 'note');
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
      if (!speaking) setState('idle');
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
    var text = inputEl.value.trim();
    if (!text) return;

    inputEl.value = '';
    inputEl.style.height = 'auto';
    stopSpeech();

    messages.push({ role: 'user', content: text });
    renderMessage('user', text);
    saveMessages();
    scrollToBottom(true);
    ask();
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

  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (Recognition) {
    micBtn.hidden = false;
    var recognition = new Recognition();
    recognition.lang = 'de-DE';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    micBtn.addEventListener('click', function () {
      if (listening) { recognition.stop(); return; }
      stopSpeech();
      try { recognition.start(); } catch (e) { /* läuft schon */ }
    });
    recognition.addEventListener('start', function () {
      listening = true;
      micBtn.setAttribute('aria-pressed', 'true');
      setState('listening');
    });
    recognition.addEventListener('end', function () {
      listening = false;
      micBtn.setAttribute('aria-pressed', 'false');
      if (!busy && !speaking) setState('idle');
    });
    recognition.addEventListener('error', function () {
      listening = false;
      micBtn.setAttribute('aria-pressed', 'false');
      if (!busy && !speaking) setState('idle');
    });
    recognition.addEventListener('result', function (e) {
      var transcript = e.results[0][0].transcript;
      inputEl.value = transcript;
      send();
    });
  }

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
    ask();
  });

  /* ---------- Verbindung ---------- */

  window.addEventListener('online', function () {
    warnBar.hidden = true;
    if (!busy && !speaking) setState('idle');
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

  /* ---------- Begrüßung und Start ---------- */

  function greet() {
    var hour = new Date().getHours();
    var greeting = hour < 12 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend';
    var text = greeting + ', Damaso. Ich bin Jarvis – womit kann ich helfen?';
    messages.push({ role: 'assistant', content: text, local: true });
    renderMessage('assistant', text);
    saveMessages();
  }

  if (!loadMessages()) greet();
  scrollToBottom(true);
  setState(navigator.onLine ? 'idle' : 'offline');
  if (!navigator.onLine) showWarning('Keine Verbindung. Der Verlauf bleibt, Antworten brauchen Netz.');
  setTimeout(maybeOfferInstall, 1200);

  if ('speechSynthesis' in window) {
    window.speechSynthesis.addEventListener('voiceschanged', function () { pickVoice(); });
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* ohne Offline-Cache läuft es auch */ });
    });
  }
})();
