(function () {
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
    doc = document;
    win = window;
  }

  const ROOT_ID = 'yukari-vn-status-root';
  const STYLE_ID = 'yukari-vn-status-style';
  const STORAGE_KEY = 'yukari-vn-status-position';
  const ICON_URL = 'https://files.catbox.moe/bv172s.png';

  const fallbackData = {
    place: '万事屋',
    time: '12:30',
    name: '虚见相',
    moodValue: 100,
    moodLabel: '高兴',
    outfit: '白襦袢、黑羽织，袖口沾着一点旧纸灰。',
    action: '倚在柜台后看账册，指尖慢慢翻过泛黄的纸页，偶尔抬眼看向门口，像是在等某个本不该来的客人。',
    mainTitle: '神隐少女事件',
    mainSummary: '雨夜来访的少女许下“想要消失”的愿望，代价尚未明晰，虚见相似乎并不意外。',
    todos: ['调查愿望代价', '准备茶点', '观察user状态'],
    quotes: [
      { mood: '高兴', text: '真是的……又露出这种表情。' },
      { mood: '高兴', text: '不过我很喜欢哦…' }
    ]
  };

  const state = {
    data: { ...fallbackData },
    quoteIndex: 0,
    typeTimer: null,
    updateTimer: null,
    observer: null,
    typingToken: 0,
    visible: true
  };

  function getTargetDocs() {
    const docs = [];
    try { docs.push(document); } catch (e) {}
    try {
      if (window.parent && window.parent.document && window.parent.document !== document) {
        docs.push(window.parent.document);
      }
    } catch (e) {}
    return [...new Set(docs)];
  }

  function cleanup() {
    clearTimeout(state.typeTimer);
    clearTimeout(state.updateTimer);
    if (state.observer) {
      try { state.observer.disconnect(); } catch (e) {}
      state.observer = null;
    }
    for (const targetDoc of getTargetDocs()) {
      try {
        targetDoc.getElementById(ROOT_ID)?.remove();
        targetDoc.getElementById(STYLE_ID)?.remove();
      } catch (e) {}
    }
  }

  cleanup();

  function safeText(value) {
    return String(value ?? '').trim();
  }

  function cleanBlock(text) {
    return String(text ?? '')
      .replace(/\r/g, '')
      .replace(/\{\/\/.*?\}/g, '')
      .replace(/[ \t]+$/gm, '')
      .trim();
  }

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
    const result = {};
    keys.forEach(key => result[key] = []);
    let current = null;

    cleanBlock(block).split('\n').map(v => v.trim()).filter(Boolean).forEach(line => {
      const match = line.match(/^(地点|时间|名字|心情值|穿着|当前动作|当前主线|角色待办|台词)\s*[:：]\s*(.*)$/);
      if (match) {
        current = match[1];
        const value = safeText(match[2]);
        if (value) result[current].push(value);
        return;
      }
      if (current) result[current].push(line);
    });

    return result;
  }

  function parseTodos(text) {
    const items = String(text ?? '')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => line.replace(/^\d+\s*[.．、]\s*/, '').replace(/^[-•◇◆]\s*/, '').trim())
      .filter(Boolean);
    return items.length ? items : fallbackData.todos;
  }

  function parseMain(text) {
    const value = safeText(text);
    if (!value) return { mainTitle: fallbackData.mainTitle, mainSummary: fallbackData.mainSummary };

    if (value.includes('|')) {
      const [title, ...rest] = value.split('|');
      return {
        mainTitle: safeText(title) || fallbackData.mainTitle,
        mainSummary: safeText(rest.join('|')) || fallbackData.mainSummary
      };
    }

    const lines = value.split('\n').map(v => v.trim()).filter(Boolean);
    return {
      mainTitle: lines[0] || fallbackData.mainTitle,
      mainSummary: lines.slice(1).join('\n') || fallbackData.mainSummary
    };
  }

  function parseQuotes(text, moodValue) {
    const lines = String(text ?? '').split('\n').map(v => v.trim()).filter(Boolean);
    const quotes = [];

    for (const line of lines) {
      const match = line.match(/^([^：:]{1,12})\s*[:：]\s*(.+)$/);
      if (match) {
        quotes.push({ mood: safeText(match[1]), text: safeText(match[2]) });
      } else if (quotes.length) {
        quotes[quotes.length - 1].text += '\n' + line;
      }
    }

    if (quotes.length) return quotes;
    const mood = scoreToMood(moodValue);
    return [{ mood, text: fallbackData.quotes[0].text }];
  }

  function parseStatus(block) {
    const sections = splitSections(block);
    const moodValue = Math.max(0, Math.min(100, Number((sections['心情值'][0] || '100').replace(/[^\d.-]/g, '')) || 0));
    const main = parseMain(sections['当前主线'].join('\n'));
    const quotes = parseQuotes(sections['台词'].join('\n'), moodValue);

    return {
      place: sections['地点'][0] || fallbackData.place,
      time: sections['时间'][0] || fallbackData.time,
      name: sections['名字'][0] || fallbackData.name,
      moodValue,
      moodLabel: scoreToMood(moodValue),
      outfit: sections['穿着'].join('\n').trim() || fallbackData.outfit,
      action: sections['当前动作'].join('\n').trim() || fallbackData.action,
      mainTitle: main.mainTitle,
      mainSummary: main.mainSummary,
      todos: parseTodos(sections['角色待办'].join('\n')),
      quotes
    };
  }

  function injectStyle() {
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      status,
      .ykr-hidden-status {
        display: none !important;
      }

      #${ROOT_ID} {
        --icon-size: 114px;
        --box-left: 70px;
        --text-pad: 78px;
        --status-top: 4px;
        --status-height: 34px;
        --dialog-top: 41px;
        --dialog-height: 70px;
        --dialog-width: min(520px, calc(100vw - 96px));
        --status-width: min(350px, calc(100vw - 160px));
        --gold: #a78d57;
        --black: #2b2a28;
        --red: #96352e;
        --cream: #ead9b0;
        --radius: 6px;
        --border: 2px;

        position: fixed !important;
        left: 24px;
        top: 160px;
        width: var(--icon-size) !important;
        height: var(--icon-size) !important;
        overflow: visible !important;
        pointer-events: none !important;
        z-index: 2147483647 !important;
        font-family: "CustomFont", "NanoOldSong-A", "LXGW WenKai", "Noto Serif SC", serif !important;
      }

      #${ROOT_ID} * {
        box-sizing: border-box !important;
      }

      #${ROOT_ID} .ykr-icon {
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        width: var(--icon-size) !important;
        height: var(--icon-size) !important;
        z-index: 60 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
        pointer-events: auto !important;
        user-select: none !important;
        -webkit-user-select: none !important;
        touch-action: none !important;
      }

      #${ROOT_ID} .ykr-icon img {
        width: var(--icon-size) !important;
        height: var(--icon-size) !important;
        display: block !important;
        object-fit: contain !important;
        pointer-events: none !important;
        user-select: none !important;
        -webkit-user-drag: none !important;
      }

      #${ROOT_ID} .ykr-ui {
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        width: 1px !important;
        height: 1px !important;
        pointer-events: none !important;
        opacity: 0 !important;
        transition: opacity .18s ease !important;
      }

      #${ROOT_ID}.panel-open .ykr-ui {
        opacity: 1 !important;
      }

      #${ROOT_ID} .status-bar,
      #${ROOT_ID} .dialog-box,
      #${ROOT_ID} .detail-float {
        opacity: 0 !important;
        transform: translateX(-16px) scaleX(.18) !important;
        transform-origin: left center !important;
        clip-path: inset(0 100% 0 0 round var(--radius)) !important;
        transition:
          opacity .22s ease,
          transform .30s cubic-bezier(.2,.9,.2,1),
          clip-path .34s cubic-bezier(.2,.9,.2,1) !important;
      }

      #${ROOT_ID}.panel-open .status-bar,
      #${ROOT_ID}.panel-open .dialog-box {
        opacity: 1 !important;
        transform: translateX(0) scaleX(1) !important;
        clip-path: inset(0 0 0 0 round var(--radius)) !important;
      }

      #${ROOT_ID} .status-bar {
        position: absolute !important;
        left: var(--box-left) !important;
        top: var(--status-top) !important;
        width: var(--status-width) !important;
        height: var(--status-height) !important;
        z-index: 30 !important;
        display: grid !important;
        grid-template-columns: 1fr auto auto !important;
        align-items: center !important;
        gap: 8px !important;
        padding: 0 10px 0 var(--text-pad) !important;
        text-align: left !important;
        background: linear-gradient(180deg, #a43b33, var(--red)) !important;
        border: var(--border) solid var(--gold) !important;
        border-radius: var(--radius) !important;
        box-shadow:
          0 4px 10px rgba(0,0,0,.22),
          inset 0 1px 0 rgba(255,255,255,.15) !important;
        color: var(--cream) !important;
        pointer-events: auto !important;
      }

      #${ROOT_ID} .place {
        min-width: 0 !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
        font-size: 18px !important;
        font-weight: 700 !important;
        letter-spacing: .14em !important;
        text-align: left !important;
        text-shadow: 0 1px 2px rgba(0,0,0,.32) !important;
      }

      #${ROOT_ID} .time {
        font-size: 14px !important;
        letter-spacing: .08em !important;
        color: rgba(234,217,176,.74) !important;
        white-space: nowrap !important;
      }

      #${ROOT_ID} .arrow-btn {
        all: initial !important;
        width: 24px !important;
        height: 24px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        color: var(--cream) !important;
        cursor: pointer !important;
        pointer-events: auto !important;
        user-select: none !important;
        -webkit-user-select: none !important;
        touch-action: manipulation !important;
        font-family: inherit !important;
      }

      #${ROOT_ID} .arrow-btn span {
        display: block !important;
        font-size: 15px !important;
        line-height: 1 !important;
        transform: rotate(-90deg) !important;
        transition: transform .22s ease !important;
      }

      #${ROOT_ID}.detail-open .arrow-btn span {
        transform: rotate(0deg) !important;
      }

      #${ROOT_ID} .dialog-box {
        position: absolute !important;
        left: var(--box-left) !important;
        top: var(--dialog-top) !important;
        width: var(--dialog-width) !important;
        height: var(--dialog-height) !important;
        z-index: 20 !important;
        padding: 13px 18px 12px var(--text-pad) !important;
        text-align: left !important;
        background: var(--black) !important;
        border: var(--border) solid var(--gold) !important;
        border-radius: var(--radius) !important;
        box-shadow:
          0 8px 18px rgba(0,0,0,.30),
          inset 0 1px 0 rgba(255,255,255,.06) !important;
        color: var(--cream) !important;
        pointer-events: auto !important;
        cursor: pointer !important;
      }

      #${ROOT_ID} .dialog-text {
        display: inline !important;
        text-align: left !important;
        font-size: 15px !important;
        line-height: 1.55 !important;
        letter-spacing: .05em !important;
        white-space: pre-wrap !important;
        text-shadow: 0 1px 2px rgba(0,0,0,.36) !important;
      }

      #${ROOT_ID} .cursor {
        display: inline-block !important;
        margin-left: 6px !important;
        color: var(--gold) !important;
        animation: ykrCursor 1.05s ease-in-out infinite !important;
      }

      #${ROOT_ID} .detail-float {
        position: absolute !important;
        left: var(--box-left) !important;
        top: calc(var(--status-top) + var(--status-height) + 4px) !important;
        width: var(--dialog-width) !important;
        max-height: min(58vh, 360px) !important;
        overflow: auto !important;
        z-index: 50 !important;
        pointer-events: none !important;
        background: rgba(237, 222, 194, .98) !important;
        border: var(--border) solid var(--gold) !important;
        border-radius: var(--radius) !important;
        box-shadow:
          0 14px 34px rgba(0,0,0,.38),
          inset 0 1px 0 rgba(255,255,255,.30) !important;
        color: #2f2823 !important;
        padding: 10px 12px !important;
      }

      #${ROOT_ID}.panel-open.detail-open .detail-float {
        opacity: 1 !important;
        transform: translateX(0) scaleX(1) !important;
        clip-path: inset(0 0 0 0 round var(--radius)) !important;
        pointer-events: auto !important;
      }

      #${ROOT_ID} .detail-grid {
        display: grid !important;
        grid-template-columns: .72fr 1.28fr !important;
        gap: 8px !important;
      }

      #${ROOT_ID} .info-box {
        min-width: 0 !important;
        padding: 7px 8px !important;
        border-radius: 5px !important;
        background: rgba(255, 250, 235, .45) !important;
        border: 1px solid rgba(84, 55, 38, .16) !important;
      }

      #${ROOT_ID} .info-box.wide {
        grid-column: 1 / -1 !important;
      }

      #${ROOT_ID} .info-title {
        margin-bottom: 4px !important;
        font-size: 11px !important;
        font-weight: 700 !important;
        letter-spacing: .12em !important;
        color: rgba(110, 47, 40, .88) !important;
      }

      #${ROOT_ID} .info-text {
        font-size: 12px !important;
        line-height: 1.55 !important;
        color: rgba(43,31,28,.82) !important;
        white-space: pre-wrap !important;
      }

      #${ROOT_ID} .mood-bar {
        height: 7px !important;
        border-radius: 999px !important;
        overflow: hidden !important;
        background: rgba(56,42,36,.18) !important;
        margin-top: 5px !important;
      }

      #${ROOT_ID} .mood-fill {
        display: block !important;
        height: 100% !important;
        width: 100% !important;
        border-radius: inherit !important;
        background: linear-gradient(90deg, #89332d, var(--gold)) !important;
      }

      #${ROOT_ID} .divider {
        grid-column: 1 / -1 !important;
        height: 1px !important;
        background: linear-gradient(90deg, transparent, rgba(96,58,42,.28), transparent) !important;
        margin: 1px 0 !important;
      }

      #${ROOT_ID} .todo-note {
        background: linear-gradient(180deg, rgba(246,228,179,.96), rgba(224,197,132,.96)) !important;
        border-color: rgba(139,103,46,.32) !important;
        box-shadow: 0 4px 10px rgba(75,45,25,.12) !important;
      }

      #${ROOT_ID} .todo-list {
        margin: 0 !important;
        padding: 0 !important;
        list-style: none !important;
        display: grid !important;
        gap: 4px !important;
      }

      #${ROOT_ID} .todo-list li {
        position: relative !important;
        padding-left: 17px !important;
      }

      #${ROOT_ID} .todo-list li::before {
        content: "◇" !important;
        position: absolute !important;
        left: 0 !important;
        color: rgba(137,51,45,.75) !important;
      }

      #${ROOT_ID} .main-title {
        font-weight: 700 !important;
        color: rgba(71,39,33,.92) !important;
        margin-bottom: 3px !important;
      }

      @keyframes ykrCursor {
        0%, 100% { transform: translateY(0); opacity: .55; }
        50% { transform: translateY(3px); opacity: 1; }
      }

      @media (max-width: 520px) {
        #${ROOT_ID} {
          --icon-size: 114px;
          --box-left: 70px;
          --text-pad: 74px;
          --dialog-width: min(330px, calc(100vw - 92px));
          --status-width: min(260px, calc(100vw - 140px));
        }

        #${ROOT_ID} .dialog-box {
          padding-left: var(--text-pad) !important;
        }

        #${ROOT_ID} .dialog-text {
          font-size: 13px !important;
        }

        #${ROOT_ID} .place {
          font-size: 16px !important;
        }

        #${ROOT_ID} .time {
          font-size: 12px !important;
        }

        #${ROOT_ID} .detail-grid {
          grid-template-columns: 1fr !important;
        }
      }
    `;
    doc.head.appendChild(style);
  }

  function buildRoot() {
    const root = doc.createElement('div');
    root.id = ROOT_ID;
    root.classList.add('panel-open');

    let saved = null;
    try { saved = JSON.parse(win.localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) {}
    if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
      root.style.left = saved.left + 'px';
      root.style.top = saved.top + 'px';
    }

    root.innerHTML = `
      <div class="ykr-ui">
        <div class="status-bar">
          <div class="place"></div>
          <div class="time"></div>
          <button class="arrow-btn" type="button" aria-label="切换详情"><span>▼</span></button>
        </div>

        <div class="dialog-box" title="切换下一句">
          <span class="dialog-text"></span><span class="cursor">◆</span>
        </div>

        <div class="detail-float">
          <div class="detail-grid">
            <div class="info-box">
              <div class="info-title">心情值</div>
              <div class="info-text"><span class="mood-number"></span><div class="mood-bar"><i class="mood-fill"></i></div></div>
            </div>
            <div class="info-box">
              <div class="info-title">名</div>
              <div class="info-text char-name"></div>
            </div>
            <div class="info-box wide">
              <div class="info-title">装束</div>
              <div class="info-text outfit"></div>
            </div>
            <div class="info-box wide">
              <div class="info-title">所作</div>
              <div class="info-text action"></div>
            </div>
            <div class="divider"></div>
            <div class="info-box wide todo-note">
              <div class="info-title">役目</div>
              <div class="info-text"><ul class="todo-list"></ul></div>
            </div>
            <div class="info-box wide">
              <div class="info-title">当前主线</div>
              <div class="info-text"><div class="main-title"></div><div class="main-summary"></div></div>
            </div>
          </div>
        </div>
      </div>

      <div class="ykr-icon">
        <img src="${ICON_URL}" alt="">
      </div>
    `;

    doc.body.appendChild(root);
    return root;
  }

  function setText(root, selector, value) {
    const el = root.querySelector(selector);
    if (el) el.textContent = value ?? '';
  }

  function renderStatic(root) {
    const data = state.data;
    setText(root, '.place', data.place);
    setText(root, '.time', data.time);
    setText(root, '.char-name', data.name);
    setText(root, '.mood-number', String(data.moodValue));
    setText(root, '.outfit', data.outfit);
    setText(root, '.action', data.action);
    setText(root, '.main-title', data.mainTitle);
    setText(root, '.main-summary', data.mainSummary);

    const fill = root.querySelector('.mood-fill');
    if (fill) fill.style.width = Math.max(0, Math.min(100, Number(data.moodValue) || 0)) + '%';

    const list = root.querySelector('.todo-list');
    if (list) {
      list.innerHTML = '';
      (data.todos || []).forEach(todo => {
        const li = doc.createElement('li');
        li.textContent = todo;
        list.appendChild(li);
      });
    }
  }

  function quotePool() {
    const mood = state.data.moodLabel || scoreToMood(state.data.moodValue);
    const quotes = Array.isArray(state.data.quotes) ? state.data.quotes : fallbackData.quotes;
    const matched = quotes.filter(q => q.mood && (q.mood.includes(mood) || mood.includes(q.mood)));
    return matched.length ? matched : quotes;
  }

  function typeQuote(root, text) {
    clearTimeout(state.typeTimer);
    state.typingToken += 1;
    const token = state.typingToken;
    const el = root.querySelector('.dialog-text');
    if (!el) return;
    el.textContent = '';

    const chars = [...String(text || '')];
    let i = 0;

    const step = () => {
      if (token !== state.typingToken) return;
      el.textContent = chars.slice(0, i).join('');
      i += 1;
      if (i <= chars.length) {
        state.typeTimer = setTimeout(step, 28);
      }
    };
    step();
  }

  function showCurrentQuote(root) {
    const pool = quotePool();
    if (!pool.length) return;
    const item = pool[state.quoteIndex % pool.length];
    typeQuote(root, item.text);
  }

  function nextQuote(root) {
    const pool = quotePool();
    if (!pool.length) return;
    state.quoteIndex = (state.quoteIndex + 1) % pool.length;
    showCurrentQuote(root);
  }

  async function readLatestStatus() {
    try {
      if (typeof getChatMessages === 'function') {
        const lastId = typeof getLastMessageId === 'function' ? Number(getLastMessageId()) : 9999;
        const messages = await Promise.resolve(getChatMessages(`0-${lastId}`, { role: 'assistant', hide_state: 'unhidden', include_swipes: false }));
        if (Array.isArray(messages)) {
          for (let i = messages.length - 1; i >= 0; i--) {
            const block = latestStatusBlock(messages[i]?.message);
            if (block) return block;
          }
        }
      }
    } catch (e) {}

    try {
      const chat = win.SillyTavern?.getContext?.()?.chat;
      if (Array.isArray(chat)) {
        for (let i = chat.length - 1; i >= 0; i--) {
          if (chat[i]?.is_user) continue;
          const block = latestStatusBlock(chat[i]?.mes ?? chat[i]?.message ?? '');
          if (block) return block;
        }
      }
    } catch (e) {}

    try {
      const nodes = [...doc.querySelectorAll('#chat .mes_text')].reverse();
      for (const node of nodes) {
        const block = latestStatusBlock(node.textContent || '');
        if (block) return block;
      }
    } catch (e) {}

    return '';
  }

  function hideStatusBlocks() {
    try {
      doc.querySelectorAll('#chat .mes_text status').forEach(el => {
        el.classList.add('ykr-hidden-status');
        el.style.display = 'none';
      });
    } catch (e) {}
  }

  async function updateFromStatus(root) {
    const block = await readLatestStatus();
    if (block) {
      state.data = parseStatus(block);
      state.quoteIndex = 0;
      renderStatic(root);
      showCurrentQuote(root);
    }
    hideStatusBlocks();
  }

  function scheduleUpdate(root, delay = 500) {
    clearTimeout(state.updateTimer);
    state.updateTimer = setTimeout(() => updateFromStatus(root), delay);
  }

  function bindObserver(root) {
    const chat = doc.querySelector('#chat');
    if (!chat) return;
    state.observer = new win.MutationObserver(() => scheduleUpdate(root, 800));
    state.observer.observe(chat, { childList: true, subtree: true, characterData: true });
  }

  function init() {
    if (!doc.body || !doc.head) {
      setTimeout(init, 100);
      return;
    }

    cleanup();
    injectStyle();
    const root = buildRoot();
    renderStatic(root);
    showCurrentQuote(root);

    const icon = root.querySelector('.ykr-icon');
    const dialog = root.querySelector('.dialog-box');
    const arrow = root.querySelector('.arrow-btn');

    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    function getPoint(event) {
      const touch = event.touches?.[0] || event.changedTouches?.[0];
      return touch ? { x: touch.clientX, y: touch.clientY } : { x: event.clientX, y: event.clientY };
    }

    function clampPosition(left, top) {
      const rect = root.getBoundingClientRect();
      const maxRightWidth = Math.min(520, Math.max(240, win.innerWidth - 96));
      return {
        // 只限制“立绘本体”留在屏幕内，不再把展开面板/对话框也算进拖拽边界。
        // 之前移动范围过小，就是因为把右侧 UI 总宽度也拿来 clamp 了。
        left: Math.max(0, Math.min(left, win.innerWidth - rect.width)),
        top: Math.max(0, Math.min(top, win.innerHeight - rect.height))
      };
    }

    function savePosition() {
      const rect = root.getBoundingClientRect();
      try {
        win.localStorage.setItem(STORAGE_KEY, JSON.stringify({ left: rect.left, top: rect.top }));
      } catch (e) {}
    }

    function startDrag(event) {
      const p = getPoint(event);
      const rect = root.getBoundingClientRect();
      dragging = true;
      moved = false;
      startX = p.x;
      startY = p.y;
      startLeft = rect.left;
      startTop = rect.top;
      event.preventDefault();
      event.stopPropagation();
    }

    function moveDrag(event) {
      if (!dragging) return;
      const p = getPoint(event);
      const dx = p.x - startX;
      const dy = p.y - startY;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;
      if (moved) {
        const next = clampPosition(startLeft + dx, startTop + dy);
        root.style.left = next.left + 'px';
        root.style.top = next.top + 'px';
      }
      event.preventDefault();
      event.stopPropagation();
    }

    function endDrag(event) {
      if (!dragging) return;
      dragging = false;
      if (moved) {
        savePosition();
      } else {
        root.classList.toggle('panel-open');
      }
      event?.preventDefault?.();
      event?.stopPropagation?.();
    }

    icon.addEventListener('touchstart', startDrag, { passive: false });
    doc.addEventListener('touchmove', moveDrag, { passive: false, capture: true });
    doc.addEventListener('touchend', endDrag, { passive: false, capture: true });
    doc.addEventListener('touchcancel', endDrag, { passive: false, capture: true });

    icon.addEventListener('mousedown', startDrag, true);
    doc.addEventListener('mousemove', moveDrag, true);
    doc.addEventListener('mouseup', endDrag, true);

    dialog.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      nextQuote(root);
    });

    arrow.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      root.classList.toggle('detail-open');
    });

    arrow.addEventListener('touchend', event => {
      event.preventDefault();
      event.stopPropagation();
      root.classList.toggle('detail-open');
    }, { passive: false });

    bindObserver(root);
    scheduleUpdate(root, 300);
  }

  window.addEventListener('unload', cleanup);
  window.addEventListener('pagehide', cleanup);

  init();
})();
