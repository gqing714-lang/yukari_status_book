/*
 * 虚见相 · 結縁帳状态册 v6.0
 * 骨架参考：悬浮脚本优先确定父页面 doc/win，加载即创建 UI，按钮只负责显隐。
 */
(function () {
  'use strict';

  var VERSION = 'v6.0';
  var ROOT_ID = 'ykr-status-book-root';
  var STYLE_ID = 'ykr-status-book-style';
  var BUTTON_NAME = '結縁帳';
  var ICON_URL = 'https://files.catbox.moe/bv172s.png';
  var STORAGE_VISIBLE = 'ykr_status_book_visible_v6';
  var STORAGE_EXPANDED = 'ykr_status_book_expanded_v6';

  var localWin = window;
  var localDoc = document;
  var win = window;
  var doc = document;

  try {
    if (window.parent && window.parent !== window && window.parent.document) {
      win = window.parent;
      doc = window.parent.document;
    }
  } catch (error) {
    win = window;
    doc = document;
  }

  function getDocs() {
    var list = [localDoc];
    try {
      if (window.parent && window.parent.document && window.parent.document !== localDoc) {
        list.push(window.parent.document);
      }
    } catch (error) {}
    return list;
  }

  function removeOldElements() {
    getDocs().forEach(function (d) {
      try {
        var root = d.getElementById(ROOT_ID);
        if (root) root.remove();
        var style = d.getElementById(STYLE_ID);
        if (style) style.remove();
      } catch (error) {}
    });
  }

  try {
    if (window.__YUKARI_STATUS_BOOK__ && typeof window.__YUKARI_STATUS_BOOK__.destroy === 'function') {
      window.__YUKARI_STATUS_BOOK__.destroy();
    }
  } catch (error) {}

  removeOldElements();

  var state = {
    visible: localStorage.getItem(STORAGE_VISIBLE) !== '0',
    expanded: localStorage.getItem(STORAGE_EXPANDED) === '1',
    quoteIndex: 0,
    updateTimer: null,
    observer: null,
    buttonRegistered: false,
    data: {
      place: '万事屋',
      time: '未明',
      name: '虚見 相',
      moodValue: 50,
      moodLabel: '平静',
      outfit: '未记录',
      action: '他仍在柜台后，像是等一位尚未推门而入的客人。',
      mainTitle: '未启封',
      mainSummary: '尚未读取到当前主线。',
      todos: ['等待新的愿望。'],
      quote: '……还没有新的记录呢。',
      quoteMood: '平静',
      quoteItems: [{ mood: '平静', text: '……还没有新的记录呢。' }]
    }
  };

  function getApi(name) {
    var candidates = [];
    candidates.push(localWin);
    try { candidates.push(localWin.parent); } catch (error) {}
    candidates.push(win);
    try { candidates.push(win.parent); } catch (error) {}

    for (var i = 0; i < candidates.length; i++) {
      var obj = candidates[i];
      try {
        if (obj && typeof obj[name] === 'function') {
          return obj[name].bind(obj);
        }
      } catch (error) {}
    }
    return null;
  }

  function getGlobalValue(name) {
    var candidates = [];
    candidates.push(localWin);
    try { candidates.push(localWin.parent); } catch (error) {}
    candidates.push(win);
    try { candidates.push(win.parent); } catch (error) {}

    for (var i = 0; i < candidates.length; i++) {
      var obj = candidates[i];
      try {
        if (obj && obj[name]) return obj[name];
      } catch (error) {}
    }
    return null;
  }

  function waitForPage(callback, count) {
    count = count || 0;
    if (doc && doc.body && doc.head) {
      callback();
      return;
    }
    if (count > 100) {
      alert('結縁帳：没有等到页面 body/head，悬浮图标无法挂载。');
      return;
    }
    setTimeout(function () {
      waitForPage(callback, count + 1);
    }, 120);
  }

  function clamp(value, min, max) {
    value = Number(value);
    if (isNaN(value)) value = min;
    return Math.max(min, Math.min(max, value));
  }

  function stripComment(text) {
    return String(text == null ? '' : text).replace(/\{\/\/.*?\}/g, '').trim();
  }

  function scoreToMood(score) {
    var n = Number(score);
    if (isNaN(n)) return '平静';
    if (n >= 65) return '高兴';
    if (n >= 35) return '平静';
    if (n >= 15) return '低落';
    return '危险';
  }

  function latestStatusBlock(text) {
    var raw = String(text == null ? '' : text);
    var reg = /<status\b[^>]*>([\s\S]*?)<\/status>/gi;
    var match;
    var last = '';
    while ((match = reg.exec(raw))) {
      last = match[1] || '';
    }
    return last;
  }

  function cleanStatusBlock(block) {
    return String(block == null ? '' : block)
      .replace(/\r/g, '')
      .replace(/\{\/\/.*?\}/g, '')
      .replace(/[ \t]+$/gm, '')
      .trim();
  }

  function splitSections(block) {
    var keys = ['地点', '时间', '名字', '心情值', '穿着', '当前动作', '当前主线', '角色待办', '台词'];
    var sections = {};
    var i;
    for (i = 0; i < keys.length; i++) sections[keys[i]] = [];

    var current = '';
    var lines = cleanStatusBlock(block).split('\n');
    for (i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var m = line.match(/^(地点|时间|名字|心情值|穿着|当前动作|当前主线|角色待办|台词)\s*[:：]\s*(.*)$/);
      if (m) {
        current = m[1];
        var value = stripComment(m[2]);
        if (value) sections[current].push(value);
      } else if (current) {
        sections[current].push(stripComment(line));
      }
    }
    return sections;
  }

  function parseTodos(text) {
    var arr = String(text == null ? '' : text).split('\n');
    var result = [];
    for (var i = 0; i < arr.length; i++) {
      var item = arr[i].trim()
        .replace(/^\d+\s*[.．、]\s*/, '')
        .replace(/^[-•◇◆]\s*/, '')
        .trim();
      if (item) result.push(item);
    }
    return result.length ? result : ['暂无待办。'];
  }

  function parseMain(text) {
    text = String(text == null ? '' : text).trim();
    if (!text) return { title: '未启封', summary: '尚未读取到当前主线。' };

    if (text.indexOf('|') >= 0) {
      var parts = text.split('|');
      return {
        title: (parts.shift() || '').trim() || '未命名主线',
        summary: parts.join('|').trim() || '暂无梗概。'
      };
    }

    var lines = text.split('\n').map(function (v) { return v.trim(); }).filter(Boolean);
    return {
      title: lines[0] || '未命名主线',
      summary: lines.slice(1).join('\n') || '暂无梗概。'
    };
  }

  function parseQuotes(text, moodValue, messageId) {
    var lines = String(text == null ? '' : text).split('\n');
    var items = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var m = line.match(/^([^：:]{1,12})\s*[:：]\s*(.+)$/);
      if (m) {
        items.push({ mood: m[1].trim(), text: m[2].trim() });
      } else if (items.length) {
        items[items.length - 1].text += '\n' + line;
      }
    }

    var mood = scoreToMood(moodValue);
    if (!items.length) {
      return { quote: '……', quoteMood: mood, quoteItems: [{ mood: mood, text: '……' }] };
    }

    var pool = items.filter(function (item) {
      return item.mood.indexOf(mood) >= 0 || mood.indexOf(item.mood) >= 0;
    });
    if (!pool.length) pool = items;

    var idx = Math.abs(Number(messageId) || 0) % pool.length;
    var picked = pool[idx];
    return { quote: picked.text, quoteMood: picked.mood || mood, quoteItems: items };
  }

  function parseStatus(block, messageId) {
    var s = splitSections(block);
    var moodValue = clamp(String(s['心情值'][0] || '50').replace(/[^\d.-]/g, ''), 0, 100);
    var main = parseMain(s['当前主线'].join('\n'));
    var q = parseQuotes(s['台词'].join('\n'), moodValue, messageId || 0);

    return {
      place: s['地点'][0] || '万事屋',
      time: s['时间'][0] || '未明',
      name: s['名字'][0] || '虚見 相',
      moodValue: moodValue,
      moodLabel: q.quoteMood || scoreToMood(moodValue),
      outfit: s['穿着'].join('\n').trim() || '未记录',
      action: s['当前动作'].join('\n').trim() || '他仍在柜台后，像是等一位尚未推门而入的客人。',
      mainTitle: main.title,
      mainSummary: main.summary,
      todos: parseTodos(s['角色待办'].join('\n')),
      quote: q.quote,
      quoteMood: q.quoteMood,
      quoteItems: q.quoteItems
    };
  }

  function addStyle() {
    if (doc.getElementById(STYLE_ID)) return;
    var style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      'status,.ykr-status-hidden{display:none!important}',
      '#' + ROOT_ID + '{position:fixed;right:clamp(10px,3vw,26px);bottom:calc(env(safe-area-inset-bottom,0px) + 78px);z-index:999999;width:clamp(246px,34vw,356px);max-width:calc(100vw - 20px);font-family:"CustomFont","NanoOldSong-A","LXGW WenKai","Noto Serif SC",serif;color:#30241f;pointer-events:none;opacity:0;transform:translateY(12px) scale(.985);transition:opacity .22s ease,transform .22s ease}',
      '#' + ROOT_ID + '.ykr-visible{opacity:1;transform:translateY(0) scale(1)}',
      '#' + ROOT_ID + ':not(.ykr-visible){display:none}',
      '#' + ROOT_ID + ' *{box-sizing:border-box}',
      '.ykr-seal{position:absolute;right:20px;top:-38px;width:62px;height:62px;padding:7px;border:1px solid rgba(93,45,35,.36);border-radius:999px;background:radial-gradient(circle at 33% 24%,rgba(255,241,217,.98),rgba(216,181,133,.94) 45%,rgba(101,43,36,.98) 100%);box-shadow:0 10px 22px rgba(0,0,0,.32),inset 0 2px 0 rgba(255,255,255,.32),inset 0 -5px 10px rgba(63,20,15,.33);cursor:pointer;pointer-events:auto;z-index:5;transform-origin:50% 10%;animation:ykrSealFloat 3.8s ease-in-out infinite}',
      '.ykr-seal:before{content:"";position:absolute;left:50%;top:58px;width:1px;height:20px;background:linear-gradient(to bottom,rgba(92,44,35,.6),transparent)}',
      '.ykr-seal img{width:100%;height:100%;display:block;object-fit:contain;filter:drop-shadow(0 2px 2px rgba(50,16,12,.38))}',
      '#' + ROOT_ID + '[data-mood="高兴"] .ykr-seal{background:radial-gradient(circle at 33% 24%,rgba(255,245,223,.98),rgba(226,184,121,.96) 45%,rgba(151,58,45,.98) 100%)}',
      '#' + ROOT_ID + '[data-mood="低落"] .ykr-seal,#' + ROOT_ID + '[data-mood="危险"] .ykr-seal,#' + ROOT_ID + '[data-mood="愤怒"] .ykr-seal{background:radial-gradient(circle at 33% 24%,rgba(231,219,205,.96),rgba(153,131,118,.94) 45%,rgba(52,36,39,.98) 100%)}',
      '.ykr-book{position:relative;pointer-events:auto;border-radius:19px 19px 15px 15px;overflow:hidden;background:linear-gradient(135deg,rgba(255,255,255,.28),transparent 30%),radial-gradient(circle at 22% 8%,rgba(255,242,210,.7),transparent 34%),linear-gradient(180deg,rgba(239,224,196,.95),rgba(206,184,150,.94));border:1px solid rgba(96,58,42,.32);box-shadow:0 18px 40px rgba(0,0,0,.34),inset 0 2px 0 rgba(255,255,255,.26),inset 0 -16px 24px rgba(75,43,30,.10);backdrop-filter:blur(9px)}',
      '.ykr-book:before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.54;background-image:radial-gradient(circle at 10% 20%,rgba(88,60,42,.09) 0 1px,transparent 1.5px),radial-gradient(circle at 80% 35%,rgba(88,60,42,.07) 0 1px,transparent 1.4px),linear-gradient(90deg,rgba(255,255,255,.12),transparent 22%,rgba(77,45,35,.07) 90%);background-size:18px 22px,23px 19px,100% 100%;mix-blend-mode:multiply}',
      '.ykr-book:after{content:"";position:absolute;inset:8px;border:1px solid rgba(112,70,52,.18);border-radius:13px;pointer-events:none}',
      '.ykr-inner{position:relative;z-index:2;padding:18px 18px 16px}',
      '.ykr-close{position:absolute;right:12px;top:12px;width:24px;height:24px;border:1px solid rgba(99,58,43,.18);border-radius:50%;background:rgba(255,255,255,.18);color:rgba(64,43,35,.64);line-height:20px;cursor:pointer}',
      '.ykr-title-area{padding-right:66px;text-align:left}',
      '.ykr-title{display:inline-flex;align-items:center;gap:7px;font-size:15px;font-weight:700;letter-spacing:.24em;color:#51342b;line-height:1}',
      '.ykr-title:before,.ykr-title:after{content:"";width:15px;height:1px;background:linear-gradient(to right,transparent,rgba(105,62,44,.46),transparent)}',
      '.ykr-subtitle{margin-top:5px;color:rgba(82,56,46,.58);font-size:9px;letter-spacing:.32em;text-transform:uppercase}',
      '.ykr-meta{margin-top:12px;text-align:center;cursor:pointer}',
      '.ykr-place-time{display:inline-flex;align-items:center;justify-content:center;gap:8px;max-width:100%;padding:5px 12px;border-radius:999px;background:rgba(67,38,31,.08);color:rgba(49,34,30,.84);font-size:12px;letter-spacing:.08em}',
      '.ykr-place,.ykr-time{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.ykr-dot{color:rgba(137,51,45,.55);font-style:normal}',
      '.ykr-name{margin-top:10px;color:#2f2521;font-size:21px;font-weight:700;letter-spacing:.16em;text-shadow:0 1px 0 rgba(255,255,255,.34)}',
      '.ykr-mood{width:min(210px,86%);margin:13px auto 0}',
      '.ykr-mood-row{display:flex;align-items:center;justify-content:space-between;color:rgba(65,43,36,.74);font-size:11px;letter-spacing:.13em}',
      '.ykr-mood-value{font-weight:700;color:rgba(111,43,37,.88)}',
      '.ykr-mood-bar{position:relative;height:7px;margin-top:7px;border-radius:999px;overflow:hidden;background:linear-gradient(90deg,rgba(57,42,38,.22),rgba(255,255,255,.18));box-shadow:inset 0 1px 3px rgba(43,28,23,.28),0 1px 0 rgba(255,255,255,.28)}',
      '.ykr-mood-fill{position:absolute;inset:0 auto 0 0;width:50%;border-radius:999px;background:linear-gradient(90deg,rgba(116,45,39,.88),rgba(184,149,94,.88));box-shadow:0 0 10px rgba(135,54,45,.22),inset 0 1px 0 rgba(255,255,255,.28);transition:width .48s ease}',
      '.ykr-quote{position:relative;margin:15px 2px 0;padding:14px 15px 15px;border-radius:12px;background:radial-gradient(circle at 0 0,rgba(137,51,45,.24),transparent 34%),linear-gradient(180deg,rgba(43,35,32,.94),rgba(32,26,24,.96));color:#f1dfc2;box-shadow:0 8px 18px rgba(0,0,0,.18),inset 0 1px 0 rgba(255,255,255,.08);cursor:pointer}',
      '.ykr-quote:before{content:"心ノ聲";position:absolute;right:12px;top:-8px;padding:2px 7px;border-radius:999px;background:rgba(137,51,45,.96);color:#f6e8ce;font-size:10px;letter-spacing:.16em}',
      '.ykr-quote-text{display:inline;min-height:2.8em;font-size:13px;line-height:1.75;letter-spacing:.04em;white-space:pre-wrap}',
      '.ykr-cursor{display:inline-block;margin-left:5px;color:#d8b377;animation:ykrCursor 1.05s ease-in-out infinite}',
      '.ykr-hint{margin-top:9px;text-align:center;color:rgba(77,48,39,.46);font-size:10px;letter-spacing:.16em}',
      '.ykr-detail{display:none;margin-top:13px;padding-top:11px;border-top:1px solid rgba(94,58,43,.18)}',
      '#' + ROOT_ID + '.ykr-expanded .ykr-detail{display:block;animation:ykrInkIn .24s ease both}',
      '#' + ROOT_ID + '.ykr-expanded .ykr-hint{display:none}',
      '.ykr-fold{margin-top:8px;border-radius:12px;border:1px solid rgba(95,57,43,.16);background:rgba(255,255,255,.16);overflow:hidden}',
      '.ykr-fold summary{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 11px;cursor:pointer;list-style:none;color:rgba(52,36,31,.84);font-size:12px;font-weight:700;letter-spacing:.10em;user-select:none}',
      '.ykr-fold summary::-webkit-details-marker{display:none}',
      '.ykr-fold summary:after{content:"◆";color:rgba(137,51,45,.62);font-size:10px;transform:rotate(0deg);transition:transform .2s ease}',
      '.ykr-fold[open] summary:after{transform:rotate(45deg)}',
      '.ykr-fold-body{padding:0 11px 11px;color:rgba(43,31,28,.78);font-size:12px;line-height:1.72;letter-spacing:.03em;white-space:pre-wrap}',
      '.ykr-main-title{display:inline-block;margin-bottom:6px;padding:2px 8px;border-radius:999px;background:rgba(137,51,45,.10);color:rgba(98,38,33,.94);font-weight:700}',
      '.ykr-todo-list{display:grid;gap:6px;margin:0;padding:0;list-style:none}',
      '.ykr-todo-list li{position:relative;padding:7px 9px 7px 30px;border-radius:10px;background:rgba(48,35,31,.07);color:rgba(42,31,28,.78)}',
      '.ykr-todo-list li:before{content:"壱";position:absolute;left:9px;top:7px;color:rgba(137,51,45,.72);font-size:11px;font-weight:700}',
      '.ykr-todo-list li:nth-child(2):before{content:"弐"}.ykr-todo-list li:nth-child(3):before{content:"参"}.ykr-todo-list li:nth-child(4):before{content:"肆"}.ykr-todo-list li:nth-child(5):before{content:"伍"}.ykr-todo-list li:nth-child(n+6):before{content:"◇"}',
      '.ykr-flash .ykr-quote-text{animation:ykrInkIn .22s ease both}',
      '@keyframes ykrSealFloat{0%,100%{transform:translateY(0) rotate(-1deg)}50%{transform:translateY(-3px) rotate(1.4deg)}}',
      '@keyframes ykrCursor{0%,100%{transform:translateY(0);opacity:.55}50%{transform:translateY(3px);opacity:1}}',
      '@keyframes ykrInkIn{from{opacity:0;filter:blur(3px);transform:translateY(-4px)}to{opacity:1;filter:blur(0);transform:translateY(0)}}',
      '@media(max-width:520px){#' + ROOT_ID + '{right:8px;bottom:calc(env(safe-area-inset-bottom,0px) + 70px);width:min(330px,calc(100vw - 16px))}.ykr-inner{padding:17px 15px 14px}.ykr-seal{right:15px;width:56px;height:56px}.ykr-name{font-size:19px}.ykr-quote-text{font-size:12px}}'
    ].join('\n');
    doc.head.appendChild(style);
  }

  function createUI() {
    var old = doc.getElementById(ROOT_ID);
    if (old) old.remove();

    var root = doc.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = '' +
      '<button class="ykr-seal" type="button" title="翻开/收起"><img class="ykr-avatar" src="' + ICON_URL + '" alt=""></button>' +
      '<section class="ykr-book"><div class="ykr-inner">' +
      '<button class="ykr-close" type="button" title="隐藏">×</button>' +
      '<div class="ykr-title-area"><div class="ykr-title">結縁帳</div><div class="ykr-subtitle">Yukari no Ki</div></div>' +
      '<div class="ykr-meta"><div class="ykr-place-time"><span class="ykr-place"></span><em class="ykr-dot">·</em><span class="ykr-time"></span></div><div class="ykr-name"></div></div>' +
      '<div class="ykr-mood"><div class="ykr-mood-row"><span class="ykr-mood-label"></span><span class="ykr-mood-value"></span></div><div class="ykr-mood-bar"><i class="ykr-mood-fill"></i></div></div>' +
      '<div class="ykr-quote" title="点一下切换同心情台词 / 展开札记"><span class="ykr-quote-text"></span><span class="ykr-cursor">◆</span></div>' +
      '<div class="ykr-hint">点触翻开札记</div>' +
      '<div class="ykr-detail">' +
      '<details class="ykr-fold"><summary>装束</summary><div class="ykr-fold-body ykr-outfit"></div></details>' +
      '<details class="ykr-fold" open><summary>所作</summary><div class="ykr-fold-body ykr-action"></div></details>' +
      '<details class="ykr-fold"><summary>縁の記録</summary><div class="ykr-fold-body"><span class="ykr-main-title"></span><div class="ykr-main-summary"></div></div></details>' +
      '<details class="ykr-fold"><summary>約束事</summary><div class="ykr-fold-body"><ul class="ykr-todo-list"></ul></div></details>' +
      '</div></div></section>';

    doc.body.appendChild(root);

    root.querySelector('.ykr-seal').addEventListener('click', function (event) {
      event.stopPropagation();
      toggleExpanded();
    });

    root.querySelector('.ykr-close').addEventListener('click', function (event) {
      event.stopPropagation();
      setVisible(false);
    });

    root.querySelector('.ykr-meta').addEventListener('click', function () {
      setExpanded(true);
    });

    root.querySelector('.ykr-quote').addEventListener('click', function () {
      if (!state.expanded) setExpanded(true);
      else cycleQuote();
    });

    return root;
  }

  function root() {
    return doc.getElementById(ROOT_ID);
  }

  function text(selector, value) {
    var el = doc.querySelector(selector);
    if (el) el.textContent = value == null ? '' : String(value);
  }

  function render(newData) {
    if (newData) {
      var merged = {};
      var k;
      for (k in state.data) merged[k] = state.data[k];
      for (k in newData) merged[k] = newData[k];
      state.data = merged;
    }

    var r = root() || createUI();
    var data = state.data;
    var mood = data.quoteMood || data.moodLabel || scoreToMood(data.moodValue);
    var value = clamp(data.moodValue, 0, 100);

    r.classList.toggle('ykr-visible', !!state.visible);
    r.classList.toggle('ykr-expanded', !!state.expanded);
    r.setAttribute('data-mood', mood);

    var img = r.querySelector('.ykr-avatar');
    if (img && img.getAttribute('src') !== ICON_URL) img.setAttribute('src', ICON_URL);

    text('#' + ROOT_ID + ' .ykr-place', data.place);
    text('#' + ROOT_ID + ' .ykr-time', data.time);
    text('#' + ROOT_ID + ' .ykr-name', data.name);
    text('#' + ROOT_ID + ' .ykr-mood-label', mood);
    text('#' + ROOT_ID + ' .ykr-mood-value', String(value));
    text('#' + ROOT_ID + ' .ykr-quote-text', '「' + (data.quote || '……') + '」');
    text('#' + ROOT_ID + ' .ykr-outfit', data.outfit);
    text('#' + ROOT_ID + ' .ykr-action', data.action);
    text('#' + ROOT_ID + ' .ykr-main-title', data.mainTitle);
    text('#' + ROOT_ID + ' .ykr-main-summary', data.mainSummary);

    var fill = r.querySelector('.ykr-mood-fill');
    if (fill) fill.style.width = value + '%';

    var list = r.querySelector('.ykr-todo-list');
    if (list) {
      list.innerHTML = '';
      var todos = data.todos && data.todos.length ? data.todos : ['暂无待办。'];
      for (var i = 0; i < todos.length; i++) {
        var li = doc.createElement('li');
        li.textContent = todos[i];
        list.appendChild(li);
      }
    }
  }

  function setVisible(flag) {
    state.visible = !!flag;
    localStorage.setItem(STORAGE_VISIBLE, state.visible ? '1' : '0');
    render();
  }

  function toggleVisible() {
    setVisible(!state.visible);
  }

  function setExpanded(flag) {
    state.expanded = !!flag;
    localStorage.setItem(STORAGE_EXPANDED, state.expanded ? '1' : '0');
    render();
  }

  function toggleExpanded() {
    setExpanded(!state.expanded);
  }

  function quotePool() {
    var items = state.data.quoteItems || [];
    var mood = state.data.quoteMood || state.data.moodLabel || scoreToMood(state.data.moodValue);
    var matched = items.filter(function (item) {
      return item.mood.indexOf(mood) >= 0 || mood.indexOf(item.mood) >= 0;
    });
    return matched.length ? matched : items;
  }

  function cycleQuote() {
    var pool = quotePool();
    if (!pool.length) return;
    state.quoteIndex = (state.quoteIndex + 1) % pool.length;
    var picked = pool[state.quoteIndex];
    state.data.quote = picked.text;
    state.data.quoteMood = picked.mood || state.data.quoteMood;
    var q = doc.querySelector('#' + ROOT_ID + ' .ykr-quote');
    if (q) {
      q.classList.remove('ykr-flash');
      void q.offsetWidth;
      q.classList.add('ykr-flash');
    }
    render();
  }

  function registerButton() {
    if (state.buttonRegistered) return;
    state.buttonRegistered = true;

    var appendButtons = getApi('appendInexistentScriptButtons');
    var eventOn = getApi('eventOn');
    var getButtonEvent = getApi('getButtonEvent');

    try {
      if (appendButtons) {
        appendButtons([{ name: BUTTON_NAME, visible: true }]);
      }
      if (eventOn && getButtonEvent) {
        eventOn(getButtonEvent(BUTTON_NAME), function () {
          toggleVisible();
        });
      }
    } catch (error) {
      console.warn('[結縁帳] 按钮注册失败：', error);
    }
  }

  function chatFromContext() {
    var contexts = [];
    try { if (win.SillyTavern && win.SillyTavern.getContext) contexts.push(win.SillyTavern.getContext()); } catch (error) {}
    try { if (localWin.SillyTavern && localWin.SillyTavern.getContext) contexts.push(localWin.SillyTavern.getContext()); } catch (error) {}
    try { if (typeof win.getContext === 'function') contexts.push(win.getContext()); } catch (error) {}
    try { if (typeof localWin.getContext === 'function') contexts.push(localWin.getContext()); } catch (error) {}

    for (var i = 0; i < contexts.length; i++) {
      if (contexts[i] && Array.isArray(contexts[i].chat)) return contexts[i].chat;
    }
    return null;
  }

  function findStatusFromContext() {
    var chat = chatFromContext();
    if (!chat) return null;
    for (var i = chat.length - 1; i >= 0; i--) {
      var msg = chat[i];
      if (!msg || msg.is_user) continue;
      var body = msg.mes || msg.message || '';
      var block = latestStatusBlock(body);
      if (block) return { id: i, block: block };
    }
    return null;
  }

  async function findStatusFromRunner() {
    var getChatMessages = getApi('getChatMessages');
    if (!getChatMessages) return null;
    try {
      var messages = await Promise.resolve(getChatMessages('0-{{lastMessageId}}', {
        role: 'assistant',
        hide_state: 'unhidden',
        include_swipes: false
      }));
      if (!Array.isArray(messages)) return null;
      for (var i = messages.length - 1; i >= 0; i--) {
        var msg = messages[i];
        var block = latestStatusBlock(msg && msg.message);
        if (block) return { id: msg.message_id || i, block: block };
      }
    } catch (error) {
      console.warn('[結縁帳] Runner 读取失败：', error);
    }
    return null;
  }

  function findStatusFromDom() {
    var nodes = Array.prototype.slice.call(doc.querySelectorAll('#chat .mes_text')).reverse();
    for (var i = 0; i < nodes.length; i++) {
      var block = latestStatusBlock(nodes[i].textContent || '');
      if (block) return { id: nodes.length - i, block: block };
    }
    return null;
  }

  async function updateFromChat() {
    var found = findStatusFromContext();
    if (!found) found = await findStatusFromRunner();
    if (!found) found = findStatusFromDom();

    if (found && found.block) {
      state.quoteIndex = 0;
      render(parseStatus(found.block, found.id));
    } else {
      render();
    }
    hideStatusBlocks();
  }

  function scheduleUpdate(delay) {
    clearTimeout(state.updateTimer);
    state.updateTimer = setTimeout(function () {
      updateFromChat();
    }, delay || 500);
  }

  function bindEvents() {
    var eventOn = getApi('eventOn');
    var events = getGlobalValue('tavern_events');
    if (eventOn && events) {
      ['MESSAGE_RECEIVED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'CHAT_CHANGED', 'GENERATION_ENDED'].forEach(function (name) {
        try {
          if (events[name]) eventOn(events[name], function () { scheduleUpdate(520); });
        } catch (error) {}
      });
    }

    var chat = doc.querySelector('#chat');
    if (chat && win.MutationObserver) {
      state.observer = new win.MutationObserver(function () {
        scheduleUpdate(700);
      });
      state.observer.observe(chat, { childList: true, subtree: true, characterData: true });
    }
  }

  function hideStatusBlocks() {
    var nodes = doc.querySelectorAll('#chat .mes_text');
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      try {
        var tags = node.querySelectorAll('status');
        for (var j = 0; j < tags.length; j++) {
          tags[j].classList.add('ykr-status-hidden');
          tags[j].style.display = 'none';
        }
        var html = node.innerHTML || '';
        if (!/(&lt;status|<status)/i.test(html)) continue;
        var replaced = html
          .replace(/<status\b[^>]*>[\s\S]*?<\/status>/gi, '<span class="ykr-status-hidden"></span>')
          .replace(/&lt;status\b[\s\S]*?&gt;[\s\S]*?&lt;\/status&gt;/gi, '<span class="ykr-status-hidden"></span>');
        if (replaced !== html) node.innerHTML = replaced;
      } catch (error) {}
    }
  }

  function debug() {
    var lines = [];
    lines.push('結縁帳 ' + VERSION);
    lines.push('target is parent: ' + (doc !== localDoc));
    lines.push('target has body: ' + !!doc.body);
    lines.push('target has head: ' + !!doc.head);
    lines.push('target has #chat: ' + !!doc.querySelector('#chat'));
    lines.push('root exists: ' + !!doc.getElementById(ROOT_ID));
    lines.push('style exists: ' + !!doc.getElementById(STYLE_ID));
    lines.push('visible: ' + state.visible);
    lines.push('button api append: ' + !!getApi('appendInexistentScriptButtons'));
    lines.push('button api eventOn: ' + !!getApi('eventOn'));
    lines.push('button api getButtonEvent: ' + !!getApi('getButtonEvent'));
    lines.push('getChatMessages: ' + !!getApi('getChatMessages'));
    alert(lines.join('\n'));
  }

  function destroy() {
    clearTimeout(state.updateTimer);
    if (state.observer) {
      try { state.observer.disconnect(); } catch (error) {}
      state.observer = null;
    }
    removeOldElements();
  }

  function init() {
    waitForPage(function () {
      addStyle();
      createUI();
      render();
      registerButton();
      bindEvents();
      scheduleUpdate(260);
      console.log('[結縁帳] loaded ' + VERSION, { targetIsParent: doc !== localDoc });
    });
  }

  window.__YUKARI_STATUS_BOOK__ = {
    version: VERSION,
    show: function () { setVisible(true); },
    hide: function () { setVisible(false); },
    toggle: toggleVisible,
    expand: function () { setExpanded(true); },
    collapse: function () { setExpanded(false); },
    update: updateFromChat,
    debug: debug,
    destroy: destroy
  };

  init();
})();
