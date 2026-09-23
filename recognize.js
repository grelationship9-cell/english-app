'use strict';

/* ============================================================
   マイクで拾った英語が「通じるか」を判定する。
   点数はつけない。伝わったかどうかだけを返す。
   ============================================================ */

var Recognize = (function () {

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  function available() {
    return !!SR && window.isSecureContext;
  }

  var rec = null;
  var running = false;

  function start(handlers) {
    if (!available() || running) return false;

    var lastInterim = '';
    var done = false;

    function finish(text) {
      if (done) return;
      done = true;
      running = false;
      if (text) handlers.onResult(text);
      else if (handlers.onNothing) handlers.onNothing();
    }

    rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous = false;

    rec.onresult = function (e) {
      var r = e.results[e.results.length - 1];
      var text = r[0].transcript;
      if (r.isFinal) {
        finish(text);
      } else {
        lastInterim = text;
        if (handlers.onInterim) handlers.onInterim(text);
      }
    };

    rec.onerror = function (e) {
      if (done) return;
      done = true;
      running = false;
      if (handlers.onError) handlers.onError(e.error);
    };

    // iOS Safari は確定結果(isFinal)を返さずに終了することがある。
    // 途中経過が届いていればそれを結果として使う。
    rec.onend = function () {
      finish(lastInterim);
    };

    try {
      rec.start();
      running = true;
      return true;
    } catch (err) {
      running = false;
      if (handlers.onError) handlers.onError('start-failed');
      return false;
    }
  }

  function stop() {
    if (rec) { try { rec.stop(); } catch (e) {} }
  }

  return { available: available, start: start, stop: stop };
})();


var Judge = (function () {

  // a / the / is などの取りこぼしは通じ方に影響しない
  var FILLER = {
    'a': 1, 'an': 1, 'the': 1, 'is': 1, 'are': 1, 'am': 1, 'do': 1, 'does': 1,
    'to': 1, 'of': 1, 'and': 1, 'in': 1, 'it': 1, 'you': 1, 'i': 1, 'my': 1, 'me': 1
  };

  function words(s) {
    return s.toLowerCase()
            .replace(/[^a-z0-9'\s]/g, ' ')
            .split(/\s+/)
            .filter(Boolean);
  }

  // 文の途中で大文字で始まる語＝固有名詞とみなし、判定から外す。
  // 英語の音声認識は日本語の名前を拾えない（Tanaka → "the car"）。
  // 名前が通じるかは発音練習の本質ではないので減点しない。
  function properNouns(target) {
    var raw = target.split(/\s+/);
    var set = {};
    raw.forEach(function (w, i) {
      var clean = w.replace(/[^A-Za-z']/g, '');
      if (!clean || clean === 'I') return;
      var startsSentence = i === 0 || /[.!?]$/.test(raw[i - 1] || '');
      if (!startsSentence && /^[A-Z]/.test(clean)) set[clean.toLowerCase()] = true;
    });
    return set;
  }

  function evaluate(target, heard) {
    var proper = properNouns(target);
    var pool = words(heard);
    var missing = [];
    var ignored = [];
    var keyTotal = 0, keyHit = 0;

    words(target).forEach(function (w) {
      if (proper[w]) { ignored.push(w); return; }
      var isKey = !FILLER[w];
      if (isKey) keyTotal++;
      var idx = pool.indexOf(w);
      if (idx >= 0) {
        pool.splice(idx, 1);
        if (isKey) keyHit++;
      } else if (isKey) {
        missing.push(w);
      }
    });

    var ratio = keyTotal ? keyHit / keyTotal : 1;
    var level = ratio >= 0.85 ? 'ok' : ratio >= 0.5 ? 'mid' : 'ng';
    return { level: level, ratio: ratio, missing: missing, ignored: ignored, heard: heard };
  }

  return { evaluate: evaluate };
})();
