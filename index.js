/* yukari_vn_status_textalign_fix.js
 * SillyTavern JS-Slash-Runner / 酒馆助手脚本
 * VN-style horizontal status + dialogue UI
 */
(function () {
  'use strict';

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
  const STORAGE_KEY = 'yukari_vn_status_position';
  const ICON_URL = 'https://files.catbox.moe/bv172s.png';

  const FALLBACK = {
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
  };

  const state = {
    data: { ...FALLBACK },
    quoteIndex: 0,
    typingTimer: null,
    updateTimer: null,
    observer: null,
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
    for (const targetDoc of getTargetDocs()) {
      try {
        targetDoc.getElementById(ROOT_ID)?.remove();
        targetDoc.getElementById(STYLE_ID)?.remove();
      } catch (e) {}
    }
    if (state.observer) {
      try { state.observer.disconnect(); } catch (e) {}
      state.observer = null;
    }
    if (state.typingTimer) clearInterval(state.typingTimer);
    if (state.updateTimer) clearTimeout(state.updateTimer);
  }

  cleanup();

  function addStyle() {
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        --icon-size: 114px;
        --box-left: 70px;
        --status-top: 4px;
        --status-height: 34px;
        --status-width: min(350px, calc(100vw - 96px));
        --dialog-top: 41px;
        --dialog-height: 70px;
        --dialog-width: min(520px, calc(100vw - 96px));
        --border: 2px;
        --radius: 6px;
        --gold: #a78d57;
        --red: #96352f;
        --black: #2b2a28;
        --text-safe-status: 74px;
        --text-safe-dialog: 62px;

        position: fixed !important;
        left: 24px;
        top: 160px;
        z-index: 2147483647 !important;
        width: var(--icon-size) !important;
        height: var(--icon-size) !important;
        overflow: visible !important;
        pointer-events: none !important;
      }

      #${ROOT_ID} * { box-sizing: border-box !important; }

      #${ROOT_ID} .yk-icon {
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        z-index: 50 !important;
        width: var(--icon-size) !important;
        height: var(--icon-size) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
        outline: none !important;
        pointer-events: auto !important;
        user-select: none !important;
        -webkit-user-select: none !important;
        touch-action: none !important;
      }

      #${ROOT_ID} .yk-icon img {
        width: var(--icon-size) !important;
        height: var(--icon-size) !important;
        object-fit: contain !important;
        display: block !important;
        pointer-events: none !important;
        user-select: none !important;
        -webkit-user-drag: none !important;
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
      }

      #${ROOT_ID} .yk-status-bar,
      #${ROOT_ID} .yk-dialog-box,
      #${ROOT_ID} .yk-detail-panel {
        opacity: 0 !important;
        pointer-events: none !important;
        transform: translateX(-10px) scaleX(.16) !important;
        transform-origin: left center !important;
        clip-path: inset(0 100% 0 0 round var(--radius)) !important;
        filter: blur(2px) !important;
        transition:
          opacity .22s ease,
          transform .30s cubic-bezier(.2,.9,.2,1),
          clip-path .34s cubic-bezier(.2,.9,.2,1),
          filter .22s ease !important;
        font-family: "CustomFont", "NanoOldSong-A", "LXGW WenKai", "Noto Serif SC", serif !important;
      }

      #${ROOT_ID}.yk-open .yk-status-bar,
      #${ROOT_ID}.yk-open .yk-dialog-box {
        opacity: 1 !important;
        pointer-events: auto !important;
        transform: translateX(0) scaleX(1) !important;
        clip-path: inset(0 0 0 0 round var(--radius)) !important;
        filter: blur(0) !important;
      }

      #${ROOT_ID}.yk-open.yk-detail-open .yk-detail-panel {
        opacity: 1 !important;
        pointer-events: auto !important;
        transform: translateX(0) scaleX(1) !important;
        clip-path: inset(0 0 0 0 round var(--radius)) !important;
        filter: blur(0) !important;
      }

      #${ROOT_ID} .yk-status-bar {
        position: absolute !important;
        left: var(--box-left) !important;
        top: var(--status-top) !important;
        z-index: 20 !important;
        width: var(--status-width) !important;
        height: var(--status-height) !important;
        border: var(--border) solid var(--gold) !important;
        border-radius: var(--radius) !important;
        background: linear-gradient(180deg, #a53d35 0%, var(--red) 100%) !important;
        box-shadow: 0 4px 0 rgba(167,141,87,.35), 0 8px 18px rgba(0,0,0,.18) !important;
        overflow: hidden !important;
      }

      #${ROOT_ID} .yk-place {
        position: absolute !important;
        left: var(--text-safe-status) !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
        max-width: calc(100% - var(--text-safe-status) - 118px) !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
        color: #f1dfc2 !important;
        font-size: 16px !important;
        font-weight: 700 !important;
        letter-spacing: .12em !important;
        line-height: 1 !important;
        text-align: left !important;
        text-shadow: 0 1px 2px rgba(0,0,0,.24) !important;
      }

      #${ROOT_ID} .yk-time {
        position: absolute !important;
        right: 52px !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
        color: rgba(241,223,194,.72) !important;
        font-size: 14px !important;
        font-weight: 500 !important;
        letter-spacing: .08em !important;
        line-height: 1 !important;
        white-space: nowrap !important;
      }

      #${ROOT_ID} .yk-arrow {
        position: absolute !important;
        right: 16px !important;
        top: 50% !important;
        transform: translateY(-50%) rotate(0deg) !important;
        width: 24px !important;
        height: 24px !important;
        border: none !important;
        background: transparent !important;
        color: #f1dfc2 !important;
        font-size: 20px !important;
        line-height: 24px !important;
        text-align: center !important;
        padding: 0 !important;
        margin: 0 !important;
        cursor: pointer !important;
        pointer-events: auto !important;
        user-select: none !important;
        -webkit-user-select: none !important;
        touch-action: manipulation !important;
        transition: transform .22s ease !important;
      }

      #${ROOT_ID}.yk-detail-open .yk-arrow { transform: translateY(-50%) rotate(90deg) !important; }

      #${ROOT_ID} .yk-dialog-box {
        position: absolute !important;
        left: var(--box-left) !important;
        top: var(--dialog-top) !important;
        z-index: 10 !important;
        width: var(--dialog-width) !important;
        height: var(--dialog-height) !important;
        border: var(--border) solid var(--gold) !important;
        border-radius: var(--radius) !important;
        background: var(--black) !important;
        box-shadow: 0 8px 22px rgba(0,0,0,.24), inset 0 1px 0 rgba(255,255,255,.06) !important;
        overflow: hidden !important;
      }

      #${ROOT_ID} .yk-dialog-text {
        position: absolute !important;
        left: var(--text-safe-dialog) !important;
        right: 20px !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
        color: #f1dfc2 !important;
        font-size: 16px !important;
        line-height: 1.55 !important;
        letter-spacing: .05em !important;
        text-align: left !important;
        white-space: pre-wrap !important;
      }

      #${ROOT_ID} .yk-cursor {
        display: inline-block !important;
        margin-left: 6px !important;
        color: var(--gold) !important;
        animation: ykCursor 1.05s ease-in-out infinite !important;
      }

      #${ROOT_ID} .yk-detail-panel {
        position: absolute !important;
        left: var(--box-left) !important;
        top: calc(var(--status-top) - 8px) !important;
        z-index: 35 !important;
        width: var(--dialog-width) !important;
        max-height: min(64vh, 360px) !important;
        overflow: auto !important;
        overscroll-behavior: contain !important;
        -webkit-overflow-scrolling: touch !important;
        border: var(--border) solid var(--gold) !important;
        border-radius: var(--radius) !important;
        background: rgba(235, 218, 185, .98) !important;
        box-shadow: 0 14px 34px rgba(0,0,0,.34) !important;
      }

      #${ROOT_ID} .yk-detail-inner { padding: 12px 13px !important; }
      #${ROOT_ID} .yk-detail-grid { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 8px !important; }
      #${ROOT_ID} .yk-box { padding: 8px 9px !important; border-radius: 6px !important; background: rgba(255,250,235,.62) !important; border: 1px solid rgba(105,71,45,.18) !important; }
      #${ROOT_ID} .yk-box.wide { grid-column: 1 / -1 !important; }
      #${ROOT_ID} .yk-title { margin-bottom: 4px !important; color: rgba(94,45,37,.88) !important; font-weight: 700 !important; font-size: 11px !important; letter-spacing: .1em !important; }
      #${ROOT_ID} .yk-text { color: rgba(43,31,28,.82) !important; font-size: 12px !important; line-height: 1.55 !important; white-space: pre-wrap !important; }
      #${ROOT_ID} .yk-mood-track { height: 7px !important; border-radius: 999px !important; background: rgba(57,42,38,.18) !important; overflow: hidden !important; margin-top: 5px !important; }
      #${ROOT_ID} .yk-mood-fill { display: block !important; height: 100% !important; width: 100% !important; border-radius: inherit !important; background: linear-gradient(90deg, rgba(116,45,39,.88), rgba(167,141,87,.92)) !important; }
      #${ROOT_ID} .yk-sep { grid-column: 1 / -1 !important; height: 1px !important; background: rgba(94,58,43,.22) !important; margin: 2px 0 !important; }
      #${ROOT_ID} .yk-todo-note { padding: 8px 10px !important; border-radius: 6px !important; background: #efe0b8 !important; border-left: 4px solid rgba(150,61,52,.85) !important; box-shadow: 0 3px 10px rgba(0,0,0,.08) !important; }
      #${ROOT_ID} .yk-todo-note ul { display: grid !important; gap: 4px !important; margin: 0 !important; padding: 0 !important; list-style: none !important; }
      #${ROOT_ID} .yk-todo-note li { position: relative !important; padding-left: 16px !important; }
      #${ROOT_ID} .yk-todo-note li::before { content: '◇' !important; position: absolute !important; left: 0 !important; color: rgba(137,51,45,.76) !important; }

      @keyframes ykCursor { 0%,100% { transform: translateY(0); opacity:.58; } 50% { transform: translateY(3px); opacity:1; } }

      @media (max-width: 520px) {
        #${ROOT_ID} {
          --dialog-width: min(430px, calc(100vw - 86px));
          --status-width: min(300px, calc(100vw - 114px));
          --text-safe-status: 72px;
          --text-safe-dialog: 60px;
        }
        #${ROOT_ID} .yk-place { font-size: 15px !important; }
        #${ROOT_ID} .yk-time { font-size: 13px !important; right: 48px !important; }
        #${ROOT_ID} .yk-dialog-text { font-size: 15px !important; }
        #${ROOT_ID} .yk-detail-grid { grid-template-columns: 1fr !important; }
        #${ROOT_ID} .yk-sep { grid-column: auto !important; }
      }
    `;
    doc.head.appendChild(style);
  }

  function extractStatusBlock(text) {
    const raw = String(text || '');
    const list = [...raw.matchAll(/<status\b[^>]*>([\s\S]*?)<\/status>/gi)];
    return list.length ? list[list.length - 1][1] : '';
  }

  function parseStatus(block) {
    if (!block) return { ...FALLBACK };
    const keys = ['地点','时间','名字','心情值','穿着','当前动作','当前主线','角色待办','台词'];
    const sections = Object.fromEntries(keys.map(k => [k, []]));
    let current = null;
    const lines = String(block).replace(/\r/g, '').split('\n').map(v => v.trim()).filter(Boolean);
    for (const line of lines) {
      const m = line.match(/^(地点|时间|名字|心情值|穿着|当前动作|当前主线|角色待办|台词)\s*[:：]\s*(.*)$/);
      if (m) {
        current = m[1];
        if (m[2]) sections[current].push(m[2].replace(/\{\/\/.*?\}/g, '').trim());
      } else if (current) {
        sections[current].push(line.replace(/\{\/\/.*?\}/g, '').trim());
      }
    }
    const moodValue = Math.max(0, Math.min(100, Number((sections['心情值'][0] || '100').replace(/[^\d.-]/g, '')) || 100));
    const mainRaw = sections['当前主线'].join('\n');
    const [mainTitle, ...mainRest] = mainRaw.split('|');
    const todos = sections['角色待办'].join('\n').split('\n').map(v => v.trim().replace(/^\d+\s*[.．、]\s*/, '')).filter(Boolean);
    const quoteLines = sections['台词'].join('\n').split('\n').map(v => v.trim()).filter(Boolean);
    const quotes = quoteLines.map(v => {
      const m = v.match(/^[^：:]{1,12}\s*[:：]\s*(.+)$/);
      return m ? m[1].trim() : v;
    }).filter(Boolean);
    return {
      place: sections['地点'][0] || FALLBACK.place,
      time: sections['时间'][0] || FALLBACK.time,
      name: sections['名字'][0] || FALLBACK.name,
      moodValue,
      outfit: sections['穿着'].join('\n') || FALLBACK.outfit,
      action: sections['当前动作'].join('\n') || FALLBACK.action,
      mainTitle: (mainTitle || FALLBACK.mainTitle).trim(),
      mainSummary: (mainRest.join('|') || FALLBACK.mainSummary).trim(),
      todos: todos.length ? todos : FALLBACK.todos,
      quotes: quotes.length ? quotes : FALLBACK.quotes,
    };
  }

  async function findLatestStatus() {
    try {
      if (typeof getLastMessageId === 'function' && typeof getChatMessages === 'function') {
        const lastId = Number(getLastMessageId());
        const messages = await Promise.resolve(getChatMessages(`0-${lastId}`, { role: 'assistant', hide_state: 'unhidden', include_swipes: false }));
        if (Array.isArray(messages)) {
          for (let i = messages.length - 1; i >= 0; i--) {
            const block = extractStatusBlock(messages[i]?.message);
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
          if (chat[i]?.is_user) continue;
          const block = extractStatusBlock(chat[i]?.mes || chat[i]?.message);
          if (block) return block;
        }
      }
    } catch (e) {}
    try {
      const nodes = [...doc.querySelectorAll('#chat .mes_text')].reverse();
      for (const node of nodes) {
        const block = extractStatusBlock(node.textContent || '');
        if (block) return block;
      }
    } catch (e) {}
    return '';
  }

  function typeQuote(text) {
    const root = doc.getElementById(ROOT_ID);
    const textEl = root?.querySelector('.yk-dialog-text');
    const cursor = '<span class="yk-cursor">◆</span>';
    if (!textEl) return;
    if (state.typingTimer) clearInterval(state.typingTimer);
    const chars = Array.from(text || '……');
    let i = 0;
    textEl.innerHTML = cursor;
    state.typingTimer = setInterval(() => {
      i++;
      textEl.innerHTML = escapeHtml(chars.slice(0, i).join('')) + cursor;
      if (i >= chars.length) clearInterval(state.typingTimer);
    }, 34);
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"]/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s]));
  }

  function renderData(data) {
    state.data = { ...FALLBACK, ...data };
    const root = doc.getElementById(ROOT_ID);
    if (!root) return;
    root.querySelector('.yk-place').textContent = state.data.place;
    root.querySelector('.yk-time').textContent = state.data.time;
    root.querySelector('.yk-name').textContent = state.data.name;
    root.querySelector('.yk-mood-num').textContent = String(state.data.moodValue);
    root.querySelector('.yk-mood-fill').style.width = `${state.data.moodValue}%`;
    root.querySelector('.yk-outfit').textContent = state.data.outfit;
    root.querySelector('.yk-action').textContent = state.data.action;
    root.querySelector('.yk-main-title').textContent = state.data.mainTitle;
    root.querySelector('.yk-main-summary').textContent = state.data.mainSummary;
    const ul = root.querySelector('.yk-todos');
    ul.innerHTML = '';
    for (const todo of state.data.todos) {
      const li = doc.createElement('li');
      li.textContent = todo;
      ul.appendChild(li);
    }
    state.quoteIndex = 0;
    typeQuote(state.data.quotes[0]);
  }

  async function updateFromLatest() {
    const block = await findLatestStatus();
    renderData(parseStatus(block));
    hideStatusBlocks();
  }

  function hideStatusBlocks() {
    try {
      doc.querySelectorAll('#chat .mes_text').forEach(node => {
        node.querySelectorAll?.('status').forEach(el => { el.style.display = 'none'; });
      });
    } catch (e) {}
  }

  function scheduleUpdate(delay = 500) {
    if (state.updateTimer) clearTimeout(state.updateTimer);
    state.updateTimer = setTimeout(updateFromLatest, delay);
  }

  function mount() {
    if (!doc.body || !doc.head) { setTimeout(mount, 100); return; }
    cleanup();
    addStyle();

    const root = doc.createElement('div');
    root.id = ROOT_ID;
    let saved = null;
    try { saved = JSON.parse(win.localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) {}
    if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
      root.style.left = saved.left + 'px';
      root.style.top = saved.top + 'px';
    }

    root.innerHTML = `
      <div class="yk-icon"><img src="${ICON_URL}" alt=""></div>
      <div class="yk-status-bar">
        <span class="yk-place">${FALLBACK.place}</span>
        <span class="yk-time">${FALLBACK.time}</span>
        <button class="yk-arrow" type="button">▶</button>
      </div>
      <div class="yk-dialog-box"><div class="yk-dialog-text"></div></div>
      <div class="yk-detail-panel">
        <div class="yk-detail-inner">
          <div class="yk-detail-grid">
            <div class="yk-box"><div class="yk-title">名</div><div class="yk-text yk-name">${FALLBACK.name}</div></div>
            <div class="yk-box"><div class="yk-title">心情值</div><div class="yk-text"><span class="yk-mood-num">${FALLBACK.moodValue}</span><div class="yk-mood-track"><i class="yk-mood-fill"></i></div></div></div>
            <div class="yk-box wide"><div class="yk-title">装束</div><div class="yk-text yk-outfit"></div></div>
            <div class="yk-box wide"><div class="yk-title">行为</div><div class="yk-text yk-action"></div></div>
            <div class="yk-sep"></div>
            <div class="yk-box wide"><div class="yk-title">角色待办</div><div class="yk-text yk-todo-note"><ul class="yk-todos"></ul></div></div>
            <div class="yk-box wide"><div class="yk-title">当前主线</div><div class="yk-text"><b class="yk-main-title"></b><br><span class="yk-main-summary"></span></div></div>
          </div>
        </div>
      </div>
    `;

    doc.body.appendChild(root);

    const icon = root.querySelector('.yk-icon');
    const arrow = root.querySelector('.yk-arrow');
    const dialog = root.querySelector('.yk-dialog-box');

    let dragging = false, moved = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;

    function getPoint(event) {
      const touch = event.touches?.[0] || event.changedTouches?.[0];
      return touch ? { x: touch.clientX, y: touch.clientY } : { x: event.clientX, y: event.clientY };
    }
    function clampPosition(left, top) {
      return {
        left: Math.max(0, Math.min(left, win.innerWidth - 114)),
        top: Math.max(0, Math.min(top, win.innerHeight - 114)),
      };
    }
    function savePosition() {
      const rect = root.getBoundingClientRect();
      try { win.localStorage.setItem(STORAGE_KEY, JSON.stringify({ left: rect.left, top: rect.top })); } catch (e) {}
    }
    function ensurePanelInView() {
      const panelRight = root.getBoundingClientRect().left + 70 + Math.min(520, win.innerWidth - 96) + 8;
      if (panelRight > win.innerWidth) {
        const nextLeft = Math.max(2, win.innerWidth - Math.min(520, win.innerWidth - 96) - 76);
        root.style.left = nextLeft + 'px';
        savePosition();
      }
    }
    function startDrag(event) {
      const p = getPoint(event);
      const rect = root.getBoundingClientRect();
      dragging = true; moved = false;
      startX = p.x; startY = p.y; startLeft = rect.left; startTop = rect.top;
      event.preventDefault(); event.stopPropagation();
    }
    function moveDrag(event) {
      if (!dragging) return;
      const p = getPoint(event);
      const dx = p.x - startX, dy = p.y - startY;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;
      if (moved) {
        const next = clampPosition(startLeft + dx, startTop + dy);
        root.style.left = next.left + 'px'; root.style.top = next.top + 'px';
      }
      event.preventDefault(); event.stopPropagation();
    }
    function endDrag(event) {
      if (!dragging) return;
      dragging = false;
      if (moved) savePosition(); else {
        const willOpen = !root.classList.contains('yk-open');
        if (willOpen) ensurePanelInView();
        root.classList.toggle('yk-open');
      }
      event?.preventDefault?.(); event?.stopPropagation?.();
    }
    function toggleDetail(event) {
      event.preventDefault(); event.stopPropagation();
      root.classList.toggle('yk-detail-open');
    }
    function nextQuote(event) {
      event.preventDefault(); event.stopPropagation();
      const quotes = state.data.quotes?.length ? state.data.quotes : FALLBACK.quotes;
      state.quoteIndex = (state.quoteIndex + 1) % quotes.length;
      typeQuote(quotes[state.quoteIndex]);
    }

    icon.addEventListener('touchstart', startDrag, { passive: false });
    doc.addEventListener('touchmove', moveDrag, { passive: false, capture: true });
    doc.addEventListener('touchend', endDrag, { passive: false, capture: true });
    doc.addEventListener('touchcancel', endDrag, { passive: false, capture: true });
    icon.addEventListener('mousedown', startDrag, true);
    doc.addEventListener('mousemove', moveDrag, true);
    doc.addEventListener('mouseup', endDrag, true);

    arrow.addEventListener('click', toggleDetail);
    arrow.addEventListener('touchend', toggleDetail, { passive: false });
    dialog.addEventListener('click', nextQuote);
    dialog.addEventListener('touchend', nextQuote, { passive: false });

    renderData(FALLBACK);
    scheduleUpdate(300);

    try {
      const chat = doc.querySelector('#chat');
      if (chat) {
        state.observer = new win.MutationObserver(() => scheduleUpdate(700));
        state.observer.observe(chat, { childList: true, subtree: true, characterData: true });
      }
    } catch (e) {}
  }

  window.__YUKARI_VN_STATUS__ = { cleanup, update: updateFromLatest };
  window.addEventListener('unload', cleanup);
  window.addEventListener('pagehide', cleanup);
  mount();
})();
