/*
 * 虚见相 · 文游横条状态栏
 * - 悬浮图标可拖拽，关脚本自动清理
 * - 点击图标展开/收起状态模块
 * - 红色地点时间条与黑色台词框左对齐
 * - 右侧单箭头展开详细状态；详情区在台词框下方，但层级更高
 * - 自动读取最新 <status>...</status>
 */
(function () {
  console.log('YUKARI VN STATUS: start');

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

  const FALLBACK = {
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
    quotes: ['真是的……又露出这种表情。', '不过我很喜欢哦…'],
  };

  const state = {
    data: { ...FALLBACK },
    quoteIndex: 0,
    typeTimer: null,
    updateTimer: null,
    observer: null,
    listeners: [],
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
    clearTimeout(state.updateTimer);
    clearInterval(state.typeTimer);

    if (state.observer) {
      try { state.observer.disconnect(); } catch (e) {}
      state.observer = null;
    }

    for (const off of state.listeners) {
      try { off(); } catch (e) {}
    }
    state.listeners = [];

    for (const targetDoc of getTargetDocs()) {
      try {
        targetDoc.getElementById(ROOT_ID)?.remove();
        targetDoc.getElementById(STYLE_ID)?.remove();
      } catch (e) {}
    }
  }

  cleanup();

  function clampNumber(num, min, max) {
    return Math.max(min, Math.min(max, num));
  }

  function cleanLine(text) {
    return String(text ?? '').replace(/\{\/\/.*?\}/g, '').trim();
  }

  function cleanBlock(text) {
    return String(text ?? '')
      .replace(/\r/g, '')
      .replace(/\{\/\/.*?\}/g, '')
      .replace(/[ \t]+$/gm, '')
      .trim();
  }

  function moodFromValue(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return '平静';
    if (n >= 65) return '高兴';
    if (n >= 35) return '平静';
    if (n >= 15) return '低落';
    return '危险';
  }

  function latestStatusBlock(text) {
    const raw = String(text ?? '');
    const matches = [...raw.matchAll(/<status\b[^>]*>([\s\S]*?)<\/status>/gi)];
    if (!matches.length) return '';
    return matches[matches.length - 1][1] || '';
  }

  function splitSections(block) {
    const keys = ['地点', '时间', '名字', '心情值', '穿着', '当前动作', '当前主线', '角色待办', '台词'];
    const sections = {};
    keys.forEach(k => sections[k] = []);

    let current = null;
    const lines = cleanBlock(block).split('\n').map(v => v.trim()).filter(Boolean);

    for (const line of lines) {
      const match = line.match(/^(地点|时间|名字|心情值|穿着|当前动作|当前主线|角色待办|台词)\s*[:：]\s*(.*)$/);
      if (match) {
        current = match[1];
        const value = cleanLine(match[2]);
        if (value) sections[current].push(value);
      } else if (current) {
        sections[current].push(cleanLine(line));
      }
    }
    return sections;
  }

  function parseTodos(raw) {
    const items = String(raw ?? '')
      .split('\n')
      .map(v => v.trim())
      .filter(Boolean)
      .map(v => v.replace(/^\d+\s*[.．、]\s*/, '').replace(/^[-•◇◆]\s*/, '').trim())
      .filter(Boolean);
    return items.length ? items : [...FALLBACK.todos];
  }

  function parseMain(raw) {
    const text = String(raw ?? '').trim();
    if (!text) {
      return { title: FALLBACK.mainTitle, summary: FALLBACK.mainSummary };
    }

    if (text.includes('|')) {
      const [title, ...rest] = text.split('|');
      return {
        title: title.trim() || FALLBACK.mainTitle,
        summary: rest.join('|').trim() || FALLBACK.mainSummary,
      };
    }

    const lines = text.split('\n').map(v => v.trim()).filter(Boolean);
    return {
      title: lines[0] || FALLBACK.mainTitle,
      summary: lines.slice(1).join('\n') || FALLBACK.mainSummary,
    };
  }

  function parseQuotes(raw, moodValue) {
    const lines = String(raw ?? '').split('\n').map(v => v.trim()).filter(Boolean);
    const parsed = [];

    for (const line of lines) {
      const match = line.match(/^([^：:]{1,12})\s*[:：]\s*(.+)$/);
      if (match) {
        parsed.push({ mood: match[1].trim(), text: match[2].trim() });
      } else if (parsed.length) {
        parsed[parsed.length - 1].text += '\n' + line;
      }
    }

    if (!parsed.length) return { mood: moodFromValue(moodValue), quotes: [...FALLBACK.quotes] };

    const mood = moodFromValue(moodValue);
    const matched = parsed.filter(item => item.mood.includes(mood) || mood.includes(item.mood));
    const pool = matched.length ? matched : parsed;
    return {
      mood: pool[0]?.mood || mood,
      quotes: pool.map(item => item.text).filter(Boolean),
    };
  }

  function parseStatus(block) {
    const sections = splitSections(block);
    const moodValue = clampNumber(Number((sections['心情值'][0] || '100').replace(/[^\d.-]/g, '')) || 100, 0, 100);
    const main = parseMain(sections['当前主线'].join('\n'));
    const quoteResult = parseQuotes(sections['台词'].join('\n'), moodValue);

    return {
      place: sections['地点'][0] || FALLBACK.place,
      time: sections['时间'][0] || FALLBACK.time,
      name: sections['名字'][0] || FALLBACK.name,
      moodValue,
      moodLabel: quoteResult.mood || moodFromValue(moodValue),
      outfit: sections['穿着'].join('\n').trim() || FALLBACK.outfit,
      action: sections['当前动作'].join('\n').trim() || FALLBACK.action,
      mainTitle: main.title,
      mainSummary: main.summary,
      todos: parseTodos(sections['角色待办'].join('\n')),
      quotes: quoteResult.quotes.length ? quoteResult.quotes : [...FALLBACK.quotes],
    };
  }

  function addStyle() {
    if (doc.getElementById(STYLE_ID)) return;

    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #chat status { display: none !important; }

      #${ROOT_ID} {
        --icon-size: 112px;
        --box-left: 72px;
        --status-top: 10px;
        --status-height: 36px;
        --status-width: min(340px, calc(100vw - 112px));
        --dialog-top: 52px;
        --dialog-height: 96px;
        --dialog-width: min(560px, calc(100vw - 96px));
        --detail-top: 158px;
        --radius: 7px;
        --gold: #a78d57;
        --black: #2b2a28;
        --red: #97352e;
        --cream: #ead8ad;

        position: fixed !important;
        left: 24px;
        top: 160px;
        z-index: 2147483647 !important;
        width: var(--icon-size) !important;
        height: var(--icon-size) !important;
        overflow: visible !important;
        pointer-events: none !important;
        font-family: "CustomFont", "NanoOldSong-A", "LXGW WenKai", "Noto Serif SC", serif !important;
      }

      #${ROOT_ID} * { box-sizing: border-box !important; }

      #${ROOT_ID} .vn-icon {
        position: relative !important;
        z-index: 40 !important;
        width: var(--icon-size) !important;
        height: var(--icon-size) !important;
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

      #${ROOT_ID} .vn-icon img {
        width: var(--icon-size) !important;
        height: var(--icon-size) !important;
        object-fit: contain !important;
        display: block !important;
        pointer-events: none !important;
        user-select: none !important;
        -webkit-user-drag: none !important;
      }

      #${ROOT_ID} .vn-status-bar,
      #${ROOT_ID} .vn-dialog,
      #${ROOT_ID} .vn-detail {
        opacity: 0 !important;
        pointer-events: none !important;
        transform-origin: left center !important;
        clip-path: inset(0 100% 0 0 round var(--radius)) !important;
        filter: blur(2px) !important;
        transition:
          opacity 0.22s ease,
          transform 0.30s cubic-bezier(.2,.9,.2,1),
          clip-path 0.34s cubic-bezier(.2,.9,.2,1),
          filter 0.22s ease !important;
      }

      #${ROOT_ID}.panel-open .vn-status-bar,
      #${ROOT_ID}.panel-open .vn-dialog,
      #${ROOT_ID}.panel-open.detail-open .vn-detail {
        opacity: 1 !important;
        pointer-events: auto !important;
        clip-path: inset(0 0 0 0 round var(--radius)) !important;
        filter: blur(0) !important;
      }

      #${ROOT_ID} .vn-status-bar {
        position: absolute !important;
        z-index: 20 !important;
        left: var(--box-left) !important;
        top: var(--status-top) !important;
        width: var(--status-width) !important;
        height: var(--status-height) !important;
        padding: 0 8px 0 18px !important;
        display: flex !important;
        align-items: center !important;
        gap: 10px !important;
        border-radius: var(--radius) !important;
        background: linear-gradient(180deg, #a23a31, var(--red)) !important;
        border: 3px solid var(--gold) !important;
        box-shadow: 0 6px 15px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.14) !important;
        transform: translateX(-10px) scaleX(.18) !important;
        color: #f0dfb8 !important;
      }

      #${ROOT_ID}.panel-open .vn-status-bar { transform: translateX(0) scaleX(1) !important; }

      #${ROOT_ID} .vn-place {
        flex: 1 1 auto !important;
        min-width: 0 !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
        font-size: 15px !important;
        font-weight: 800 !important;
        letter-spacing: .10em !important;
        text-shadow: 0 1px 2px rgba(0,0,0,.30) !important;
      }

      #${ROOT_ID} .vn-time {
        flex: 0 0 auto !important;
        font-size: 11px !important;
        letter-spacing: .06em !important;
        opacity: .82 !important;
      }

      #${ROOT_ID} .vn-toggle {
        flex: 0 0 auto !important;
        width: 24px !important;
        height: 24px !important;
        padding: 0 !important;
        border: none !important;
        background: transparent !important;
        color: #ead8ad !important;
        font-size: 17px !important;
        line-height: 22px !important;
        text-align: center !important;
        cursor: pointer !important;
        pointer-events: auto !important;
        transform: rotate(0deg) !important;
        transition: transform .22s ease !important;
        user-select: none !important;
        -webkit-user-select: none !important;
        touch-action: manipulation !important;
      }

      #${ROOT_ID}.detail-open .vn-toggle { transform: rotate(90deg) !important; }

      #${ROOT_ID} .vn-dialog {
        position: absolute !important;
        z-index: 10 !important;
        left: var(--box-left) !important;
        top: var(--dialog-top) !important;
        width: var(--dialog-width) !important;
        min-height: var(--dialog-height) !important;
        padding: 20px 24px 18px 82px !important;
        border-radius: var(--radius) !important;
        background: var(--black) !important;
        border: 4px solid var(--gold) !important;
        box-shadow: 0 12px 28px rgba(0,0,0,.36), inset 0 1px 0 rgba(255,255,255,.06) !important;
        color: var(--cream) !important;
        transform: translateX(-10px) scaleX(.12) !important;
        cursor: pointer !important;
      }

      #${ROOT_ID}.panel-open .vn-dialog { transform: translateX(0) scaleX(1) !important; }

      #${ROOT_ID} .vn-dialog-text {
        font-size: 15px !important;
        line-height: 1.65 !important;
        letter-spacing: .04em !important;
        white-space: pre-wrap !important;
        text-shadow: 0 1px 2px rgba(0,0,0,.28) !important;
      }

      #${ROOT_ID} .vn-cursor {
        display: inline-block !important;
        margin-left: 5px !important;
        color: var(--gold) !important;
        animation: yukariVnCursor 1.05s ease-in-out infinite !important;
      }

      #${ROOT_ID} .vn-detail {
        position: absolute !important;
        z-index: 30 !important;
        left: var(--box-left) !important;
        top: var(--detail-top) !important;
        width: var(--dialog-width) !important;
        max-height: min(48vh, 360px) !important;
        overflow: auto !important;
        overscroll-behavior: contain !important;
        -webkit-overflow-scrolling: touch !important;
        padding: 12px !important;
        border-radius: var(--radius) !important;
        background: rgba(236, 220, 190, .98) !important;
        border: 3px solid var(--gold) !important;
        box-shadow: 0 14px 32px rgba(0,0,0,.38), inset 0 1px 0 rgba(255,255,255,.30) !important;
        transform: translateY(-8px) !important;
        color: #2d241f !important;
      }

      #${ROOT_ID}.panel-open.detail-open .vn-detail { transform: translateY(0) !important; }

      #${ROOT_ID} .mood-line {
        display: grid !important;
        grid-template-columns: auto 1fr auto !important;
        align-items: center !important;
        gap: 9px !important;
        margin-bottom: 10px !important;
      }

      #${ROOT_ID} .detail-label {
        font-size: 11px !important;
        font-weight: 800 !important;
        letter-spacing: .12em !important;
        color: #6f302a !important;
        white-space: nowrap !important;
      }

      #${ROOT_ID} .mood-track {
        height: 8px !important;
        border-radius: 999px !important;
        overflow: hidden !important;
        background: rgba(43,42,40,.20) !important;
        box-shadow: inset 0 1px 3px rgba(0,0,0,.24) !important;
      }

      #${ROOT_ID} .mood-fill {
        display: block !important;
        height: 100% !important;
        width: 100% !important;
        border-radius: inherit !important;
        background: linear-gradient(90deg, #8e342e, var(--gold)) !important;
      }

      #${ROOT_ID} .mood-num {
        font-size: 12px !important;
        font-weight: 800 !important;
        color: #4a3229 !important;
      }

      #${ROOT_ID} .detail-block {
        margin-top: 9px !important;
      }

      #${ROOT_ID} .detail-title {
        font-size: 12px !important;
        font-weight: 800 !important;
        letter-spacing: .10em !important;
        color: #6f302a !important;
        margin-bottom: 4px !important;
      }

      #${ROOT_ID} .detail-text {
        font-size: 12px !important;
        line-height: 1.62 !important;
        letter-spacing: .03em !important;
        color: rgba(43,31,28,.82) !important;
        white-space: pre-wrap !important;
      }

      #${ROOT_ID} .detail-divider {
        height: 1px !important;
        margin: 11px 0 !important;
        background: linear-gradient(90deg, transparent, rgba(112,70,52,.36), transparent) !important;
      }

      #${ROOT_ID} .todo-note {
        margin-top: 5px !important;
        padding: 10px 12px !important;
        border-radius: 6px !important;
        background: linear-gradient(180deg, rgba(255,246,207,.95), rgba(235,210,151,.96)) !important;
        border-left: 5px solid #9b372f !important;
        box-shadow: 0 4px 10px rgba(80,44,28,.16), inset 0 1px 0 rgba(255,255,255,.32) !important;
      }

      #${ROOT_ID} .todo-list {
        display: grid !important;
        gap: 5px !important;
        margin: 0 !important;
        padding: 0 !important;
        list-style: none !important;
      }

      #${ROOT_ID} .todo-list li {
        position: relative !important;
        padding-left: 17px !important;
        font-size: 12px !important;
        line-height: 1.45 !important;
        color: rgba(43,31,28,.84) !important;
      }

      #${ROOT_ID} .todo-list li::before {
        content: "◆" !important;
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        font-size: 9px !important;
        color: #9b372f !important;
      }

      @keyframes yukariVnCursor {
        0%, 100% { transform: translateY(0); opacity: .55; }
        50% { transform: translateY(3px); opacity: 1; }
      }

      @media (max-width: 520px) {
        #${ROOT_ID} {
          --icon-size: 106px;
          --box-left: 68px;
          --status-width: min(270px, calc(100vw - 90px));
          --dialog-width: min(330px, calc(100vw - 88px));
          --dialog-height: 88px;
          --dialog-top: 50px;
          --detail-top: 148px;
        }

        #${ROOT_ID} .vn-status-bar { padding-left: 15px !important; }
        #${ROOT_ID} .vn-place { font-size: 14px !important; }
        #${ROOT_ID} .vn-dialog { padding: 18px 18px 16px 65px !important; }
        #${ROOT_ID} .vn-dialog-text { font-size: 13px !important; }
      }
    `;

    doc.head.appendChild(style);
  }

  function createUI() {
    const root = doc.createElement('div');
    root.id = ROOT_ID;

    let saved = null;
    try { saved = JSON.parse(win.localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) {}
    if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
      root.style.left = saved.left + 'px';
      root.style.top = saved.top + 'px';
    }

    root.innerHTML = `
      <div class="vn-icon"><img src="${ICON_URL}" alt=""></div>

      <div class="vn-status-bar">
        <div class="vn-place"></div>
        <div class="vn-time"></div>
        <button class="vn-toggle" type="button">▸</button>
      </div>

      <div class="vn-dialog">
        <span class="vn-dialog-text"></span><span class="vn-cursor">◆</span>
      </div>

      <div class="vn-detail">
        <div class="mood-line">
          <div class="detail-label">心情値</div>
          <div class="mood-track"><i class="mood-fill"></i></div>
          <div class="mood-num"></div>
        </div>

        <div class="detail-block">
          <div class="detail-title">装束</div>
          <div class="detail-text outfit-text"></div>
        </div>

        <div class="detail-block">
          <div class="detail-title">所作</div>
          <div class="detail-text action-text"></div>
        </div>

        <div class="detail-divider"></div>

        <div class="detail-block">
          <div class="detail-title">役目</div>
          <div class="todo-note"><ul class="todo-list"></ul></div>
        </div>

        <div class="detail-block">
          <div class="detail-title">縁の記録</div>
          <div class="detail-text main-text"></div>
        </div>
      </div>
    `;

    doc.body.appendChild(root);
    return root;
  }

  function setText(root, selector, text) {
    const el = root.querySelector(selector);
    if (el) el.textContent = text ?? '';
  }

  function render(root, nextData) {
    if (nextData) {
      state.data = { ...FALLBACK, ...nextData };
      state.quoteIndex = 0;
    }

    const data = state.data;
    setText(root, '.vn-place', data.place);
    setText(root, '.vn-time', data.time);
    setText(root, '.mood-num', String(data.moodValue));
    setText(root, '.outfit-text', data.outfit);
    setText(root, '.action-text', data.action);
    setText(root, '.main-text', `${data.mainTitle}\n${data.mainSummary}`);

    const fill = root.querySelector('.mood-fill');
    if (fill) fill.style.width = clampNumber(Number(data.moodValue) || 0, 0, 100) + '%';

    const todoList = root.querySelector('.todo-list');
    if (todoList) {
      todoList.innerHTML = '';
      data.todos.forEach(item => {
        const li = doc.createElement('li');
        li.textContent = item;
        todoList.appendChild(li);
      });
    }

    typeQuote(root, data.quotes[state.quoteIndex] || '……');
  }

  function typeQuote(root, text) {
    clearInterval(state.typeTimer);
    const el = root.querySelector('.vn-dialog-text');
    if (!el) return;

    const chars = Array.from(String(text ?? ''));
    let index = 0;
    el.textContent = '';

    state.typeTimer = setInterval(() => {
      if (index >= chars.length) {
        clearInterval(state.typeTimer);
        return;
      }
      el.textContent += chars[index];
      index++;
    }, 32);
  }

  function cycleQuote(root) {
    const quotes = state.data.quotes?.length ? state.data.quotes : FALLBACK.quotes;
    state.quoteIndex = (state.quoteIndex + 1) % quotes.length;
    typeQuote(root, quotes[state.quoteIndex]);
  }

  async function readStatusFromHelper() {
    if (typeof getChatMessages !== 'function') return null;
    try {
      let lastId = 0;
      try {
        if (typeof getLastMessageId === 'function') lastId = Number(getLastMessageId()) || 0;
      } catch (e) {}

      const messages = await Promise.resolve(getChatMessages(`0-${lastId}`, {
        role: 'assistant',
        hide_state: 'unhidden',
        include_swipes: false,
      }));

      if (!Array.isArray(messages)) return null;
      for (let i = messages.length - 1; i >= 0; i--) {
        const block = latestStatusBlock(messages[i]?.message);
        if (block) return parseStatus(block);
      }
    } catch (e) {
      console.warn('YUKARI VN STATUS: getChatMessages failed', e);
    }
    return null;
  }

  function readStatusFromContext() {
    try {
      const ctx = win.SillyTavern?.getContext?.();
      const chat = ctx?.chat;
      if (!Array.isArray(chat)) return null;

      for (let i = chat.length - 1; i >= 0; i--) {
        const msg = chat[i];
        if (msg?.is_user) continue;
        const text = msg?.mes ?? msg?.message ?? '';
        const block = latestStatusBlock(text);
        if (block) return parseStatus(block);
      }
    } catch (e) {
      console.warn('YUKARI VN STATUS: context read failed', e);
    }
    return null;
  }

  function readStatusFromDom() {
    try {
      const nodes = Array.from(doc.querySelectorAll('#chat .mes_text')).reverse();
      for (const node of nodes) {
        const block = latestStatusBlock(node.textContent || '');
        if (block) return parseStatus(block);
      }
    } catch (e) {
      console.warn('YUKARI VN STATUS: dom read failed', e);
    }
    return null;
  }

  async function updateStatus(root) {
    const data = await readStatusFromHelper() || readStatusFromContext() || readStatusFromDom();
    if (data) render(root, data);
  }

  function scheduleUpdate(root, delay = 480) {
    clearTimeout(state.updateTimer);
    state.updateTimer = setTimeout(() => updateStatus(root), delay);
  }

  function bindAutoUpdate(root) {
    const chat = doc.querySelector('#chat');
    if (chat) {
      state.observer = new win.MutationObserver(() => scheduleUpdate(root, 650));
      state.observer.observe(chat, { childList: true, subtree: true, characterData: true });
    }

    try {
      if (typeof eventOn === 'function' && typeof tavern_events !== 'undefined') {
        ['MESSAGE_RECEIVED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'CHAT_CHANGED', 'GENERATION_ENDED'].forEach(name => {
          if (tavern_events[name]) {
            const stop = eventOn(tavern_events[name], () => scheduleUpdate(root, 520));
            if (stop?.stop) state.listeners.push(() => stop.stop());
          }
        });
      }
    } catch (e) {}
  }

  function bindInteraction(root) {
    const icon = root.querySelector('.vn-icon');
    const dialog = root.querySelector('.vn-dialog');
    const toggle = root.querySelector('.vn-toggle');

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

    function savePosition() {
      const rect = root.getBoundingClientRect();
      try { win.localStorage.setItem(STORAGE_KEY, JSON.stringify({ left: rect.left, top: rect.top })); } catch (e) {}
    }

    function clampPosition(left, top) {
      const rect = root.getBoundingClientRect();
      return {
        left: Math.max(0, Math.min(left, win.innerWidth - rect.width)),
        top: Math.max(0, Math.min(top, win.innerHeight - rect.height)),
      };
    }

    function ensureInView() {
      const panelWidth = root.querySelector('.vn-dialog')?.offsetWidth || 560;
      const rootRect = root.getBoundingClientRect();
      const needRight = rootRect.left + 72 + panelWidth + 8;
      if (needRight > win.innerWidth) {
        root.style.left = Math.max(2, win.innerWidth - panelWidth - 82) + 'px';
        savePosition();
      }
    }

    function togglePanel() {
      const willOpen = !root.classList.contains('panel-open');
      if (willOpen) ensureInView();
      root.classList.toggle('panel-open');
    }

    function toggleDetail(event) {
      event.preventDefault();
      event.stopPropagation();
      root.classList.toggle('detail-open');
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
      if (moved) savePosition();
      else togglePanel();
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

    dialog.addEventListener('click', () => cycleQuote(root));
    dialog.addEventListener('touchend', (event) => {
      event.preventDefault();
      event.stopPropagation();
      cycleQuote(root);
    }, { passive: false });

    toggle.addEventListener('click', toggleDetail);
    toggle.addEventListener('touchend', toggleDetail, { passive: false });
  }

  function init() {
    if (!doc.body || !doc.head) {
      setTimeout(init, 100);
      return;
    }

    cleanup();
    addStyle();
    const root = createUI();
    render(root, FALLBACK);
    bindInteraction(root);
    bindAutoUpdate(root);
    scheduleUpdate(root, 300);
  }

  window.addEventListener('unload', cleanup);
  window.addEventListener('pagehide', cleanup);

  win.__YUKARI_VN_STATUS__ = { cleanup, update: () => updateStatus(doc.getElementById(ROOT_ID)) };
  window.__YUKARI_VN_STATUS__ = win.__YUKARI_VN_STATUS__;

  init();
})();
