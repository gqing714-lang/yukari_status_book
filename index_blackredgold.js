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
  const CONFIG_BUTTON_ID = 'yukari-vn-status-config-button';
  const CONFIG_PANEL_ID = 'yukari-vn-status-config-panel';
  const STORAGE_KEY = 'yukari-vn-status-position';
  const THEME_STORAGE_KEY = 'yukari-vn-status-theme';
  const ICON_URL = 'https://files.catbox.moe/bv172s.png';

  const defaultTheme = {
    black: '#11100f',
    blackSoft: '#24211f',
    red: '#7f2924',
    redDeep: '#4b1613',
    gold: '#c4a25a',
    goldDim: '#7b6131',
    cream: '#f0d7a0',
    detailBg: '#181514',
    detailPanel: '#211d1b',
    detailText: '#ead6ad'
  };

  const themeFields = [
    ['black', '主黑'],
    ['blackSoft', '副黑'],
    ['red', '主红'],
    ['redDeep', '深红'],
    ['gold', '金线'],
    ['goldDim', '暗金'],
    ['cream', '主文字'],
    ['detailBg', '详情底'],
    ['detailPanel', '详情块'],
    ['detailText', '详情字']
  ];

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
    visible: true,
    theme: loadTheme()
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
        targetDoc.getElementById(CONFIG_BUTTON_ID)?.remove();
        targetDoc.getElementById(CONFIG_PANEL_ID)?.remove();
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

  function clampNumber(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function scoreToMood(score) {
    const n = Number(score);
    if (Number.isNaN(n)) return '平静';
    if (n >= 65) return '高兴';
    if (n >= 35) return '平静';
    if (n >= 15) return '低落';
    return '危险';
  }

  function moodTextToScore(text) {
    const value = String(text ?? '').trim();
    const numberPart = value.replace(/[^\d.-]/g, '');
    if (numberPart) return clampNumber(Number(numberPart), 0, 100);
    if (/危险|崩溃|失控|糟糕|愤怒|恐惧/.test(value)) return 8;
    if (/低落|难过|疲惫|不安|焦虑/.test(value)) return 25;
    if (/平静|普通|稳定|冷静/.test(value)) return 50;
    if (/高兴|愉快|开心|满足|喜欢/.test(value)) return 82;
    return 100;
  }

  function latestStatusBlock(text) {
    const list = [...String(text ?? '').matchAll(/<status\b[^>]*>([\s\S]*?)<\/status>/gi)];
    return list.length ? (list[list.length - 1][1] || '') : '';
  }

  function splitSections(block) {
    const keys = ['地点', '时间', '名字', '心情值', '心情', '穿着', '当前动作', '当前主线', '角色待办', '台词'];
    const result = {};
    keys.forEach(key => result[key] = []);
    let current = null;

    cleanBlock(block).split('\n').map(v => v.trim()).filter(Boolean).forEach(line => {
      const match = line.match(/^(地点|时间|名字|心情值|心情|穿着|当前动作|当前主线|角色待办|台词)\s*[:：]\s*(.*)$/);
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
    const rawMood = sections['心情值'][0] || sections['心情'][0] || '100';
    const moodValue = moodTextToScore(rawMood);
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

  function loadTheme() {
    try {
      const saved = JSON.parse(win.localStorage.getItem(THEME_STORAGE_KEY) || 'null');
      return { ...defaultTheme, ...(saved && typeof saved === 'object' ? saved : {}) };
    } catch (e) {
      return { ...defaultTheme };
    }
  }

  function saveTheme(theme) {
    state.theme = { ...defaultTheme, ...theme };
    try {
      win.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(state.theme));
    } catch (e) {}
  }

  function applyThemeToElement(el, theme = state.theme) {
    if (!el) return;
    el.style.setProperty('--ykr-black', theme.black);
    el.style.setProperty('--ykr-black-soft', theme.blackSoft);
    el.style.setProperty('--ykr-red', theme.red);
    el.style.setProperty('--ykr-red-deep', theme.redDeep);
    el.style.setProperty('--ykr-gold', theme.gold);
    el.style.setProperty('--ykr-gold-dim', theme.goldDim);
    el.style.setProperty('--ykr-cream', theme.cream);
    el.style.setProperty('--ykr-detail-bg', theme.detailBg);
    el.style.setProperty('--ykr-detail-panel', theme.detailPanel);
    el.style.setProperty('--ykr-detail-text', theme.detailText);
  }

  function applyTheme(root) {
    applyThemeToElement(root);
    applyThemeToElement(doc.getElementById(CONFIG_BUTTON_ID));
    applyThemeToElement(doc.getElementById(CONFIG_PANEL_ID));
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
        --dialog-top: 42px;
        --dialog-height: 72px;
        --dialog-width: min(530px, calc(100vw - 96px));
        --status-width: min(360px, calc(100vw - 160px));
        --ykr-black: ${defaultTheme.black};
        --ykr-black-soft: ${defaultTheme.blackSoft};
        --ykr-red: ${defaultTheme.red};
        --ykr-red-deep: ${defaultTheme.redDeep};
        --ykr-gold: ${defaultTheme.gold};
        --ykr-gold-dim: ${defaultTheme.goldDim};
        --ykr-cream: ${defaultTheme.cream};
        --ykr-detail-bg: ${defaultTheme.detailBg};
        --ykr-detail-panel: ${defaultTheme.detailPanel};
        --ykr-detail-text: ${defaultTheme.detailText};
        --border: 2px;
        --text-pad: 22px;

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

      #${ROOT_ID} *,
      #${CONFIG_BUTTON_ID},
      #${CONFIG_BUTTON_ID} *,
      #${CONFIG_PANEL_ID},
      #${CONFIG_PANEL_ID} * {
        box-sizing: border-box !important;
      }

      #${ROOT_ID} .ykr-icon {
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        width: var(--icon-size) !important;
        height: var(--icon-size) !important;
        z-index: 70 !important;
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
        transition: opacity .16s ease !important;
      }

      #${ROOT_ID}.panel-open .ykr-ui {
        opacity: 1 !important;
      }

      #${ROOT_ID} .status-bar,
      #${ROOT_ID} .dialog-box {
        opacity: 0 !important;
        transform: translateX(-14px) scaleX(.2) !important;
        transform-origin: left center !important;
        clip-path: inset(0 100% 0 0) !important;
        transition:
          opacity .18s ease,
          transform .26s cubic-bezier(.22,.92,.18,1),
          clip-path .30s cubic-bezier(.22,.92,.18,1) !important;
      }

      #${ROOT_ID}.panel-open .status-bar,
      #${ROOT_ID}.panel-open .dialog-box {
        opacity: 1 !important;
        transform: translateX(0) scaleX(1) !important;
        clip-path: inset(0 0 0 0) !important;
      }

      #${ROOT_ID} .detail-float {
        opacity: 0 !important;
        transform: translateY(-12px) scaleY(.62) !important;
        transform-origin: top center !important;
        clip-path: inset(0 0 100% 0) !important;
        transition:
          opacity .16s ease,
          transform .24s cubic-bezier(.18,.88,.22,1),
          clip-path .28s cubic-bezier(.18,.88,.22,1) !important;
      }

      #${ROOT_ID} .status-bar::before,
      #${ROOT_ID} .dialog-box::before,
      #${ROOT_ID} .detail-float::before {
        content: "" !important;
        position: absolute !important;
        inset: 3px !important;
        border: 1px solid color-mix(in srgb, var(--ykr-gold), transparent 58%) !important;
        pointer-events: none !important;
      }

      #${ROOT_ID} .status-bar::after,
      #${ROOT_ID} .dialog-box::after,
      #${ROOT_ID} .detail-float::after {
        content: "" !important;
        position: absolute !important;
        left: 0 !important;
        right: 0 !important;
        top: 0 !important;
        height: 1px !important;
        background: linear-gradient(90deg, transparent, var(--ykr-gold), transparent) !important;
        opacity: .58 !important;
        pointer-events: none !important;
      }

      #${ROOT_ID} .status-bar {
        position: absolute !important;
        left: var(--box-left) !important;
        top: var(--status-top) !important;
        width: var(--status-width) !important;
        height: var(--status-height) !important;
        z-index: 30 !important;
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) auto 26px !important;
        align-items: center !important;
        gap: 10px !important;
        padding: 0 10px 0 var(--text-pad) !important;
        justify-items: stretch !important;
        text-align: left !important;
        overflow: hidden !important;
        background:
          linear-gradient(90deg, var(--ykr-red-deep), var(--ykr-red) 52%, var(--ykr-red-deep)),
          var(--ykr-red-deep) !important;
        border: var(--border) solid var(--ykr-gold) !important;
        border-radius: 0 !important;
        box-shadow:
          4px 5px 0 rgba(0,0,0,.42),
          inset 0 1px 0 rgba(255,255,255,.10),
          inset 0 -8px 18px rgba(0,0,0,.20) !important;
        color: var(--ykr-cream) !important;
        pointer-events: auto !important;
      }

      #${ROOT_ID} .place {
        min-width: 0 !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
        font-size: 18px !important;
        font-weight: 800 !important;
        letter-spacing: .18em !important;
        text-align: left !important;
        text-shadow: 0 1px 0 rgba(0,0,0,.55) !important;
      }

      #${ROOT_ID} .time {
        font-size: 13px !important;
        letter-spacing: .12em !important;
        color: color-mix(in srgb, var(--ykr-cream), transparent 24%) !important;
        white-space: nowrap !important;
        justify-self: end !important;
        text-align: right !important;
      }

      #${ROOT_ID} .arrow-btn {
        all: initial !important;
        width: 26px !important;
        height: 26px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        color: var(--ykr-cream) !important;
        cursor: pointer !important;
        pointer-events: auto !important;
        user-select: none !important;
        -webkit-user-select: none !important;
        touch-action: manipulation !important;
        font-family: inherit !important;
        justify-self: end !important;
        border-left: 1px solid color-mix(in srgb, var(--ykr-gold), transparent 40%) !important;
      }

      #${ROOT_ID} .arrow-btn span {
        display: block !important;
        font-size: 15px !important;
        line-height: 1 !important;
        transform: rotate(0deg) !important;
        transition: transform .18s ease !important;
      }

      #${ROOT_ID}.detail-open .arrow-btn span {
        transform: rotate(180deg) !important;
      }

      #${ROOT_ID} .dialog-box {
        position: absolute !important;
        left: var(--box-left) !important;
        top: var(--dialog-top) !important;
        width: var(--dialog-width) !important;
        height: var(--dialog-height) !important;
        z-index: 20 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: flex-start !important;
        text-align: left !important;
        padding: 13px 18px 12px var(--text-pad) !important;
        overflow: hidden !important;
        background:
          linear-gradient(90deg, rgba(127,41,36,.22), transparent 36%),
          linear-gradient(180deg, var(--ykr-black-soft), var(--ykr-black)) !important;
        border: var(--border) solid var(--ykr-gold) !important;
        border-radius: 0 !important;
        box-shadow:
          5px 7px 0 rgba(0,0,0,.42),
          inset 0 1px 0 rgba(255,255,255,.07),
          inset 0 -10px 22px rgba(0,0,0,.26) !important;
        color: var(--ykr-cream) !important;
        pointer-events: auto !important;
        cursor: pointer !important;
      }

      #${ROOT_ID} .dialog-box .corner-mark {
        position: absolute !important;
        width: 10px !important;
        height: 10px !important;
        border-color: var(--ykr-gold) !important;
        opacity: .72 !important;
        pointer-events: none !important;
      }

      #${ROOT_ID} .dialog-box .corner-mark.lt { left: 6px; top: 6px; border-left: 1px solid; border-top: 1px solid; }
      #${ROOT_ID} .dialog-box .corner-mark.rb { right: 6px; bottom: 6px; border-right: 1px solid; border-bottom: 1px solid; }

      #${ROOT_ID} .dialog-text {
        display: inline !important;
        max-width: 100% !important;
        font-size: 15px !important;
        line-height: 1.55 !important;
        letter-spacing: .06em !important;
        white-space: pre-wrap !important;
        text-align: left !important;
        text-shadow: 0 1px 2px rgba(0,0,0,.42) !important;
      }

      #${ROOT_ID} .cursor {
        display: inline-block !important;
        margin-left: 6px !important;
        color: var(--ykr-gold) !important;
        animation: ykrCursor 1.05s ease-in-out infinite !important;
      }

      #${ROOT_ID} .detail-float {
        position: absolute !important;
        left: var(--box-left) !important;
        top: calc(var(--status-top) + var(--status-height) + 6px) !important;
        width: var(--dialog-width) !important;
        max-height: min(62vh, 390px) !important;
        overflow: auto !important;
        overscroll-behavior: contain !important;
        scrollbar-width: thin !important;
        z-index: 50 !important;
        pointer-events: none !important;
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--ykr-detail-bg), white 4%), var(--ykr-detail-bg)) !important;
        border: var(--border) solid var(--ykr-gold) !important;
        border-radius: 0 !important;
        box-shadow:
          5px 8px 0 rgba(0,0,0,.44),
          inset 0 1px 0 rgba(255,255,255,.06),
          inset 0 -12px 22px rgba(0,0,0,.22) !important;
        color: var(--ykr-detail-text) !important;
        padding: 12px !important;
      }

      #${ROOT_ID}.panel-open.detail-open .detail-float {
        opacity: 1 !important;
        transform: translateY(0) scaleY(1) !important;
        clip-path: inset(0 0 0 0) !important;
        pointer-events: auto !important;
      }

      #${ROOT_ID} .detail-grid {
        display: grid !important;
        grid-template-columns: .70fr 1.30fr !important;
        gap: 9px !important;
      }

      #${ROOT_ID} .info-box,
      #${ROOT_ID} .fold-card {
        min-width: 0 !important;
        padding: 8px 9px !important;
        border-radius: 0 !important;
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--ykr-detail-panel), white 5%), var(--ykr-detail-panel)) !important;
        border: 1px solid color-mix(in srgb, var(--ykr-gold), transparent 52%) !important;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.05) !important;
      }

      #${ROOT_ID} .info-box.wide,
      #${ROOT_ID} .fold-card.wide {
        grid-column: 1 / -1 !important;
      }

      #${ROOT_ID} .info-title,
      #${ROOT_ID} .fold-title {
        margin-bottom: 5px !important;
        font-size: 11px !important;
        font-weight: 800 !important;
        letter-spacing: .16em !important;
        color: var(--ykr-gold) !important;
      }

      #${ROOT_ID} .info-text,
      #${ROOT_ID} .fold-body {
        font-size: 12px !important;
        line-height: 1.58 !important;
        color: color-mix(in srgb, var(--ykr-detail-text), transparent 6%) !important;
        white-space: pre-wrap !important;
      }

      #${ROOT_ID} .mood-line {
        display: flex !important;
        align-items: baseline !important;
        justify-content: space-between !important;
        gap: 8px !important;
      }

      #${ROOT_ID} .mood-label {
        font-weight: 700 !important;
        color: var(--ykr-detail-text) !important;
      }

      #${ROOT_ID} .mood-number {
        color: color-mix(in srgb, var(--ykr-gold), white 8%) !important;
        font-size: 11px !important;
      }

      #${ROOT_ID} .mood-bar {
        height: 7px !important;
        border-radius: 0 !important;
        overflow: hidden !important;
        background: rgba(255,255,255,.08) !important;
        border: 1px solid color-mix(in srgb, var(--ykr-gold), transparent 66%) !important;
        margin-top: 7px !important;
      }

      #${ROOT_ID} .mood-fill {
        display: block !important;
        height: 100% !important;
        width: 100% !important;
        border-radius: 0 !important;
        background: linear-gradient(90deg, var(--ykr-red), var(--ykr-gold)) !important;
      }

      #${ROOT_ID} .fold-card {
        padding: 0 !important;
        overflow: hidden !important;
      }

      #${ROOT_ID} .fold-head {
        all: initial !important;
        width: 100% !important;
        min-height: 32px !important;
        padding: 8px 9px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 10px !important;
        cursor: pointer !important;
        pointer-events: auto !important;
        font-family: inherit !important;
        color: var(--ykr-gold) !important;
        background: linear-gradient(90deg, color-mix(in srgb, var(--ykr-red-deep), transparent 20%), transparent) !important;
        border-bottom: 1px solid transparent !important;
        user-select: none !important;
        -webkit-user-select: none !important;
      }

      #${ROOT_ID} .fold-head:hover {
        background: linear-gradient(90deg, color-mix(in srgb, var(--ykr-red), transparent 38%), transparent) !important;
      }

      #${ROOT_ID} .fold-title {
        margin: 0 !important;
      }

      #${ROOT_ID} .fold-symbol {
        font-size: 13px !important;
        line-height: 1 !important;
        color: var(--ykr-cream) !important;
      }

      #${ROOT_ID} .fold-body {
        max-height: 0 !important;
        overflow: hidden !important;
        padding: 0 9px !important;
        transition:
          max-height .24s ease,
          padding-top .18s ease,
          padding-bottom .18s ease !important;
      }

      #${ROOT_ID} .fold-card.is-open .fold-head {
        border-bottom-color: color-mix(in srgb, var(--ykr-gold), transparent 62%) !important;
      }

      #${ROOT_ID} .fold-card.is-open .fold-symbol {
        transform: rotate(45deg) !important;
      }

      #${ROOT_ID} .fold-card.is-open .fold-body {
        max-height: 260px !important;
        padding-top: 8px !important;
        padding-bottom: 9px !important;
      }

      #${ROOT_ID} .divider {
        grid-column: 1 / -1 !important;
        height: 1px !important;
        background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--ykr-gold), transparent 36%), transparent) !important;
        margin: 1px 0 !important;
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
        color: var(--ykr-red) !important;
      }

      #${ROOT_ID} .main-title {
        font-weight: 800 !important;
        color: var(--ykr-gold) !important;
        margin-bottom: 4px !important;
      }

      #${ROOT_ID} .detail-float::-webkit-scrollbar {
        width: 6px !important;
      }

      #${ROOT_ID} .detail-float::-webkit-scrollbar-thumb {
        background: color-mix(in srgb, var(--ykr-gold), transparent 48%) !important;
        border-radius: 0 !important;
      }

      #${CONFIG_BUTTON_ID} {
        --ykr-black: ${defaultTheme.black};
        --ykr-red: ${defaultTheme.red};
        --ykr-gold: ${defaultTheme.gold};
        --ykr-cream: ${defaultTheme.cream};
        position: fixed !important;
        right: 14px !important;
        bottom: 92px !important;
        z-index: 2147483647 !important;
        min-width: 42px !important;
        height: 34px !important;
        padding: 0 10px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 5px !important;
        border-radius: 0 !important;
        border: 2px solid var(--ykr-gold) !important;
        background: linear-gradient(180deg, var(--ykr-red), var(--ykr-black)) !important;
        color: var(--ykr-cream) !important;
        font-family: "CustomFont", "NanoOldSong-A", "LXGW WenKai", "Noto Serif SC", serif !important;
        font-size: 12px !important;
        letter-spacing: .08em !important;
        cursor: pointer !important;
        pointer-events: auto !important;
        box-shadow: 4px 5px 0 rgba(0,0,0,.38) !important;
        user-select: none !important;
        -webkit-user-select: none !important;
      }

      #${CONFIG_BUTTON_ID}:active {
        transform: translate(2px, 2px) !important;
        box-shadow: 2px 3px 0 rgba(0,0,0,.38) !important;
      }

      #${CONFIG_PANEL_ID} {
        --ykr-black: ${defaultTheme.black};
        --ykr-black-soft: ${defaultTheme.blackSoft};
        --ykr-red: ${defaultTheme.red};
        --ykr-red-deep: ${defaultTheme.redDeep};
        --ykr-gold: ${defaultTheme.gold};
        --ykr-cream: ${defaultTheme.cream};
        --ykr-detail-bg: ${defaultTheme.detailBg};
        --ykr-detail-panel: ${defaultTheme.detailPanel};
        --ykr-detail-text: ${defaultTheme.detailText};
        position: fixed !important;
        right: 14px !important;
        bottom: 136px !important;
        width: min(340px, calc(100vw - 28px)) !important;
        max-height: min(70vh, 520px) !important;
        overflow: auto !important;
        z-index: 2147483647 !important;
        display: none !important;
        border: 2px solid var(--ykr-gold) !important;
        border-radius: 0 !important;
        background: linear-gradient(180deg, var(--ykr-black-soft), var(--ykr-black)) !important;
        color: var(--ykr-cream) !important;
        font-family: "CustomFont", "NanoOldSong-A", "LXGW WenKai", "Noto Serif SC", serif !important;
        box-shadow: 6px 8px 0 rgba(0,0,0,.45) !important;
        padding: 12px !important;
      }

      #${CONFIG_PANEL_ID}.is-open {
        display: block !important;
      }

      #${CONFIG_PANEL_ID} .cfg-head {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 12px !important;
        padding-bottom: 8px !important;
        margin-bottom: 10px !important;
        border-bottom: 1px solid color-mix(in srgb, var(--ykr-gold), transparent 52%) !important;
      }

      #${CONFIG_PANEL_ID} .cfg-title {
        font-weight: 800 !important;
        letter-spacing: .12em !important;
        color: var(--ykr-gold) !important;
        font-size: 13px !important;
      }

      #${CONFIG_PANEL_ID} .cfg-close {
        all: initial !important;
        width: 26px !important;
        height: 26px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        border: 1px solid var(--ykr-gold) !important;
        color: var(--ykr-cream) !important;
        cursor: pointer !important;
        font-family: inherit !important;
      }

      #${CONFIG_PANEL_ID} .cfg-grid {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 8px !important;
      }

      #${CONFIG_PANEL_ID} .cfg-field {
        display: grid !important;
        grid-template-columns: 1fr 38px !important;
        align-items: center !important;
        gap: 8px !important;
        min-width: 0 !important;
        padding: 7px !important;
        border: 1px solid color-mix(in srgb, var(--ykr-gold), transparent 66%) !important;
        background: color-mix(in srgb, var(--ykr-black), white 4%) !important;
      }

      #${CONFIG_PANEL_ID} .cfg-label {
        font-size: 12px !important;
        letter-spacing: .08em !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }

      #${CONFIG_PANEL_ID} input[type="color"] {
        width: 38px !important;
        height: 26px !important;
        padding: 0 !important;
        border: 1px solid var(--ykr-gold) !important;
        border-radius: 0 !important;
        background: transparent !important;
        cursor: pointer !important;
      }

      #${CONFIG_PANEL_ID} .cfg-actions {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 8px !important;
        margin-top: 10px !important;
      }

      #${CONFIG_PANEL_ID} .cfg-action {
        all: initial !important;
        height: 30px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        border: 1px solid var(--ykr-gold) !important;
        background: linear-gradient(180deg, var(--ykr-red), var(--ykr-red-deep)) !important;
        color: var(--ykr-cream) !important;
        font-family: inherit !important;
        font-size: 12px !important;
        letter-spacing: .12em !important;
        cursor: pointer !important;
      }

      #${CONFIG_PANEL_ID} .cfg-hint {
        margin-top: 9px !important;
        font-size: 11px !important;
        line-height: 1.45 !important;
        color: color-mix(in srgb, var(--ykr-cream), transparent 26%) !important;
      }

      @keyframes ykrCursor {
        0%, 100% { transform: translateY(0); opacity: .55; }
        50% { transform: translateY(3px); opacity: 1; }
      }

      @media (max-width: 520px) {
        #${ROOT_ID} {
          --icon-size: 114px;
          --box-left: 70px;
          --dialog-width: min(334px, calc(100vw - 92px));
          --status-width: min(250px, calc(100vw - 156px));
          --text-pad: 22px;
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

        #${CONFIG_PANEL_ID} .cfg-grid {
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
          <i class="corner-mark lt"></i><i class="corner-mark rb"></i>
          <span class="dialog-text"></span><span class="cursor">◆</span>
        </div>

        <div class="detail-float">
          <div class="detail-grid">
            <div class="info-box">
              <div class="info-title">心情</div>
              <div class="info-text">
                <div class="mood-line"><span class="mood-label"></span><span class="mood-number"></span></div>
                <div class="mood-bar"><i class="mood-fill"></i></div>
              </div>
            </div>
            <div class="info-box">
              <div class="info-title">时刻</div>
              <div class="info-text detail-time"></div>
            </div>

            <div class="fold-card wide is-open" data-fold="outfit">
              <button class="fold-head" type="button"><span class="fold-title">装束</span><span class="fold-symbol">＋</span></button>
              <div class="fold-body"><div class="outfit"></div></div>
            </div>
            <div class="fold-card wide" data-fold="action">
              <button class="fold-head" type="button"><span class="fold-title">所作</span><span class="fold-symbol">＋</span></button>
              <div class="fold-body"><div class="action"></div></div>
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
    applyTheme(root);
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
    setText(root, '.detail-time', `${data.place}｜${data.time}`);
    setText(root, '.mood-label', data.moodLabel);
    setText(root, '.mood-number', `${data.moodValue}/100`);
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

  function buildConfigPanel(root) {
    const button = doc.createElement('button');
    button.id = CONFIG_BUTTON_ID;
    button.type = 'button';
    button.title = '状态栏配色';
    button.textContent = '状态栏';

    const panel = doc.createElement('div');
    panel.id = CONFIG_PANEL_ID;
    panel.innerHTML = `
      <div class="cfg-head">
        <div class="cfg-title">状态栏配色</div>
        <button class="cfg-close" type="button">×</button>
      </div>
      <div class="cfg-grid">
        ${themeFields.map(([key, label]) => `
          <label class="cfg-field">
            <span class="cfg-label">${label}</span>
            <input type="color" data-key="${key}" value="${state.theme[key] || defaultTheme[key]}">
          </label>
        `).join('')}
      </div>
      <div class="cfg-actions">
        <button class="cfg-action save" type="button">保存</button>
        <button class="cfg-action reset" type="button">重置</button>
      </div>
      <div class="cfg-hint">改色会先实时预览，点保存后写入本地缓存。重载脚本或刷新酒馆后仍会保留。</div>
    `;

    doc.body.appendChild(button);
    doc.body.appendChild(panel);
    applyTheme(root);

    function readPanelTheme() {
      const next = { ...state.theme };
      panel.querySelectorAll('input[type="color"][data-key]').forEach(input => {
        next[input.dataset.key] = input.value;
      });
      return next;
    }

    function syncInputs(theme) {
      panel.querySelectorAll('input[type="color"][data-key]').forEach(input => {
        input.value = theme[input.dataset.key] || defaultTheme[input.dataset.key];
      });
    }

    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      panel.classList.toggle('is-open');
    });

    panel.querySelector('.cfg-close')?.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      panel.classList.remove('is-open');
    });

    panel.querySelectorAll('input[type="color"][data-key]').forEach(input => {
      input.addEventListener('input', () => {
        state.theme = { ...defaultTheme, ...readPanelTheme() };
        applyTheme(root);
      });
    });

    panel.querySelector('.cfg-action.save')?.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      saveTheme(readPanelTheme());
      applyTheme(root);
    });

    panel.querySelector('.cfg-action.reset')?.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      saveTheme({ ...defaultTheme });
      syncInputs(state.theme);
      applyTheme(root);
    });
  }

  function bindFoldEvents(root) {
    root.querySelectorAll('.fold-head').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        button.closest('.fold-card')?.classList.toggle('is-open');
      });
    });
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
    buildConfigPanel(root);
    bindFoldEvents(root);

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
      return {
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

    let arrowTouchLock = 0;

    arrow.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (Date.now() < arrowTouchLock) return;
      root.classList.toggle('detail-open');
    });

    arrow.addEventListener('touchend', event => {
      event.preventDefault();
      event.stopPropagation();
      arrowTouchLock = Date.now() + 450;
      root.classList.toggle('detail-open');
    }, { passive: false });

    bindObserver(root);
    scheduleUpdate(root, 300);
  }

  window.addEventListener('unload', cleanup);
  window.addEventListener('pagehide', cleanup);

  init();
})();
