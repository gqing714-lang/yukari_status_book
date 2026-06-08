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
  const ICON_URL = 'https://files.catbox.moe/kdsisd.gif';
  const QUOTE_MAX_LINES = 2;
  const QUOTE_HARD_MAX_CHARS = 54;

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
    quoteSegments: null,
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
        --status-top: 4px;
        --status-height: 34px;
        --dialog-top: 41px;
        --dialog-height: 70px;
        --dialog-width: min(520px, calc(100vw - 96px));
        --status-width: min(350px, calc(100vw - 160px));
        --cream: #eadfc3;
        --cream-dim: rgba(234, 223, 195, .58);
        --red: #8c3030;
        --paper: #f5efe2;
        --paper-block: #ede4d0;
        --paper-block-strong: #e8dcc8;
        --paper-text: #2a1f18;
        --shadow: rgba(0, 0, 0, .34);
        --text-pad: 22px;

        position: fixed !important;
        left: 24px;
        top: 160px;
        width: var(--icon-size) !important;
        height: var(--icon-size) !important;
        overflow: visible !important;
        pointer-events: none !important;
        z-index: 2147483647 !important;
        font-family: "CustomFont", "NanoOldSong-A", "LXGW WenKai", "Noto Serif SC", "Source Han Serif SC", serif !important;
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

      #${ROOT_ID} .status-row,
      #${ROOT_ID} .dialog-box {
        opacity: 0 !important;
        transform: translateX(-14px) scaleX(.22) !important;
        transform-origin: left center !important;
        clip-path: inset(0 100% 0 0) !important;
        transition:
          opacity .22s ease,
          transform .30s cubic-bezier(.2,.9,.2,1),
          clip-path .34s cubic-bezier(.2,.9,.2,1) !important;
      }

      #${ROOT_ID}.panel-open .status-row,
      #${ROOT_ID}.panel-open .dialog-box {
        opacity: 1 !important;
        transform: translateX(0) scaleX(1) !important;
        clip-path: inset(0 0 0 0) !important;
      }

      #${ROOT_ID} .status-row {
        position: absolute !important;
        left: var(--box-left) !important;
        top: var(--status-top) !important;
        display: flex !important;
        align-items: stretch !important;
        gap: 0 !important;
        width: var(--status-width) !important;
        height: var(--status-height) !important;
        z-index: 35 !important;
        pointer-events: auto !important;
      }

      #${ROOT_ID} .seg-location {
        flex: 1 1 auto !important;
        display: flex !important;
        align-items: center !important;
        min-width: 0 !important;
        overflow: hidden !important;
        padding: 0 10px 0 22px !important;
        background: linear-gradient(90deg, #950d01 0%, #440000 100%) !important;
        border: 1px solid #3b0606 !important;
        border-right: none !important;
        position: relative !important;
      }

      #${ROOT_ID} .place {
        min-width: 0 !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
        font-size: 17px !important;
        font-weight: 700 !important;
        letter-spacing: .13em !important;
        color: rgba(234,223,195,.95) !important;
        text-shadow: 0 1px 2px rgba(0,0,0,.34) !important;
      }

      #${ROOT_ID} .seg-dot {
        margin: 0 9px !important;
        width: 2px !important;
        height: 2px !important;
        border-radius: 50% !important;
        background: rgba(255,255,255,.22) !important;
        flex-shrink: 0 !important;
      }

      #${ROOT_ID} .time {
        font-size: 13px !important;
        letter-spacing: .08em !important;
        color: rgba(234,223,195,.55) !important;
        white-space: nowrap !important;
        font-variant-numeric: tabular-nums !important;
        flex-shrink: 0 !important;
      }

      #${ROOT_ID} .panel-wrapper {
        position: relative !important;
        width: 34px !important;
        height: 34px !important;
        flex: 0 0 34px !important;
        pointer-events: auto !important;
      }

      #${ROOT_ID} .seg-icon {
        all: initial !important;
        width: 34px !important;
        height: 34px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        background: transparent !important;
        border: none !important;
        cursor: pointer !important;
        position: relative !important;
        user-select: none !important;
        -webkit-user-select: none !important;
        touch-action: manipulation !important;
        pointer-events: auto !important;
      }

      #${ROOT_ID} .seg-icon svg {
        width: 15px !important;
        height: 15px !important;
        stroke: rgba(234,223,195,.60) !important;
        fill: none !important;
        stroke-width: 1.5 !important;
        stroke-linecap: round !important;
        stroke-linejoin: round !important;
        transition: stroke .14s !important;
      }

      #${ROOT_ID} .seg-icon svg [fill] {
        fill: rgba(234,223,195,.55) !important;
        stroke: none !important;
      }

      #${ROOT_ID} .seg-icon:hover svg,
      #${ROOT_ID} .seg-icon.active svg {
        stroke: rgba(234,223,195,.95) !important;
      }

      #${ROOT_ID} .seg-icon.active svg [fill] {
        fill: rgba(234,223,195,.90) !important;
      }

      #${ROOT_ID} .detail-panel {
        position: absolute !important;
        top: calc(100% + 3px) !important;
        right: 0 !important;
        width: var(--status-width) !important;
        background: #f5efe2 !important;
        border: 1px solid #c8b89a !important;
        border-top: 2px solid #8c3030 !important;
        color: #2a1f18 !important;
        padding: 9px 10px !important;
        opacity: 0 !important;
        transform: translateY(-4px) !important;
        clip-path: inset(0 0 100% 0) !important;
        transition:
          opacity .16s ease,
          transform .20s cubic-bezier(.2,.9,.2,1),
          clip-path .22s cubic-bezier(.2,.9,.2,1) !important;
        pointer-events: none !important;
        z-index: 99 !important;
        box-shadow: 0 14px 28px rgba(0,0,0,.26) !important;
      }

      #${ROOT_ID}.panel-open .panel-wrapper.open .detail-panel {
        opacity: 1 !important;
        transform: translateY(0) !important;
        clip-path: inset(0 0 0 0) !important;
        pointer-events: auto !important;
      }

      #${ROOT_ID} .meta-block {
        padding: 7px 10px !important;
        background: #ede4d0 !important;
        border-left: 2px solid #8c3030 !important;
        margin-bottom: 5px !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 4px !important;
      }

      #${ROOT_ID} .meta-row1 {
        display: flex !important;
        align-items: baseline !important;
        gap: 9px !important;
      }

      #${ROOT_ID} .meta-date {
        font-size: 15px !important;
        font-weight: 700 !important;
        letter-spacing: .06em !important;
        color: #1e1410 !important;
        line-height: 1 !important;
      }

      #${ROOT_ID} .meta-time {
        font-size: 11px !important;
        letter-spacing: .06em !important;
        color: rgba(42,31,24,.42) !important;
        font-variant-numeric: tabular-nums !important;
        line-height: 1 !important;
      }

      #${ROOT_ID} .meta-place {
        font-size: 12px !important;
        font-weight: 500 !important;
        letter-spacing: .18em !important;
        color: rgba(42,31,24,.58) !important;
        line-height: 1 !important;
      }

      #${ROOT_ID} .info-block {
        padding: 6px 9px !important;
        background: #ede4d0 !important;
        border-left: 2px solid rgba(140,48,48,.20) !important;
        margin-bottom: 4px !important;
      }

      #${ROOT_ID} .info-block:last-child {
        margin-bottom: 0 !important;
      }

      #${ROOT_ID} .info-title {
        font-size: 9px !important;
        font-weight: 700 !important;
        letter-spacing: .22em !important;
        color: #8c3030 !important;
        margin-bottom: 4px !important;
      }

      #${ROOT_ID} .info-text {
        font-size: 12px !important;
        line-height: 1.72 !important;
        color: rgba(42,31,24,.75) !important;
        letter-spacing: .03em !important;
        white-space: pre-wrap !important;
      }

      #${ROOT_ID} .mood-row {
        display: flex !important;
        align-items: center !important;
        gap: 9px !important;
      }

      #${ROOT_ID} .mood-number {
        font-size: 11px !important;
        color: rgba(42,31,24,.40) !important;
        font-variant-numeric: tabular-nums !important;
        white-space: nowrap !important;
        min-width: 22px !important;
      }

      #${ROOT_ID} .mood-bar {
        flex: 1 1 auto !important;
        height: 2px !important;
        background: rgba(42,31,24,.12) !important;
      }

      #${ROOT_ID} .mood-fill {
        display: block !important;
        height: 100% !important;
        width: 100% !important;
        background: linear-gradient(90deg, #8c3030, rgba(140,80,60,.45)) !important;
      }

      #${ROOT_ID} .panel-divider {
        height: 1px !important;
        background: rgba(42,31,24,.10) !important;
        margin: 5px 0 !important;
      }

      #${ROOT_ID} .todo-list {
        margin: 0 !important;
        padding: 0 !important;
        list-style: none !important;
        display: grid !important;
        gap: 5px !important;
      }

      #${ROOT_ID} .todo-list li {
        position: relative !important;
        padding-left: 13px !important;
        font-size: 12px !important;
        line-height: 1.55 !important;
        color: rgba(42,31,24,.72) !important;
        letter-spacing: .02em !important;
      }

      #${ROOT_ID} .todo-list li::before {
        content: "·" !important;
        position: absolute !important;
        left: 2px !important;
        color: #8c3030 !important;
        font-size: 16px !important;
        line-height: .9 !important;
        top: 1px !important;
      }

      #${ROOT_ID} .main-title {
        font-weight: 700 !important;
        font-size: 12px !important;
        letter-spacing: .08em !important;
        color: #1e1410 !important;
        margin-bottom: 5px !important;
      }

      #${ROOT_ID} .main-summary {
        font-size: 11px !important;
        line-height: 1.78 !important;
        color: rgba(42,31,24,.55) !important;
        letter-spacing: .02em !important;
        white-space: pre-wrap !important;
      }

      #${ROOT_ID} .todo-block {
        border-left-color: rgba(140,48,48,.35) !important;
        background: #e8dcc8 !important;
      }

      #${ROOT_ID} .dialog-box {
        position: absolute !important;
        left: var(--box-left) !important;
        top: var(--dialog-top) !important;
        width: var(--dialog-width) !important;
        height: var(--dialog-height) !important;
        z-index: 20 !important;
        display: block !important;
        padding: 9px 18px 9px 22px !important;
        overflow: hidden !important;
        background: radial-gradient(ellipse 65% 120% at 20% 30%, #2b2a28 0%, #000000 100%) !important;
        border: 1px solid #000 !important;
        color: rgba(234,223,195,.92) !important;
        pointer-events: auto !important;
        cursor: pointer !important;
        user-select: none !important;
        -webkit-user-select: none !important;
        touch-action: manipulation !important;
      }

      #${ROOT_ID} .dialog-content {
        display: block !important;
        width: 100% !important;
        max-height: 100% !important;
        overflow: hidden !important;
        text-align: left !important;
      }

      #${ROOT_ID} .dialog-text {
        display: inline !important;
        max-width: 100% !important;
        font-size: 15px !important;
        line-height: 1.55 !important;
        letter-spacing: .05em !important;
        color: rgba(234,223,195,.92) !important;
        white-space: pre-wrap !important;
        overflow-wrap: anywhere !important;
        word-break: break-word !important;
        text-shadow: 0 1px 2px rgba(0,0,0,.36) !important;
      }

      #${ROOT_ID} .dialog-text::after {
        content: "◆" !important;
        display: inline-block !important;
        margin-left: 6px !important;
        font-size: 9px !important;
        color: rgba(234,223,195,.92) !important;
        animation: ykrCursor 1.05s ease-in-out infinite !important;
        vertical-align: middle !important;
      }

      @keyframes ykrCursor {
        0%, 100% { transform: translateY(0); opacity: .48; }
        50% { transform: translateY(3px); opacity: .92; }
      }

      @media (max-width: 520px) {
        #${ROOT_ID} {
          --icon-size: 114px;
          --box-left: 70px;
          --dialog-width: min(330px, calc(100vw - 92px));
          --status-width: min(245px, calc(100vw - 156px));
          --text-pad: 22px;
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
        <div class="status-row">
          <div class="seg-location">
            <span class="place"></span>
            <div class="seg-dot"></div>
            <span class="time"></span>
          </div>

          <div class="panel-wrapper pw-detail">
            <button class="seg-icon btn-detail" type="button" aria-label="切换人物详情">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="8" r="4"/>
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
              </svg>
            </button>
            <div class="detail-panel">
              <div class="meta-block">
                <div class="meta-row1">
                  <span class="meta-date"></span>
                  <span class="meta-time"></span>
                </div>
                <span class="meta-place"></span>
              </div>
              <div class="info-block">
                <div class="info-title">心情</div>
                <div class="mood-row">
                  <span class="mood-number"></span>
                  <div class="mood-bar"><i class="mood-fill"></i></div>
                </div>
              </div>
              <div class="info-block">
                <div class="info-title">装束</div>
                <div class="info-text outfit"></div>
              </div>
              <div class="info-block">
                <div class="info-title">所作</div>
                <div class="info-text action"></div>
              </div>
            </div>
          </div>

          <div class="panel-wrapper pw-todo">
            <button class="seg-icon btn-todo" type="button" aria-label="切换役目主线">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <line x1="8" y1="6" x2="21" y2="6"/>
                <line x1="8" y1="12" x2="21" y2="12"/>
                <line x1="8" y1="18" x2="21" y2="18"/>
                <circle cx="3.5" cy="6" r="1" fill="rgba(234,223,195,.55)" stroke="none"/>
                <circle cx="3.5" cy="12" r="1" fill="rgba(234,223,195,.55)" stroke="none"/>
                <circle cx="3.5" cy="18" r="1" fill="rgba(234,223,195,.55)" stroke="none"/>
              </svg>
            </button>
            <div class="detail-panel">
              <div class="info-block todo-block">
                <div class="info-title">役目</div>
                <ul class="todo-list"></ul>
              </div>
              <div class="panel-divider"></div>
              <div class="info-block">
                <div class="main-title"></div>
                <div class="main-summary"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="dialog-box" title="切换下一句">
          <div class="dialog-content"><span class="dialog-text"></span></div>
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

  function splitTimeMeta(value) {
    const raw = safeText(value) || fallbackData.time;
    const match = raw.match(/^(.+?)\s+(\d{1,2}[:：]\d{2}(?:\s*[-~—至]\s*\d{1,2}[:：]\d{2})?.*)$/);
    if (match) return { date: match[1], time: match[2] };
    return { date: '当前', time: raw };
  }

  function renderStatic(root) {
    const data = state.data;
    const meta = splitTimeMeta(data.time);
    setText(root, '.place', data.place);
    setText(root, '.time', data.time);
    setText(root, '.meta-date', meta.date);
    setText(root, '.meta-time', meta.time);
    setText(root, '.meta-place', data.place);
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

  function getDialogTextMetrics(root) {
    try {
      const box = root.querySelector('.dialog-box');
      const text = root.querySelector('.dialog-text');
      if (!box || !text) return null;

      const boxStyle = win.getComputedStyle(box);
      const textStyle = win.getComputedStyle(text);
      const boxWidth = box.clientWidth || 0;
      const boxHeight = box.clientHeight || 0;
      const padLeft = parseFloat(boxStyle.paddingLeft) || 0;
      const padRight = parseFloat(boxStyle.paddingRight) || 0;
      const padTop = parseFloat(boxStyle.paddingTop) || 0;
      const padBottom = parseFloat(boxStyle.paddingBottom) || 0;
      const fontSize = parseFloat(textStyle.fontSize) || 15;
      const lineHeight = parseFloat(textStyle.lineHeight) || (fontSize * 1.55);
      const letterSpacing = textStyle.letterSpacing || 'normal';
      const usableWidth = Math.max(80, boxWidth - padLeft - padRight - 24);
      const usableHeight = Math.max(lineHeight, boxHeight - padTop - padBottom);
      const lines = Math.max(1, Math.min(QUOTE_MAX_LINES, Math.floor(usableHeight / lineHeight)));

      return {
        width: usableWidth,
        maxHeight: Math.max(lineHeight, (lineHeight * lines) + 1),
        fontSize,
        lineHeight,
        letterSpacing,
        fontFamily: textStyle.fontFamily,
        fontWeight: textStyle.fontWeight
      };
    } catch (e) {
      return null;
    }
  }

  function fallbackSplitQuoteText(text) {
    const source = String(text || '').replace(/\r/g, '').trim();
    if (!source) return [];

    const chunks = [];
    let chars = [...source];
    const punct = '。！？!?；;…，、, ';
    const closers = '」』”’）)】》';

    while (chars.length > QUOTE_HARD_MAX_CHARS) {
      const minCut = Math.max(1, Math.floor(QUOTE_HARD_MAX_CHARS * .56));
      let cut = QUOTE_HARD_MAX_CHARS;

      for (let i = Math.min(QUOTE_HARD_MAX_CHARS - 1, chars.length - 1); i >= minCut; i--) {
        if (punct.includes(chars[i])) {
          cut = i + 1;
          break;
        }
      }

      while (cut < chars.length && closers.includes(chars[cut])) cut += 1;
      const chunk = chars.slice(0, cut).join('').trim();
      if (chunk) chunks.push(chunk);
      chars = chars.slice(cut).join('').trimStart().split('');
    }

    const tail = chars.join('').trim();
    if (tail) chunks.push(tail);
    return chunks;
  }

  function splitQuoteText(root, text) {
    const source = String(text || '').replace(/\r/g, '').trim();
    if (!source) return [];

    const metrics = getDialogTextMetrics(root);
    if (!metrics) return fallbackSplitQuoteText(source);

    const measurer = doc.createElement('div');
    measurer.style.cssText = [
      'position:absolute',
      'left:-99999px',
      'top:-99999px',
      'visibility:hidden',
      'pointer-events:none',
      'box-sizing:border-box',
      `width:${metrics.width}px`,
      `font-family:${metrics.fontFamily}`,
      `font-size:${metrics.fontSize}px`,
      `font-weight:${metrics.fontWeight}`,
      `line-height:${metrics.lineHeight}px`,
      `letter-spacing:${metrics.letterSpacing}`,
      'white-space:pre-wrap',
      'overflow-wrap:anywhere',
      'word-break:break-word'
    ].join(';') + ';';
    root.appendChild(measurer);

    const chunks = [];
    const punct = '。！？!?；;…，、, ';
    const closers = '」』”’）)】》';
    let rest = [...source];

    try {
      while (rest.length) {
        let lastGood = 0;
        let lastBreak = 0;
        const hardStop = Math.min(rest.length, QUOTE_HARD_MAX_CHARS);

        for (let i = 1; i <= hardStop; i++) {
          measurer.textContent = rest.slice(0, i).join('');
          if (measurer.scrollHeight <= metrics.maxHeight) {
            lastGood = i;
            if (punct.includes(rest[i - 1])) lastBreak = i;
          } else {
            break;
          }
        }

        if (!lastGood) lastGood = Math.max(1, Math.min(12, hardStop));

        let cut = lastGood;
        const minUsefulBreak = Math.floor(lastGood * .55);
        if (lastBreak >= minUsefulBreak) cut = lastBreak;
        while (cut < rest.length && closers.includes(rest[cut])) cut += 1;

        const chunk = rest.slice(0, cut).join('').trim();
        if (chunk) chunks.push(chunk);
        rest = rest.slice(cut).join('').trimStart().split('');
      }
    } finally {
      measurer.remove();
    }

    return chunks.length ? chunks : fallbackSplitQuoteText(source);
  }

  function buildQuoteSegmentPool(root) {
    const segments = [];

    quotePool().forEach(item => {
      const pieces = splitQuoteText(root, item.text);
      if (pieces.length) {
        pieces.forEach(text => segments.push({ ...item, text }));
      }
    });

    return segments.length ? segments : quotePool();
  }

  function quoteSegmentPool(root) {
    if (!state.quoteSegments) {
      state.quoteSegments = buildQuoteSegmentPool(root);
    }
    return state.quoteSegments;
  }

  function resetQuoteSegments() {
    state.quoteSegments = null;
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
      i += 1;
      el.textContent = chars.slice(0, i).join('');
      if (i < chars.length) {
        state.typeTimer = setTimeout(step, 24);
      }
    };
    step();
  }

  function showCurrentQuote(root) {
    const pool = quoteSegmentPool(root);
    if (!pool.length) return;
    const item = pool[state.quoteIndex % pool.length];
    typeQuote(root, item.text);
  }

  function nextQuote(root) {
    const pool = quoteSegmentPool(root);
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
      resetQuoteSegments();
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
    const detailBtn = root.querySelector('.btn-detail');
    const todoBtn = root.querySelector('.btn-todo');
    const detailPanel = root.querySelector('.pw-detail');
    const todoPanel = root.querySelector('.pw-todo');

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

    let lastDialogTap = 0;
    function handleDialogTap(event) {
      const now = Date.now();
      if (now - lastDialogTap < 120) return;
      lastDialogTap = now;
      event.preventDefault();
      event.stopPropagation();
      nextQuote(root);
    }

    let lastPanelTap = 0;
    function closePanels(exceptPanel = null) {
      [detailPanel, todoPanel].forEach(panel => {
        if (panel && panel !== exceptPanel) panel.classList.remove('open');
      });
      if (exceptPanel !== detailPanel) detailBtn?.classList.remove('active');
      if (exceptPanel !== todoPanel) todoBtn?.classList.remove('active');
    }

    function handlePanelTap(panel, button, event) {
      const now = Date.now();
      if (now - lastPanelTap < 120) return;
      lastPanelTap = now;
      event.preventDefault();
      event.stopPropagation();
      const willOpen = !panel.classList.contains('open');
      closePanels(panel);
      panel.classList.toggle('open', willOpen);
      button.classList.toggle('active', willOpen);
    }

    function handleDocTap(event) {
      if (!root.contains(event.target)) closePanels();
    }

    if ('PointerEvent' in win) {
      dialog.addEventListener('pointerup', handleDialogTap, true);
      detailBtn?.addEventListener('pointerup', event => handlePanelTap(detailPanel, detailBtn, event), true);
      todoBtn?.addEventListener('pointerup', event => handlePanelTap(todoPanel, todoBtn, event), true);
      doc.addEventListener('pointerup', handleDocTap, true);
    } else {
      dialog.addEventListener('click', handleDialogTap, true);
      dialog.addEventListener('touchend', handleDialogTap, { passive: false, capture: true });
      detailBtn?.addEventListener('click', event => handlePanelTap(detailPanel, detailBtn, event), true);
      detailBtn?.addEventListener('touchend', event => handlePanelTap(detailPanel, detailBtn, event), { passive: false, capture: true });
      todoBtn?.addEventListener('click', event => handlePanelTap(todoPanel, todoBtn, event), true);
      todoBtn?.addEventListener('touchend', event => handlePanelTap(todoPanel, todoBtn, event), { passive: false, capture: true });
      doc.addEventListener('click', handleDocTap, true);
    }

    win.addEventListener('resize', () => {
      resetQuoteSegments();
      showCurrentQuote(root);
    });

    bindObserver(root);
    scheduleUpdate(root, 300);
  }

  window.addEventListener('unload', cleanup);
  window.addEventListener('pagehide', cleanup);

  init();
})();
