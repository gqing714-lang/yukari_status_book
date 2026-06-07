(function () {
  const SCRIPT_KEY = '__YUKARI_VISUAL_NOVEL_BAR__';

  if (window[SCRIPT_KEY]?.cleanup) {
    try {
      window[SCRIPT_KEY].cleanup();
    } catch (e) {}
  }

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

  const state = {
    data: {
      place: '万事屋',
      time: '12:30',
      name: '虚见相',
      moodValue: 100,
      outfit: '白襦袢、黑羽织，袖口沾着一点旧纸灰。',
      action: '倚在柜台后看账册，指尖慢慢翻过泛黄的纸页，偶尔抬眼看向门口，像是在等某个本不该来的客人。',
      mainTitle: '神隐少女事件',
      mainSummary: '雨夜来访的少女许下“想要消失”的愿望，代价尚未明晰，虚见相似乎并不意外。',
      todos: ['调查愿望代价', '准备茶点', '观察user状态'],
      quotes: ['真是的……又露出这种表情。', '不过我很喜欢哦…'],
    },
    quoteIndex: 0,
    typingTimer: null,
    typingFullText: '',
    typingCurrent: '',
    typingDone: true,
    dragging: false,
    moved: false,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
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

  function addListener(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    state.listeners.push({ target, type, handler, options });
  }

  function cleanup() {
    clearTimeout(state.updateTimer);
    clearInterval(state.typingTimer);

    if (state.observer) {
      try { state.observer.disconnect(); } catch (e) {}
      state.observer = null;
    }

    for (const item of state.listeners) {
      try {
        item.target.removeEventListener(item.type, item.handler, item.options);
      } catch (e) {}
    }
    state.listeners = [];

    for (const targetDoc of getTargetDocs()) {
      try {
        targetDoc.getElementById(ROOT_ID)?.remove();
        targetDoc.getElementById(STYLE_ID)?.remove();
      } catch (e) {}
    }
  }

  window[SCRIPT_KEY] = { cleanup };

  function cleanText(text) {
    return String(text ?? '')
      .replace(/\r/g, '')
      .replace(/\{\/\/.*?\}/g, '')
      .trim();
  }

  function clamp(num, min, max) {
    return Math.max(min, Math.min(max, num));
  }

  function getLatestStatusBlock(text) {
    const raw = String(text ?? '');
    const matches = [...raw.matchAll(/<status\b[^>]*>([\s\S]*?)<\/status>/gi)];
    if (!matches.length) return '';
    return matches[matches.length - 1][1] || '';
  }

  function splitSections(block) {
    const keys = ['地点', '时间', '名字', '心情值', '穿着', '当前动作', '当前主线', '角色待办', '台词'];
    const sections = {};
    keys.forEach(key => sections[key] = []);

    let current = null;

    cleanText(block).split('\n').forEach(rawLine => {
      const line = rawLine.trim();
      if (!line) return;

      const match = line.match(/^(地点|时间|名字|心情值|穿着|当前动作|当前主线|角色待办|台词)\s*[:：]\s*(.*)$/);
      if (match) {
        current = match[1];
        const value = cleanText(match[2]);
        if (value) sections[current].push(value);
      } else if (current) {
        sections[current].push(cleanText(line));
      }
    });

    return sections;
  }

  function parseTodos(raw) {
    const items = String(raw ?? '')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => line.replace(/^\d+\s*[.．、]\s*/, '').replace(/^[-•◇◆]\s*/, '').trim())
      .filter(Boolean);

    return items.length ? items : ['暂无待办'];
  }

  function parseMain(raw) {
    const text = cleanText(raw);
    if (!text) return { title: '未启封', summary: '尚未读取到当前主线。' };

    if (text.includes('|')) {
      const [title, ...rest] = text.split('|');
      return {
        title: cleanText(title) || '未命名主线',
        summary: cleanText(rest.join('|')) || '暂无梗概。',
      };
    }

    const lines = text.split('\n').map(v => v.trim()).filter(Boolean);
    return {
      title: lines[0] || '未命名主线',
      summary: lines.slice(1).join('\n') || '暂无梗概。',
    };
  }

  function parseQuotes(raw, moodValue) {
    const lines = String(raw ?? '')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    const mood = Number(moodValue) >= 65 ? '高兴' : Number(moodValue) <= 30 ? '低落' : '平静';
    const items = [];

    for (const line of lines) {
      const match = line.match(/^([^：:]{1,12})\s*[:：]\s*(.+)$/);
      if (match) {
        items.push({
          mood: cleanText(match[1]),
          text: cleanText(match[2]),
        });
      } else if (items.length) {
        items[items.length - 1].text += '\n' + cleanText(line);
      }
    }

    if (!items.length) return ['……'];

    const matched = items.filter(item => item.mood.includes(mood) || mood.includes(item.mood));
    return (matched.length ? matched : items).map(item => item.text).filter(Boolean);
  }

  function parseStatus(block) {
    const sections = splitSections(block);
    const moodValue = clamp(Number((sections['心情值'][0] ?? '50').replace(/[^\d.-]/g, '')) || 50, 0, 100);
    const main = parseMain(sections['当前主线'].join('\n'));

    return {
      place: sections['地点'][0] || '未知之地',
      time: sections['时间'][0] || '--:--',
      name: sections['名字'][0] || '虚见相',
      moodValue,
      outfit: sections['穿着'].join('\n').trim() || '未记录',
      action: sections['当前动作'].join('\n').trim() || '未记录',
      mainTitle: main.title,
      mainSummary: main.summary,
      todos: parseTodos(sections['角色待办'].join('\n')),
      quotes: parseQuotes(sections['台词'].join('\n'), moodValue),
    };
  }

  async function getLastMessageIdSafe() {
    try {
      if (typeof getLastMessageId === 'function') {
        const id = Number(getLastMessageId());
        if (!Number.isNaN(id)) return id;
      }
    } catch (e) {}

    try {
      if (typeof triggerSlash === 'function') {
        const id = Number(await triggerSlash('/pass {{lastMessageId}}'));
        if (!Number.isNaN(id)) return id;
      }
    } catch (e) {}

    try {
      const ctx = win.SillyTavern?.getContext?.();
      if (Array.isArray(ctx?.chat)) return ctx.chat.length - 1;
    } catch (e) {}

    return 0;
  }

  async function findLatestStatus() {
    try {
      if (typeof getChatMessages === 'function') {
        const lastId = await getLastMessageIdSafe();
        const messages = await Promise.resolve(
          getChatMessages(`0-${lastId}`, {
            role: 'assistant',
            hide_state: 'unhidden',
            include_swipes: false,
          })
        );

        if (Array.isArray(messages)) {
          for (let i = messages.length - 1; i >= 0; i--) {
            const block = getLatestStatusBlock(messages[i]?.message);
            if (block) return block;
          }
        }
      }
    } catch (e) {}

    try {
      const ctx = win.SillyTavern?.getContext?.();
      const chat = ctx?.chat;
      if (Array.isArray(chat)) {
        for (let i = chat.length - 1; i >= 0; i--) {
          const msg = chat[i];
          if (msg?.is_user) continue;
          const block = getLatestStatusBlock(msg?.mes ?? msg?.message ?? '');
          if (block) return block;
        }
      }
    } catch (e) {}

    try {
      const nodes = [...doc.querySelectorAll('#chat .mes_text')].reverse();
      for (const node of nodes) {
        const block = getLatestStatusBlock(node.textContent || '');
        if (block) return block;
      }
    } catch (e) {}

    return '';
  }

  function hideStatusBlocksInChat() {
    const nodes = doc.querySelectorAll('#chat .mes_text');

    for (const node of nodes) {
      try {
        node.querySelectorAll?.('status').forEach(el => {
          el.style.display = 'none';
        });

        const html = node.innerHTML || '';
        if (!/(&lt;status|<status)/i.test(html)) continue;

        const replaced = html
          .replace(/<status\b[^>]*>[\s\S]*?<\/status>/gi, '<span style="display:none"></span>')
          .replace(/&lt;status\b[\s\S]*?&gt;[\s\S]*?&lt;\/status&gt;/gi, '<span style="display:none"></span>');

        if (replaced !== html) node.innerHTML = replaced;
      } catch (e) {}
    }
  }

  function setText(selector, value) {
    const root = doc.getElementById(ROOT_ID);
    const el = root?.querySelector(selector);
    if (el) el.textContent = value ?? '';
  }

  function renderTodos(todos) {
    const root = doc.getElementById(ROOT_ID);
    const list = root?.querySelector('.todo-list');
    if (!list) return;

    list.innerHTML = '';
    todos.forEach(item => {
      const li = doc.createElement('li');
      li.textContent = item;
      list.appendChild(li);
    });
  }

  function typeQuote(text) {
    clearInterval(state.typingTimer);

    const root = doc.getElementById(ROOT_ID);
    const textEl = root?.querySelector('.voice-text');
    if (!textEl) return;

    state.typingFullText = text;
    state.typingCurrent = '';
    state.typingDone = false;
    textEl.textContent = '「」';

    let i = 0;
    state.typingTimer = setInterval(() => {
      i++;
      state.typingCurrent = text.slice(0, i);
      textEl.textContent = `「${state.typingCurrent}」`;

      if (i >= text.length) {
        clearInterval(state.typingTimer);
        state.typingDone = true;
      }
    }, 38);
  }

  function renderData(data, shouldType = true) {
    state.data = data;

    setText('.place-text', data.place);
    setText('.time-text', data.time);
    setText('.name-text', data.name);
    setText('.mood-number', String(data.moodValue));
    setText('.outfit-text', data.outfit);
    setText('.action-text', data.action);
    setText('.main-title', data.mainTitle);
    setText('.main-summary', data.mainSummary);

    const moodFill = doc.getElementById(ROOT_ID)?.querySelector('.mood-fill');
    if (moodFill) moodFill.style.width = `${clamp(data.moodValue, 0, 100)}%`;

    renderTodos(data.todos);

    state.quoteIndex = 0;
    const quote = data.quotes?.[0] || '……';
    if (shouldType) typeQuote(quote);
    else setText('.voice-text', `「${quote}」`);
  }

  function nextQuote() {
    const quotes = state.data.quotes || ['……'];

    if (!state.typingDone) {
      clearInterval(state.typingTimer);
      state.typingDone = true;
      setText('.voice-text', `「${state.typingFullText}」`);
      return;
    }

    state.quoteIndex = (state.quoteIndex + 1) % quotes.length;
    typeQuote(quotes[state.quoteIndex]);
  }

  async function updateFromLatestStatus() {
    const block = await findLatestStatus();
    if (block) {
      renderData(parseStatus(block), true);
    }
    hideStatusBlocksInChat();
  }

  function scheduleUpdate(delay = 500) {
    clearTimeout(state.updateTimer);
    state.updateTimer = setTimeout(updateFromLatestStatus, delay);
  }

  function init() {
    if (!doc.body || !doc.head) {
      setTimeout(init, 100);
      return;
    }

    cleanup();

    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      status {
        display: none !important;
      }

      #${ROOT_ID} {
        position: fixed !important;
        left: 24px;
        top: 160px;
        z-index: 2147483647 !important;
        width: 112px !important;
        height: 112px !important;
        overflow: visible !important;
        pointer-events: none !important;
      }

      #${ROOT_ID} * {
        box-sizing: border-box !important;
      }

      #${ROOT_ID} .simple-icon {
        width: 112px !important;
        height: 112px !important;
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
        position: relative !important;
        z-index: 6 !important;
      }

      #${ROOT_ID} .simple-icon img {
        width: 112px !important;
        height: 112px !important;
        object-fit: contain !important;
        display: block !important;
        pointer-events: none !important;
        user-select: none !important;
        -webkit-user-drag: none !important;
      }

      #${ROOT_ID} .vn-panel {
        position: absolute !important;
        left: 96px !important;
        top: 50% !important;
        width: min(560px, calc(100vw - 130px)) !important;
        pointer-events: none !important;
        opacity: 0 !important;
        transform: translateY(-50%) translateX(-14px) scaleX(0.12) !important;
        transform-origin: left center !important;
        clip-path: inset(0 100% 0 0 round 4px) !important;
        filter: blur(2px) !important;
        transition:
          opacity 0.22s ease,
          transform 0.30s cubic-bezier(.2,.9,.2,1),
          clip-path 0.34s cubic-bezier(.2,.9,.2,1),
          filter 0.22s ease !important;
        font-family:
          "CustomFont",
          "NanoOldSong-A",
          "LXGW WenKai",
          "Noto Serif SC",
          serif !important;
      }

      #${ROOT_ID}.panel-open .vn-panel {
        pointer-events: auto !important;
        opacity: 1 !important;
        transform: translateY(-50%) translateX(0) scaleX(1) !important;
        clip-path: inset(0 0 0 0 round 4px) !important;
        filter: blur(0) !important;
      }

      #${ROOT_ID} .top-row {
        position: relative !important;
        z-index: 3 !important;
        display: flex !important;
        align-items: stretch !important;
        width: min(360px, 78%) !important;
        min-height: 38px !important;
        margin-left: 4px !important;
        margin-bottom: 8px !important;
        border: 3px solid #a78d57 !important;
        border-radius: 5px !important;
        background: #8c3028 !important;
        box-shadow:
          0 4px 12px rgba(0,0,0,.25),
          inset 0 1px 0 rgba(255,255,255,.10) !important;
      }

      #${ROOT_ID} .place-time {
        flex: 1 !important;
        min-width: 0 !important;
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        padding: 7px 12px !important;
        color: #ead9b7 !important;
        white-space: nowrap !important;
      }

      #${ROOT_ID} .place-text {
        font-size: 15px !important;
        font-weight: 800 !important;
        letter-spacing: .12em !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }

      #${ROOT_ID} .time-text {
        font-size: 11px !important;
        font-weight: 500 !important;
        letter-spacing: .08em !important;
        color: rgba(234,217,183,.78) !important;
      }

      #${ROOT_ID} .bar-dot {
        color: #a78d57 !important;
        font-style: normal !important;
      }

      #${ROOT_ID} .detail-toggle {
        width: 38px !important;
        border: none !important;
        border-left: 3px solid #a78d57 !important;
        border-radius: 0 !important;
        background: rgba(43,42,40,.92) !important;
        color: #e8d6a8 !important;
        font-size: 16px !important;
        font-weight: 700 !important;
        line-height: 1 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        pointer-events: auto !important;
        cursor: pointer !important;
        touch-action: manipulation !important;
      }

      #${ROOT_ID} .detail-toggle span {
        display: inline-block !important;
        transform: rotate(-90deg) !important;
        transition: transform .22s ease !important;
      }

      #${ROOT_ID}.detail-open .detail-toggle span {
        transform: rotate(0deg) !important;
      }

      #${ROOT_ID} .voice-box {
        position: relative !important;
        z-index: 1 !important;
        width: 100% !important;
        min-height: 106px !important;
        padding: 18px 20px 18px !important;
        background: #2b2a28 !important;
        border: 4px solid #a78d57 !important;
        border-radius: 5px !important;
        box-shadow:
          0 13px 28px rgba(0,0,0,.36),
          inset 0 1px 0 rgba(255,255,255,.05) !important;
        color: #ead9b7 !important;
      }

      #${ROOT_ID} .voice-text {
        font-size: 16px !important;
        line-height: 1.75 !important;
        letter-spacing: .06em !important;
        white-space: pre-wrap !important;
      }

      #${ROOT_ID} .voice-cursor {
        display: inline-block !important;
        margin-left: 5px !important;
        color: #a78d57 !important;
        animation: yukariCursor 1.05s ease-in-out infinite !important;
      }

      /* ===== 遮罩层：详情打开时压住下方一切，点击关闭 ===== */
      #${ROOT_ID} .yk-backdrop {
        position: fixed !important;
        inset: 0 !important;
        z-index: 2147483646 !important;
        background: rgba(10,9,7,.5) !important;
        backdrop-filter: blur(4px) !important;
        -webkit-backdrop-filter: blur(4px) !important;
        opacity: 0 !important;
        pointer-events: none !important;
        transition: opacity .22s ease !important;
      }

      #${ROOT_ID}.detail-open .yk-backdrop {
        opacity: 1 !important;
        pointer-events: auto !important;
      }

      /* ===== 详情：独立 fixed 浮层，位置由 JS 贴着图标计算 ===== */
      #${ROOT_ID} .detail-layer {
        position: fixed !important;
        z-index: 2147483647 !important;
        left: 0 !important;
        top: 0 !important;
        width: min(360px, calc(100vw - 24px)) !important;
        max-height: min(70vh, 460px) !important;
        overflow: auto !important;
        overscroll-behavior: contain !important;
        -webkit-overflow-scrolling: touch !important;

        opacity: 0 !important;
        transform: translateY(-8px) scale(.94) !important;
        transform-origin: top left !important;
        pointer-events: none !important;
        transition:
          opacity .2s ease,
          transform .26s cubic-bezier(.2,.9,.2,1) !important;
      }

      #${ROOT_ID}.detail-open .detail-layer {
        opacity: 1 !important;
        transform: translateY(0) scale(1) !important;
        pointer-events: auto !important;
      }

      #${ROOT_ID} .detail-card {
        padding: 12px 13px 13px !important;
        border: 3px solid #a78d57 !important;
        border-radius: 5px !important;
        background:
          linear-gradient(180deg, rgba(236,221,194,.98), rgba(216,195,158,.98)) !important;
        color: #2f261f !important;
        box-shadow:
          0 12px 26px rgba(0,0,0,.34),
          inset 0 1px 0 rgba(255,255,255,.18) !important;
      }

      #${ROOT_ID} .name-row {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 12px !important;
        padding-bottom: 8px !important;
        border-bottom: 1px solid rgba(93,55,40,.26) !important;
        margin-bottom: 9px !important;
      }

      #${ROOT_ID} .name-text {
        font-size: 15px !important;
        font-weight: 800 !important;
        letter-spacing: .14em !important;
        color: #3c2922 !important;
      }

      #${ROOT_ID} .mood-area {
        min-width: 128px !important;
      }

      #${ROOT_ID} .mood-label {
        display: flex !important;
        justify-content: space-between !important;
        align-items: baseline !important;
        margin-bottom: 4px !important;
        font-size: 10px !important;
        letter-spacing: .08em !important;
        color: rgba(63,42,34,.70) !important;
      }

      #${ROOT_ID} .mood-number {
        font-size: 14px !important;
        font-weight: 800 !important;
        color: #8c3028 !important;
      }

      #${ROOT_ID} .mood-bar {
        height: 7px !important;
        border-radius: 0 !important;
        overflow: hidden !important;
        background: rgba(43,42,40,.24) !important;
        border: 1px solid rgba(74,52,40,.22) !important;
      }

      #${ROOT_ID} .mood-fill {
        display: block !important;
        width: 100% !important;
        height: 100% !important;
        background: linear-gradient(90deg, #8c3028, #a78d57) !important;
      }

      #${ROOT_ID} .info-block {
        margin-top: 8px !important;
      }

      #${ROOT_ID} .info-title {
        margin-bottom: 3px !important;
        font-size: 11px !important;
        font-weight: 800 !important;
        letter-spacing: .12em !important;
        color: #7c342d !important;
      }

      #${ROOT_ID} .info-text {
        font-size: 12px !important;
        line-height: 1.62 !important;
        letter-spacing: .03em !important;
        color: rgba(43,31,28,.82) !important;
        white-space: pre-wrap !important;
      }

      #${ROOT_ID} .divider {
        height: 1px !important;
        margin: 11px 0 !important;
        background: linear-gradient(90deg, transparent, rgba(93,55,40,.42), transparent) !important;
      }

      #${ROOT_ID} .todo-note {
        margin-top: 5px !important;
        padding: 9px 10px !important;
        background: #ead8a6 !important;
        border-left: 5px solid #8c3028 !important;
        box-shadow:
          0 4px 10px rgba(65,42,31,.18),
          inset 0 1px 0 rgba(255,255,255,.24) !important;
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
        font-size: 12px !important;
        line-height: 1.45 !important;
        color: rgba(43,31,28,.82) !important;
      }

      #${ROOT_ID} .todo-list li::before {
        content: "◇" !important;
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        color: #8c3028 !important;
      }

      @keyframes yukariCursor {
        0%, 100% { transform: translateY(0); opacity: .55; }
        50% { transform: translateY(3px); opacity: 1; }
      }

      @media (max-width: 520px) {
        #${ROOT_ID} .vn-panel {
          width: min(342px, calc(100vw - 124px)) !important;
          left: 94px !important;
        }

        #${ROOT_ID} .top-row {
          width: min(280px, 86%) !important;
        }

        #${ROOT_ID} .voice-box {
          min-height: 100px !important;
          padding: 15px 16px !important;
        }

        #${ROOT_ID} .voice-text {
          font-size: 14px !important;
        }

        #${ROOT_ID} .detail-layer {
          width: min(330px, calc(100vw - 20px)) !important;
        }

        #${ROOT_ID} .name-row {
          display: block !important;
        }

        #${ROOT_ID} .mood-area {
          margin-top: 8px !important;
          min-width: 0 !important;
        }
      }
    `;

    const root = doc.createElement('div');
    root.id = ROOT_ID;

    let saved = null;
    try {
      saved = JSON.parse(win.localStorage.getItem(STORAGE_KEY) || 'null');
    } catch (e) {}

    if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
      root.style.left = saved.left + 'px';
      root.style.top = saved.top + 'px';
    }

    root.innerHTML = `
      <div class="yk-backdrop"></div>

      <div class="simple-icon">
        <img src="${ICON_URL}" alt="">
      </div>

      <div class="vn-panel">
        <div class="top-row">
          <div class="place-time">
            <span class="place-text">万事屋</span>
            <em class="bar-dot">·</em>
            <span class="time-text">12:30</span>
          </div>
          <button class="detail-toggle" type="button" aria-label="展开状态">
            <span>▼</span>
          </button>
        </div>

        <div class="voice-box">
          <span class="voice-text">「真是的……又露出这种表情。」</span><span class="voice-cursor">◆</span>
        </div>
      </div>

      <div class="detail-layer">
        <div class="detail-card">
          <div class="name-row">
            <div class="name-text">虚见相</div>
            <div class="mood-area">
              <div class="mood-label">
                <span>心情值</span>
                <span class="mood-number">100</span>
              </div>
              <div class="mood-bar"><i class="mood-fill"></i></div>
            </div>
          </div>

          <div class="info-block">
            <div class="info-title">装束</div>
            <div class="info-text outfit-text"></div>
          </div>

          <div class="info-block">
            <div class="info-title">行为</div>
            <div class="info-text action-text"></div>
          </div>

          <div class="divider"></div>

          <div class="info-block">
            <div class="info-title">角色待办</div>
            <div class="todo-note">
              <ul class="todo-list"></ul>
            </div>
          </div>

          <div class="info-block">
            <div class="info-title">当前主线</div>
            <div class="info-text"><b class="main-title"></b>
<span class="main-summary"></span></div>
          </div>
        </div>
      </div>
    `;

    doc.head.appendChild(style);
    doc.body.appendChild(root);

    const icon = root.querySelector('.simple-icon');
    const toggle = root.querySelector('.detail-toggle');
    const voiceBox = root.querySelector('.voice-box');
    const backdrop = root.querySelector('.yk-backdrop');
    const detailLayer = root.querySelector('.detail-layer');

    function getPoint(event) {
      const touch = event.touches?.[0] || event.changedTouches?.[0];
      return touch ? { x: touch.clientX, y: touch.clientY } : { x: event.clientX, y: event.clientY };
    }

    function clampPosition(left, top) {
      const rect = root.getBoundingClientRect();
      return {
        left: Math.max(0, Math.min(left, win.innerWidth - rect.width)),
        top: Math.max(0, Math.min(top, win.innerHeight - rect.height)),
      };
    }

    function savePosition() {
      const rect = root.getBoundingClientRect();
      try {
        win.localStorage.setItem(STORAGE_KEY, JSON.stringify({ left: rect.left, top: rect.top }));
      } catch (e) {}
    }

    function ensurePanelInView() {
      const panel = root.querySelector('.vn-panel');
      if (!panel) return;

      const rootRect = root.getBoundingClientRect();
      const panelWidth = panel.offsetWidth || 560;
      const needRight = rootRect.left + 96 + panelWidth + 8;

      if (needRight > win.innerWidth) {
        const nextLeft = Math.max(4, win.innerWidth - panelWidth - 112);
        root.style.left = nextLeft + 'px';
        savePosition();
      }
    }

    function togglePanel() {
      const willOpen = !root.classList.contains('panel-open');
      if (willOpen) ensurePanelInView();
      root.classList.toggle('panel-open');
      // 收起整块面板时，详情也一并收起
      if (!root.classList.contains('panel-open')) closeDetail();
    }

    // ===== 详情浮层：跟着图标走的定位 =====
    function positionDetail() {
      if (!detailLayer) return;

      const iconRect = icon.getBoundingClientRect();
      const w = detailLayer.offsetWidth || 360;
      const h = detailLayer.offsetHeight || 420;
      const margin = 10;
      const edge = 8;

      // 默认贴在图标右侧
      let left = iconRect.right + margin;
      let top = iconRect.top;

      // 右侧放不下 → 改放图标左侧
      if (left + w > win.innerWidth - edge) {
        left = iconRect.left - w - margin;
      }
      // 左侧也放不下 → 居中兜底
      if (left < edge) {
        left = Math.max(edge, (win.innerWidth - w) / 2);
      }

      // 垂直方向防止超出底/顶
      if (top + h > win.innerHeight - edge) {
        top = win.innerHeight - h - edge;
      }
      if (top < edge) top = edge;

      detailLayer.style.left = left + 'px';
      detailLayer.style.top = top + 'px';
    }

    function openDetail() {
      positionDetail();
      root.classList.add('detail-open');
      // 等浮层渲染出真实高度后再精确定位一次
      requestAnimationFrame(positionDetail);
    }

    function closeDetail() {
      root.classList.remove('detail-open');
    }

    function startDrag(event) {
      const p = getPoint(event);
      const rect = root.getBoundingClientRect();

      state.dragging = true;
      state.moved = false;
      state.startX = p.x;
      state.startY = p.y;
      state.startLeft = rect.left;
      state.startTop = rect.top;

      event.preventDefault();
      event.stopPropagation();
    }

    function moveDrag(event) {
      if (!state.dragging) return;

      const p = getPoint(event);
      const dx = p.x - state.startX;
      const dy = p.y - state.startY;

      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) state.moved = true;

      if (state.moved) {
        const next = clampPosition(state.startLeft + dx, state.startTop + dy);
        root.style.left = next.left + 'px';
        root.style.top = next.top + 'px';
        // 拖动时若详情开着，让浮层跟着图标实时移动
        if (root.classList.contains('detail-open')) positionDetail();
      }

      event.preventDefault();
      event.stopPropagation();
    }

    function endDrag(event) {
      if (!state.dragging) return;

      state.dragging = false;

      if (state.moved) savePosition();
      else togglePanel();

      event?.preventDefault?.();
      event?.stopPropagation?.();
    }

    addListener(icon, 'touchstart', startDrag, { passive: false });
    addListener(doc, 'touchmove', moveDrag, { passive: false, capture: true });
    addListener(doc, 'touchend', endDrag, { passive: false, capture: true });
    addListener(doc, 'touchcancel', endDrag, { passive: false, capture: true });

    addListener(icon, 'mousedown', startDrag, true);
    addListener(doc, 'mousemove', moveDrag, true);
    addListener(doc, 'mouseup', endDrag, true);

    addListener(toggle, 'click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (root.classList.contains('detail-open')) closeDetail();
      else openDetail();
    });

    // 点遮罩关闭详情
    if (backdrop) {
      addListener(backdrop, 'click', event => {
        event.preventDefault();
        event.stopPropagation();
        closeDetail();
      });
    }

    // 窗口尺寸变化时，若详情开着则重新贴位
    addListener(win, 'resize', () => {
      if (root.classList.contains('detail-open')) positionDetail();
    });

    addListener(voiceBox, 'click', event => {
      event.preventDefault();
      event.stopPropagation();
      nextQuote();
    });

    try {
      const chat = doc.querySelector('#chat');
      if (chat && win.MutationObserver) {
        state.observer = new win.MutationObserver(() => scheduleUpdate(650));
        state.observer.observe(chat, { childList: true, subtree: true, characterData: true });
      }
    } catch (e) {}

    try {
      if (typeof eventOn === 'function' && typeof tavern_events !== 'undefined') {
        ['MESSAGE_RECEIVED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'CHAT_CHANGED', 'GENERATION_ENDED'].forEach(name => {
          if (tavern_events[name]) {
            eventOn(tavern_events[name], () => scheduleUpdate(520));
          }
        });
      }
    } catch (e) {}

    renderData(state.data, true);
    scheduleUpdate(300);
  }

  addListener(window, 'unload', cleanup);
  addListener(window, 'pagehide', cleanup);

  init();
})();
