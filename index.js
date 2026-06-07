/* 虚见相 · 結縁帳状态册 v4.0
 * SillyTavern JS-Slash-Runner / 酒馆助手脚本库远程加载用
 * 参考桌宠类写法：自动判断 parent document，UI 注入主页面；按钮仍走酒馆助手脚本环境。
 */
(function () {
  console.log('[結縁帳] v4.0 loading...');

  let doc = document;
  let win = window;
  try {
    if (window.parent && window.parent !== window) {
      const parentDoc = window.parent.document;
      if (parentDoc && parentDoc.body) {
        doc = parentDoc;
        win = window.parent;
      }
    }
  } catch (e) {
    console.warn('[結縁帳] parent document 不可访问，回退当前 document', e);
    doc = document;
    win = window;
  }

  const CONFIG = {
    buttonName: '結縁帳',
    icon: 'https://files.catbox.moe/bv172s.png',
    rootId: 'ykr-status-book-root',
    styleId: 'ykr-status-book-style',
    storageVisible: 'ykr_status_book_visible_v4',
    storageExpanded: 'ykr_status_book_expanded_v4',
    hideStatusBlockInChat: true,
    avatarByMood: {
      default: 'https://files.catbox.moe/bv172s.png',
      高兴: 'https://files.catbox.moe/bv172s.png',
      平静: 'https://files.catbox.moe/bv172s.png',
      低落: 'https://files.catbox.moe/bv172s.png',
      危险: 'https://files.catbox.moe/bv172s.png',
      愤怒: 'https://files.catbox.moe/bv172s.png',
    },
    fallback: {
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
      quoteItems: [{ mood: '平静', text: '……还没有新的记录呢。' }],
    },
  };

  const state = {
    // 第一次加载默认显示挂坠，避免“按钮有了但看不到悬浮图标”。之后尊重用户隐藏状态。
    visible: localStorage.getItem(CONFIG.storageVisible) !== '0',
    expanded: localStorage.getItem(CONFIG.storageExpanded) === '1',
    data: { ...CONFIG.fallback },
    quoteCycle: 0,
    updateTimer: null,
    observer: null,
    registeredButton: false,
  };

  function api(name) {
    try { if (typeof window[name] === 'function') return window[name].bind(window); } catch (_) {}
    try { if (typeof globalThis[name] === 'function') return globalThis[name].bind(globalThis); } catch (_) {}
    try { if (typeof win[name] === 'function') return win[name].bind(win); } catch (_) {}
    return null;
  }

  function cleanup() {
    const targets = [document];
    try {
      if (window.parent && window.parent.document && window.parent.document !== document) targets.push(window.parent.document);
    } catch (_) {}
    targets.forEach(d => {
      try { d.getElementById(CONFIG.rootId)?.remove(); } catch (_) {}
      try { d.getElementById(CONFIG.styleId)?.remove(); } catch (_) {}
    });
  }

  cleanup();

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function clean(s) { return String(s ?? '').replace(/\r/g, '').replace(/\{\/\/.*?\}/g, '').replace(/[ \t]+$/gm, '').trim(); }
  function value(s) { return String(s ?? '').replace(/\{\/\/.*?\}/g, '').trim(); }
  function scoreToMood(score) {
    const n = Number(score);
    if (Number.isNaN(n)) return '平静';
    if (n >= 65) return '高兴';
    if (n >= 35) return '平静';
    if (n >= 15) return '低落';
    return '危险';
  }

  function latestStatusBlock(text) {
    const list = [...String(text ?? '').matchAll(/<status\b[^>]*>([\s\S]*?)<\/status>/gi)];
    return list.length ? (list[list.length - 1][1] || '') : '';
  }

  function splitSections(block) {
    const keys = ['地点', '时间', '名字', '心情值', '穿着', '当前动作', '当前主线', '角色待办', '台词'];
    const sections = Object.fromEntries(keys.map(k => [k, []]));
    let current = null;
    clean(block).split('\n').map(v => v.trim()).filter(Boolean).forEach(line => {
      const m = line.match(/^(地点|时间|名字|心情值|穿着|当前动作|当前主线|角色待办|台词)\s*[:：]\s*(.*)$/);
      if (m) {
        current = m[1];
        const v = value(m[2]);
        if (v) sections[current].push(v);
      } else if (current) {
        sections[current].push(value(line));
      }
    });
    return sections;
  }

  function parseTodos(raw) {
    const items = String(raw ?? '').split('\n').map(v => v.trim()).filter(Boolean)
      .map(v => v.replace(/^\d+\s*[.．、]\s*/, '').replace(/^[-•◇◆]\s*/, '').trim())
      .filter(Boolean);
    return items.length ? items : ['暂无待办。'];
  }

  function parseMain(raw) {
    const text = String(raw ?? '').trim();
    if (!text) return { title: '未启封', summary: '尚未读取到当前主线。' };
    if (text.includes('|')) {
      const [title, ...rest] = text.split('|');
      return { title: title.trim() || '未命名主线', summary: rest.join('|').trim() || '暂无梗概。' };
    }
    const lines = text.split('\n').map(v => v.trim()).filter(Boolean);
    return { title: lines[0] || '未命名主线', summary: lines.slice(1).join('\n') || '暂无梗概。' };
  }

  function parseQuotes(raw, moodValue, messageId) {
    const lines = String(raw ?? '').split('\n').map(v => v.trim()).filter(Boolean);
    const items = [];
    lines.forEach(line => {
      const m = line.match(/^([^：:]{1,12})\s*[:：]\s*(.+)$/);
      if (m) items.push({ mood: m[1].trim(), text: m[2].trim() });
      else if (items.length) items[items.length - 1].text += '\n' + line;
    });
    const mood = scoreToMood(moodValue);
    if (!items.length) return { quote: '……', quoteMood: mood, quoteItems: [{ mood, text: '……' }] };
    const pool = items.filter(i => i.mood.includes(mood) || mood.includes(i.mood));
    const pickedPool = pool.length ? pool : items;
    const picked = pickedPool[Math.abs(Number(messageId) || 0) % pickedPool.length];
    return { quote: picked.text, quoteMood: picked.mood || mood, quoteItems: items };
  }

  function parseStatus(block, messageId) {
    const s = splitSections(block);
    const moodValue = clamp(Number((s['心情值'][0] ?? '50').replace(/[^\d.-]/g, '')) || 50, 0, 100);
    const main = parseMain(s['当前主线'].join('\n'));
    const quote = parseQuotes(s['台词'].join('\n'), moodValue, messageId);
    return {
      place: s['地点'][0] || CONFIG.fallback.place,
      time: s['时间'][0] || CONFIG.fallback.time,
      name: s['名字'][0] || CONFIG.fallback.name,
      moodValue,
      moodLabel: quote.quoteMood || scoreToMood(moodValue),
      outfit: s['穿着'].join('\n').trim() || '未记录',
      action: s['当前动作'].join('\n').trim() || CONFIG.fallback.action,
      mainTitle: main.title,
      mainSummary: main.summary,
      todos: parseTodos(s['角色待办'].join('\n')),
      quote: quote.quote,
      quoteMood: quote.quoteMood,
      quoteItems: quote.quoteItems,
    };
  }

  function addStyle() {
    if (doc.getElementById(CONFIG.styleId)) return;
    const style = doc.createElement('style');
    style.id = CONFIG.styleId;
    style.textContent = `
      status,.ykr-status-hidden{display:none!important;}
      #${CONFIG.rootId}{--ink:#30241f;--paper:rgba(239,224,196,.95);--paper2:rgba(206,184,150,.94);--red:#89332d;--gold:#b4955e;--shadow:rgba(0,0,0,.34);position:fixed;right:clamp(10px,3vw,28px);bottom:calc(env(safe-area-inset-bottom,0px) + 76px);z-index:99999;width:clamp(242px,34vw,356px);max-width:calc(100vw - 20px);color:var(--ink);font-family:"CustomFont","NanoOldSong-A","LXGW WenKai","Noto Serif SC","Source Han Serif SC",serif;pointer-events:none;opacity:0;transform:translateY(12px) scale(.985);transition:opacity .24s ease,transform .24s ease;}
      #${CONFIG.rootId}.ykr-visible{opacity:1;transform:translateY(0) scale(1);}
      #${CONFIG.rootId}:not(.ykr-visible){display:none;}
      #${CONFIG.rootId} *{box-sizing:border-box;}
      .ykr-seal{position:absolute;right:20px;top:-37px;width:62px;height:62px;padding:7px;border:1px solid rgba(93,45,35,.36);border-radius:999px;background:radial-gradient(circle at 33% 24%,rgba(255,241,217,.98),rgba(216,181,133,.94) 45%,rgba(101,43,36,.98) 100%);box-shadow:0 10px 22px rgba(0,0,0,.32),inset 0 2px 0 rgba(255,255,255,.32),inset 0 -5px 10px rgba(63,20,15,.33);cursor:pointer;pointer-events:auto;z-index:5;transform-origin:50% 10%;animation:ykrSealFloat 3.8s ease-in-out infinite;}
      .ykr-seal::before{content:"";position:absolute;left:50%;top:58px;width:1px;height:20px;background:linear-gradient(to bottom,rgba(92,44,35,.6),transparent);}
      .ykr-seal img{width:100%;height:100%;display:block;object-fit:contain;filter:drop-shadow(0 2px 2px rgba(50,16,12,.38));}
      #${CONFIG.rootId}[data-mood="高兴"] .ykr-seal{background:radial-gradient(circle at 33% 24%,rgba(255,245,223,.98),rgba(226,184,121,.96) 45%,rgba(151,58,45,.98) 100%);}
      #${CONFIG.rootId}[data-mood="低落"] .ykr-seal,#${CONFIG.rootId}[data-mood="危险"] .ykr-seal,#${CONFIG.rootId}[data-mood="愤怒"] .ykr-seal{background:radial-gradient(circle at 33% 24%,rgba(231,219,205,.96),rgba(153,131,118,.94) 45%,rgba(52,36,39,.98) 100%);}
      .ykr-book{position:relative;pointer-events:auto;border-radius:19px 19px 15px 15px;overflow:hidden;background:linear-gradient(135deg,rgba(255,255,255,.28),transparent 30%),radial-gradient(circle at 22% 8%,rgba(255,242,210,.7),transparent 34%),linear-gradient(180deg,var(--paper),var(--paper2));border:1px solid rgba(96,58,42,.32);box-shadow:0 18px 40px var(--shadow),inset 0 2px 0 rgba(255,255,255,.26),inset 0 -16px 24px rgba(75,43,30,.10);backdrop-filter:blur(9px);}
      .ykr-book::before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.54;background-image:radial-gradient(circle at 10% 20%,rgba(88,60,42,.09) 0 1px,transparent 1.5px),radial-gradient(circle at 80% 35%,rgba(88,60,42,.07) 0 1px,transparent 1.4px),linear-gradient(90deg,rgba(255,255,255,.12),transparent 22%,rgba(77,45,35,.07) 90%);background-size:18px 22px,23px 19px,100% 100%;mix-blend-mode:multiply;}
      .ykr-book::after{content:"";position:absolute;inset:8px;border:1px solid rgba(112,70,52,.18);border-radius:13px;pointer-events:none;}
      .ykr-inner{position:relative;z-index:2;padding:18px 18px 16px;}
      .ykr-close{position:absolute;right:12px;top:12px;width:24px;height:24px;border:1px solid rgba(99,58,43,.18);border-radius:50%;background:rgba(255,255,255,.18);color:rgba(64,43,35,.64);line-height:20px;cursor:pointer;}
      .ykr-title-area{padding-right:66px;text-align:left;}.ykr-title{display:inline-flex;align-items:center;gap:7px;font-size:15px;font-weight:700;letter-spacing:.24em;color:#51342b;line-height:1;}.ykr-title::before,.ykr-title::after{content:"";width:15px;height:1px;background:linear-gradient(to right,transparent,rgba(105,62,44,.46),transparent);}.ykr-subtitle{margin-top:5px;color:rgba(82,56,46,.58);font-size:9px;letter-spacing:.32em;text-transform:uppercase;}
      .ykr-meta{margin-top:12px;text-align:center;cursor:pointer;}.ykr-place-time{display:inline-flex;align-items:center;justify-content:center;gap:8px;max-width:100%;padding:5px 12px;border-radius:999px;background:rgba(67,38,31,.08);color:rgba(49,34,30,.84);font-size:12px;letter-spacing:.08em;}.ykr-place,.ykr-time{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.ykr-dot{color:rgba(137,51,45,.55);font-style:normal;}.ykr-name{margin-top:10px;color:#2f2521;font-size:21px;font-weight:700;letter-spacing:.16em;text-shadow:0 1px 0 rgba(255,255,255,.34);}
      .ykr-mood{width:min(210px,86%);margin:13px auto 0;}.ykr-mood-row{display:flex;align-items:center;justify-content:space-between;color:rgba(65,43,36,.74);font-size:11px;letter-spacing:.13em;}.ykr-mood-value{font-weight:700;color:rgba(111,43,37,.88);}.ykr-mood-bar{position:relative;height:7px;margin-top:7px;border-radius:999px;overflow:hidden;background:linear-gradient(90deg,rgba(57,42,38,.22),rgba(255,255,255,.18));box-shadow:inset 0 1px 3px rgba(43,28,23,.28),0 1px 0 rgba(255,255,255,.28);}.ykr-mood-fill{position:absolute;inset:0 auto 0 0;width:50%;border-radius:999px;background:linear-gradient(90deg,rgba(116,45,39,.88),rgba(184,149,94,.88));box-shadow:0 0 10px rgba(135,54,45,.22),inset 0 1px 0 rgba(255,255,255,.28);transition:width .48s ease;}
      .ykr-quote{position:relative;margin:15px 2px 0;padding:14px 15px 15px;border-radius:12px;background:radial-gradient(circle at 0 0,rgba(137,51,45,.24),transparent 34%),linear-gradient(180deg,rgba(43,35,32,.94),rgba(32,26,24,.96));color:#f1dfc2;box-shadow:0 8px 18px rgba(0,0,0,.18),inset 0 1px 0 rgba(255,255,255,.08);cursor:pointer;}.ykr-quote::before{content:"心ノ聲";position:absolute;right:12px;top:-8px;padding:2px 7px;border-radius:999px;background:rgba(137,51,45,.96);color:#f6e8ce;font-size:10px;letter-spacing:.16em;}.ykr-quote-text{display:inline;min-height:2.8em;font-size:13px;line-height:1.75;letter-spacing:.04em;white-space:pre-wrap;}.ykr-cursor{display:inline-block;margin-left:5px;color:#d8b377;animation:ykrCursor 1.05s ease-in-out infinite;}.ykr-hint{margin-top:9px;text-align:center;color:rgba(77,48,39,.46);font-size:10px;letter-spacing:.16em;}
      .ykr-detail{display:none;margin-top:13px;padding-top:11px;border-top:1px solid rgba(94,58,43,.18);}#${CONFIG.rootId}.ykr-expanded .ykr-detail{display:block;animation:ykrInkIn .24s ease both;}#${CONFIG.rootId}.ykr-expanded .ykr-hint{display:none;}.ykr-fold{margin-top:8px;border-radius:12px;border:1px solid rgba(95,57,43,.16);background:rgba(255,255,255,.16);overflow:hidden;}.ykr-fold summary{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 11px;cursor:pointer;list-style:none;color:rgba(52,36,31,.84);font-size:12px;font-weight:700;letter-spacing:.10em;user-select:none;}.ykr-fold summary::-webkit-details-marker{display:none;}.ykr-fold summary::after{content:"◆";color:rgba(137,51,45,.62);font-size:10px;transform:rotate(0deg);transition:transform .2s ease;}.ykr-fold[open] summary::after{transform:rotate(45deg);}.ykr-fold-body{padding:0 11px 11px;color:rgba(43,31,28,.78);font-size:12px;line-height:1.72;letter-spacing:.03em;white-space:pre-wrap;}.ykr-main-title{display:inline-block;margin-bottom:6px;padding:2px 8px;border-radius:999px;background:rgba(137,51,45,.10);color:rgba(98,38,33,.94);font-weight:700;}.ykr-todo-list{display:grid;gap:6px;margin:0;padding:0;list-style:none;}.ykr-todo-list li{position:relative;padding:7px 9px 7px 30px;border-radius:10px;background:rgba(48,35,31,.07);color:rgba(42,31,28,.78);}.ykr-todo-list li::before{content:"壱";position:absolute;left:9px;top:7px;color:rgba(137,51,45,.72);font-size:11px;font-weight:700;}.ykr-todo-list li:nth-child(2)::before{content:"弐";}.ykr-todo-list li:nth-child(3)::before{content:"参";}.ykr-todo-list li:nth-child(4)::before{content:"肆";}.ykr-todo-list li:nth-child(5)::before{content:"伍";}.ykr-todo-list li:nth-child(n+6)::before{content:"◇";}.ykr-quote.ykr-flash .ykr-quote-text{animation:ykrInkIn .22s ease both;}
      @keyframes ykrSealFloat{0%,100%{transform:translateY(0) rotate(-1deg);}50%{transform:translateY(-3px) rotate(1.4deg);}}@keyframes ykrCursor{0%,100%{transform:translateY(0);opacity:.55;}50%{transform:translateY(3px);opacity:1;}}@keyframes ykrInkIn{from{opacity:0;filter:blur(3px);transform:translateY(-4px);}to{opacity:1;filter:blur(0);transform:translateY(0);}}
      @media(max-width:520px){#${CONFIG.rootId}{right:8px;bottom:calc(env(safe-area-inset-bottom,0px) + 70px);width:min(330px,calc(100vw - 16px));}.ykr-inner{padding:17px 15px 14px;}.ykr-seal{right:15px;width:56px;height:56px;}.ykr-name{font-size:19px;}.ykr-quote-text{font-size:12px;}}
    `;
    doc.head.appendChild(style);
  }

  function makeUI() {
    let root = doc.getElementById(CONFIG.rootId);
    if (root) return root;
    root = doc.createElement('div');
    root.id = CONFIG.rootId;
    root.innerHTML = `
      <button class="ykr-seal" type="button" title="翻开/收起"><img class="ykr-avatar" src="${CONFIG.icon}" alt=""></button>
      <section class="ykr-book"><div class="ykr-inner">
        <button class="ykr-close" type="button" title="隐藏">×</button>
        <div class="ykr-title-area"><div class="ykr-title">結縁帳</div><div class="ykr-subtitle">Yukari no Ki</div></div>
        <div class="ykr-meta"><div class="ykr-place-time"><span class="ykr-place"></span><em class="ykr-dot">·</em><span class="ykr-time"></span></div><div class="ykr-name"></div></div>
        <div class="ykr-mood"><div class="ykr-mood-row"><span class="ykr-mood-label"></span><span class="ykr-mood-value"></span></div><div class="ykr-mood-bar"><i class="ykr-mood-fill"></i></div></div>
        <div class="ykr-quote" title="点一下切换同心情台词 / 展开札记"><span class="ykr-quote-text"></span><span class="ykr-cursor">◆</span></div>
        <div class="ykr-hint">点触翻开札记</div>
        <div class="ykr-detail">
          <details class="ykr-fold"><summary>装束</summary><div class="ykr-fold-body ykr-outfit"></div></details>
          <details class="ykr-fold" open><summary>所作</summary><div class="ykr-fold-body ykr-action"></div></details>
          <details class="ykr-fold"><summary>縁の記録</summary><div class="ykr-fold-body"><span class="ykr-main-title"></span><div class="ykr-main-summary"></div></div></details>
          <details class="ykr-fold"><summary>約束事</summary><div class="ykr-fold-body"><ul class="ykr-todo-list"></ul></div></details>
        </div>
      </div></section>`;
    doc.body.appendChild(root);

    root.querySelector('.ykr-seal').addEventListener('click', e => { e.stopPropagation(); toggleExpanded(); });
    root.querySelector('.ykr-close').addEventListener('click', e => { e.stopPropagation(); setVisible(false); });
    root.querySelector('.ykr-meta').addEventListener('click', () => setExpanded(true));
    root.querySelector('.ykr-quote').addEventListener('click', () => { if (!state.expanded) setExpanded(true); else cycleQuote(); });
    return root;
  }

  function setText(sel, text) { const el = doc.querySelector(sel); if (el) el.textContent = text ?? ''; }
  function setVisible(v) { state.visible = Boolean(v); localStorage.setItem(CONFIG.storageVisible, state.visible ? '1' : '0'); render(); }
  function toggleVisible() { setVisible(!state.visible); }
  function setExpanded(v) { state.expanded = Boolean(v); localStorage.setItem(CONFIG.storageExpanded, state.expanded ? '1' : '0'); render(); }
  function toggleExpanded() { setExpanded(!state.expanded); }

  function quotePool() {
    const items = state.data.quoteItems || [];
    const mood = state.data.quoteMood || state.data.moodLabel || scoreToMood(state.data.moodValue);
    const pool = items.filter(i => i.mood.includes(mood) || mood.includes(i.mood));
    return pool.length ? pool : items;
  }
  function cycleQuote() {
    const pool = quotePool();
    if (!pool.length) return;
    state.quoteCycle = (state.quoteCycle + 1) % pool.length;
    const p = pool[state.quoteCycle];
    state.data.quote = p.text;
    state.data.quoteMood = p.mood || state.data.quoteMood;
    const q = doc.querySelector(`#${CONFIG.rootId} .ykr-quote`);
    q?.classList.remove('ykr-flash'); void q?.offsetWidth; q?.classList.add('ykr-flash');
    render();
  }

  function render(next) {
    if (next) state.data = { ...CONFIG.fallback, ...next };
    const root = makeUI();
    const d = state.data;
    const mood = d.quoteMood || d.moodLabel || scoreToMood(d.moodValue);
    const moodValue = clamp(Number(d.moodValue) || 0, 0, 100);
    root.classList.toggle('ykr-visible', state.visible);
    root.classList.toggle('ykr-expanded', state.expanded);
    root.dataset.mood = mood;
    const avatar = CONFIG.avatarByMood[mood] || CONFIG.avatarByMood.default || CONFIG.icon;
    const img = root.querySelector('.ykr-avatar');
    if (img && img.getAttribute('src') !== avatar) img.setAttribute('src', avatar);
    setText(`#${CONFIG.rootId} .ykr-place`, d.place);
    setText(`#${CONFIG.rootId} .ykr-time`, d.time);
    setText(`#${CONFIG.rootId} .ykr-name`, d.name);
    setText(`#${CONFIG.rootId} .ykr-mood-label`, mood);
    setText(`#${CONFIG.rootId} .ykr-mood-value`, `${moodValue}`);
    setText(`#${CONFIG.rootId} .ykr-quote-text`, `「${d.quote || '……'}」`);
    setText(`#${CONFIG.rootId} .ykr-outfit`, d.outfit);
    setText(`#${CONFIG.rootId} .ykr-action`, d.action);
    setText(`#${CONFIG.rootId} .ykr-main-title`, d.mainTitle);
    setText(`#${CONFIG.rootId} .ykr-main-summary`, d.mainSummary);
    const fill = root.querySelector('.ykr-mood-fill');
    if (fill) fill.style.width = `${moodValue}%`;
    const list = root.querySelector('.ykr-todo-list');
    if (list) {
      list.innerHTML = '';
      (Array.isArray(d.todos) && d.todos.length ? d.todos : CONFIG.fallback.todos).forEach(todo => {
        const li = doc.createElement('li');
        li.textContent = todo;
        list.appendChild(li);
      });
    }
  }

  function registerButton() {
    if (state.registeredButton) return;
    try {
      const appendButtons = api('appendInexistentScriptButtons');
      const eventOn = api('eventOn');
      const getButtonEvent = api('getButtonEvent');
      if (appendButtons) appendButtons([{ name: CONFIG.buttonName, visible: true }]);
      if (eventOn && getButtonEvent) {
        eventOn(getButtonEvent(CONFIG.buttonName), () => toggleVisible());
        state.registeredButton = true;
      }
    } catch (e) {
      console.warn('[結縁帳] 按钮注册失败，但悬浮挂坠仍会显示', e);
    }
  }

  async function lastMessageId() {
    try { const f = api('getLastMessageId'); if (f) { const id = Number(f()); if (!Number.isNaN(id)) return id; } } catch (_) {}
    try { const f = api('triggerSlash'); if (f) { const id = Number(await f('/pass {{lastMessageId}}')); if (!Number.isNaN(id)) return id; } } catch (_) {}
    try { const chat = win.SillyTavern?.getContext?.()?.chat; if (Array.isArray(chat)) return chat.length - 1; } catch (_) {}
    return 0;
  }

  async function findStatusByHelper() {
    const getChatMessages = api('getChatMessages');
    if (!getChatMessages) return null;
    try {
      const last = await lastMessageId();
      const messages = await Promise.resolve(getChatMessages(`0-${last}`, { role: 'assistant', hide_state: 'unhidden', include_swipes: false }));
      if (!Array.isArray(messages)) return null;
      for (let i = messages.length - 1; i >= 0; i--) {
        const block = latestStatusBlock(messages[i]?.message);
        if (block) return { messageId: messages[i].message_id ?? i, block };
      }
    } catch (e) { console.warn('[結縁帳] getChatMessages 失败', e); }
    return null;
  }
  function findStatusByContext() {
    try {
      const chat = win.SillyTavern?.getContext?.()?.chat;
      if (!Array.isArray(chat)) return null;
      for (let i = chat.length - 1; i >= 0; i--) {
        if (chat[i]?.is_user) continue;
        const block = latestStatusBlock(chat[i]?.mes ?? chat[i]?.message ?? '');
        if (block) return { messageId: i, block };
      }
    } catch (e) { console.warn('[結縁帳] context 失败', e); }
    return null;
  }
  function findStatusByDom() {
    const nodes = [...doc.querySelectorAll('#chat .mes_text')].reverse();
    for (let i = 0; i < nodes.length; i++) {
      const block = latestStatusBlock(nodes[i].textContent || '');
      if (block) return { messageId: nodes.length - i, block };
    }
    return null;
  }
  async function update() {
    const found = await findStatusByHelper() || findStatusByContext() || findStatusByDom();
    if (found?.block) {
      state.quoteCycle = 0;
      render(parseStatus(found.block, found.messageId));
    } else {
      render();
    }
    hideStatusBlocks();
  }
  function schedule(delay = 420) { clearTimeout(state.updateTimer); state.updateTimer = setTimeout(update, delay); }

  function bindEvents() {
    try {
      const eventOn = api('eventOn');
      const events = (window.tavern_events || globalThis.tavern_events || win.tavern_events || {});
      if (eventOn) ['MESSAGE_RECEIVED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'CHAT_CHANGED', 'GENERATION_ENDED'].forEach(name => {
        if (events[name]) eventOn(events[name], () => schedule(520));
      });
    } catch (e) { console.warn('[結縁帳] 事件监听失败，使用 DOM 兜底', e); }
    const chat = doc.querySelector('#chat');
    if (chat && !state.observer) {
      state.observer = new win.MutationObserver(() => schedule(700));
      state.observer.observe(chat, { childList: true, subtree: true, characterData: true });
    }
  }

  function hideStatusBlocks() {
    if (!CONFIG.hideStatusBlockInChat) return;
    doc.querySelectorAll('#chat .mes_text').forEach(node => {
      try {
        node.querySelectorAll?.('status').forEach(el => { el.classList.add('ykr-status-hidden'); el.style.display = 'none'; });
        const html = node.innerHTML || '';
        if (!/(<status|&lt;status)/i.test(html)) return;
        const replaced = html
          .replace(/<status\b[^>]*>[\s\S]*?<\/status>/gi, '<span class="ykr-status-hidden"></span>')
          .replace(/&lt;status\b[\s\S]*?&gt;[\s\S]*?&lt;\/status&gt;/gi, '<span class="ykr-status-hidden"></span>');
        if (replaced !== html) node.innerHTML = replaced;
      } catch (e) { console.warn('[結縁帳] 隐藏 status 失败', e); }
    });
  }

  function init() {
    if (!doc.body || !doc.head) { setTimeout(init, 100); return; }
    addStyle();
    makeUI();
    render();
    registerButton();
    bindEvents();
    schedule(250);
    try { api('replaceScriptInfo')?.('虚见相 · 結縁帳状态册 v4：parent document 注入，自动更新 <status>。'); } catch (_) {}
    console.log('[結縁帳] mounted in', doc === document ? 'current document' : 'parent document');
  }

  function destroy() {
    clearTimeout(state.updateTimer);
    if (state.observer) state.observer.disconnect();
    cleanup();
  }

  window.__YUKARI_STATUS_BOOK__ = { init, destroy, update, toggle: toggleVisible, show: () => setVisible(true), hide: () => setVisible(false) };

  init();
})();
