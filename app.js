'use strict';

/* ============================================================
   工程1 — ホテル 第1幕だけの試作
   1ターンの流れ: 聞く → 推測 → 聞き返す → 答え合わせ → 言ってみる
   ============================================================ */

var RATE_NORMAL = 0.85;   // 最初に聞くときの速さ
var RATE_SLOW   = 0.60;   // 聞き返したあとの速さ
var RATE_MODEL  = 0.80;   // 自分のセリフのお手本

var scene = null;
var act = null;
var turnIndex = 0;
var answeredCorrectly = false;

/* ---------- 音声 ---------- */

var enVoice = null;

function pickVoice() {
  if (!window.speechSynthesis) return;
  var voices = window.speechSynthesis.getVoices() || [];
  var en = voices.filter(function (v) { return /^en/i.test(v.lang); });
  if (!en.length) return;

  // Samantha (en-US) が iOS では最も自然
  var found = null;
  for (var i = 0; i < en.length; i++) {
    if (/samantha/i.test(en[i].name)) { found = en[i]; break; }
  }
  if (!found) {
    for (var j = 0; j < en.length; j++) {
      if (/en[-_]US/i.test(en[j].lang)) { found = en[j]; break; }
    }
  }
  enVoice = found || en[0];
}

if (window.speechSynthesis) {
  pickVoice();
  window.speechSynthesis.onvoiceschanged = pickVoice;
  setTimeout(pickVoice, 500);
  setTimeout(pickVoice, 1500);
}

// おおよその読み上げ所要時間（ミリ秒）。
// 音声が鳴らない環境でも画面が先へ進むよう、保険のタイマーに使う。
function estimateMs(text, rate) {
  var words = text.split(/\s+/).length;
  var wpm = 150 * (rate || 1);
  return (words / wpm) * 60000 + 900;
}

// onDone は「読み上げ終了」か「保険タイマー」のどちらか早いほうで1回だけ呼ぶ。
// iOSで消音スイッチがオンのときなど、onend が飛んでこない状況で固まらせないため。
function once(fn) {
  var called = false;
  return function () {
    if (called) return;
    called = true;
    fn();
  };
}

function speak(text, rate, button, onDone) {
  if (!window.speechSynthesis) {
    if (onDone) setTimeout(onDone, estimateMs(text, rate));
    return;
  }
  window.speechSynthesis.cancel();

  var finish = once(function () {
    if (button) button.classList.remove('speaking');
    if (onDone) onDone();
  });

  var u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  if (enVoice) u.voice = enVoice;
  u.rate = rate;
  u.pitch = 1;
  u.volume = 1;
  if (button) u.onstart = function () { button.classList.add('speaking'); };
  u.onend = finish;
  u.onerror = finish;

  // iOS では cancel 直後の speak が無視されることがある
  setTimeout(function () { window.speechSynthesis.speak(u); }, 60);
  setTimeout(finish, estimateMs(text, rate) + 1500);
}

function speakSequence(items, button, onDone) {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  if (button) button.classList.add('speaking');

  var i = 0;
  function next() {
    if (i >= items.length) {
      if (button) button.classList.remove('speaking');
      if (onDone) onDone();
      return;
    }
    var item = items[i++];
    var step = once(function () { setTimeout(next, 450); });

    if (!window.speechSynthesis) {
      setTimeout(step, estimateMs(item.text, item.rate));
      return;
    }
    var u = new SpeechSynthesisUtterance(item.text);
    u.lang = 'en-US';
    if (enVoice) u.voice = enVoice;
    u.rate = item.rate;
    u.onend = step;
    u.onerror = step;
    window.speechSynthesis.speak(u);
    setTimeout(step, estimateMs(item.text, item.rate) + 1500);
  }
  setTimeout(next, 60);
}

/* ---------- 画面の切り替え ---------- */

function $(id) { return document.getElementById(id); }

function showScreen(name) {
  ['start', 'session', 'done'].forEach(function (s) {
    $('screen-' + s).classList.toggle('hidden', s !== name);
  });
  window.scrollTo(0, 0);
}

function showStage(name) {
  ['listen', 'guess', 'askagain', 'answer', 'speak', 'review'].forEach(function (s) {
    $('stage-' + s).classList.toggle('hidden', s !== name);
  });
  window.scrollTo(0, 0);
}

/* ---------- ターンの進行 ---------- */

function currentTurn() { return act.ターン[turnIndex]; }

function updateProgress() {
  var total = act.ターン.length;
  $('turn-counter').textContent = (turnIndex + 1) + ' / ' + total;
  $('progress-fill').style.width = (turnIndex / total * 100) + '%';
}

function startTurn() {
  answeredCorrectly = false;
  updateProgress();
  showStage('listen');
}

// 1. 聞く
function onListen() {
  speak(currentTurn().相手, RATE_NORMAL, $('btn-listen'), function () {
    buildChoices();
    showStage('guess');
  });
}

// 2. 推測
function buildChoices() {
  var t = currentTurn();
  var options = [{ text: t.訳, correct: true }];
  t.ダミー選択肢.forEach(function (d) { options.push({ text: d, correct: false }); });
  shuffle(options);

  var box = $('choices');
  box.innerHTML = '';
  options.forEach(function (opt) {
    var btn = document.createElement('button');
    btn.textContent = opt.text;
    btn.addEventListener('click', function () { onChoice(opt, btn, box); });
    box.appendChild(btn);
  });
}

function onChoice(opt, btn, box) {
  Array.prototype.forEach.call(box.querySelectorAll('button'), function (b) {
    b.disabled = true;
  });
  btn.classList.add(opt.correct ? 'picked-correct' : 'picked-wrong');
  answeredCorrectly = opt.correct;
  setTimeout(toAskAgain, 550);
}

function onDunno() {
  answeredCorrectly = false;
  toAskAgain();
}

// 3. 聞き返す（正解でも不正解でも必ず通る）
function toAskAgain() {
  var label = $('guess-feedback');
  if (answeredCorrectly) {
    label.textContent = '正解。でも念のため聞き返してみましょう';
    label.className = 'stage-label correct';
  } else {
    label.textContent = '大丈夫。分からないときは聞き返せばいい';
    label.className = 'stage-label wrong';
  }
  showStage('askagain');
}

function onSaidSorry() {
  speak(currentTurn().相手, RATE_SLOW, $('btn-said-sorry'), toAnswer);
}

// 4. 答え合わせ
function toAnswer() {
  var t = currentTurn();
  $('answer-en').textContent = t.相手;
  $('answer-ja').textContent = t.訳;
  $('answer-hint').textContent = t.ヒント || '';
  showStage('answer');
}

// 5. 言ってみる
function toSpeak() {
  var t = currentTurn();
  $('speak-en').textContent = t.自分;
  $('speak-ja').textContent = t.自分訳;
  showStage('speak');
}

function onSaid() {
  turnIndex++;
  if (turnIndex < act.ターン.length) {
    startTurn();
  } else {
    $('progress-fill').style.width = '100%';
    $('turn-counter').textContent = '仕上げ';
    showStage('review');
  }
}

// 仕上げ: 通しで再生
function onReviewPlay() {
  var items = [];
  act.ターン.forEach(function (t) {
    items.push({ text: t.相手, rate: RATE_NORMAL });
    items.push({ text: t.自分, rate: RATE_NORMAL });
  });
  speakSequence(items, $('btn-review-play'));
}

function onFinish() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  var list = $('learned-list');
  list.innerHTML = '';

  var li = document.createElement('li');
  li.innerHTML = 'Sorry?<span>聞き返すときの一言</span>';
  list.appendChild(li);

  act.ターン.forEach(function (t) {
    var el = document.createElement('li');
    el.textContent = t.自分;
    var ja = document.createElement('span');
    ja.textContent = t.自分訳;
    el.appendChild(ja);
    list.appendChild(el);
  });

  showScreen('done');
}

/* ---------- 起動 ---------- */

function shuffle(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}

function beginSession() {
  turnIndex = 0;
  showScreen('session');
  startTurn();
}

fetch('data/hotel.json')
  .then(function (r) { return r.json(); })
  .then(function (data) {
    scene = data;
    act = data.幕[0];
    $('start-emoji').textContent = data.絵文字;
    $('start-title').textContent = data.場面;
    $('start-act').textContent = '第1幕　' + act.題;
    $('start-situation').textContent = act.状況;
  })
  .catch(function (e) {
    $('start-situation').textContent = '場面データを読み込めませんでした: ' + e;
  });

$('btn-start').addEventListener('click', beginSession);
$('btn-listen').addEventListener('click', onListen);
$('btn-replay').addEventListener('click', function () {
  speak(currentTurn().相手, RATE_NORMAL, $('btn-replay'));
});
$('btn-dunno').addEventListener('click', onDunno);
$('btn-said-sorry').addEventListener('click', onSaidSorry);
$('btn-replay-slow').addEventListener('click', function () {
  speak(currentTurn().相手, RATE_SLOW, $('btn-replay-slow'));
});
$('btn-to-speak').addEventListener('click', toSpeak);
$('btn-model').addEventListener('click', function () {
  speak(currentTurn().自分, RATE_MODEL, $('btn-model'));
});
$('btn-said').addEventListener('click', onSaid);
$('btn-review-play').addEventListener('click', onReviewPlay);
$('btn-finish').addEventListener('click', onFinish);
$('btn-again').addEventListener('click', beginSession);
