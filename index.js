/*
 * 虚见相 · 文游横条状态栏 v1
 * - 父页面注入
 * - 悬浮图可拖拽
 * - 点击图标展开/收起
 * - 右侧箭头展开余下状态
 * - 读取最新 <status>...</status> 自动更新
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

  const fallback = {
    place: '万事屋',
    time: '11:20',
    name: '虚見 相',
    mood: 76,
    outfit: '白襦袢，外披一件松散的黑羽织，袖口压着旧账册的一角。',
    action: '他倚在柜台后翻看账册，指尖慢慢翻过泛黄的纸页，偶尔抬眼看向门口，像是在等某个本不该来的客人。',
    mainTitle: '神隐少女事件',
    mainSummary: '雨夜来访的少女许下“想要消失”的愿望，代价尚未明晰，虚见相似乎并不意外。',
    todos: ['调查愿望代价', '确认少女身上的异常气息', '准备茶点安抚user'],
    voice: '真是的……又露出这种表情。'
  };

  let state = { data: { ...fallback }, lastHash: '', typingTimer: null, observer: null, updateTimer: null };

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
    clearInterval(state.typingTimer);
    try { state.observer && state.observer.disconnect(); } catch (e) {}

    for (const targetDoc of getTargetDocs()) {
      try {
        targetDoc.getElementById(ROOT_ID)?.remove();
        targetDoc.getElementById(STYLE_ID)?.remove();
      } catch (e) {}
    }
  }

  cleanup();

  function addStyle() {
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      status,
      .ykr-status-hidden {
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

      #${ROOT_ID} .ykr-icon {
        width: 112px !important;
        height: 112px !important;
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
        position: relative !important;
        z-index: 6 !important;
      }

      #${ROOT_ID} .ykr-icon img {
        width: 112px !important;
        height: 112px !important;
        object-fit: contain !important;
        display: block !important;
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
        outline: none !important;
        pointer-events: none !important;
        user-select: none !important;
        -webkit-user-drag: none !important;
      }

      #${ROOT_ID} .ykr-panel {
        position: absolute !important;
        left: 98px !important;
        top: 50% !important;
        width: min(560px, calc(100vw - 126px)) !important;
        max-height: min(74vh, 590px) !important;
        overflow: visible !important;
        pointer-events: none !important;
        opacity: 0 !important;
        transform: translateY(-50%) translateX(-14px) scaleX(0.12) !important;
        transform-origin: left center !important;
        clip-path: inset(0 100% 0 0 round 5px) !important;
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

      #${ROOT_ID}.panel-open .ykr-panel {
        pointer-events: auto !important;
        opacity: 1 !important;
        transform: translateY(-50%) translateX(0) scaleX(1) !important;
        clip-path: inset(0 0 0 0 round 5px) !important;
        filter: blur(0) !important;
      }

      #${ROOT_ID} .ykr-wrap {
        position: relative !important;
        width: 100% !important;
        overflow: visible !important;
      }

      #${ROOT_ID} .ykr-topbar {
        position: relative !important;
        z-index: 3 !important;
        width: min(365px, calc(100% - 42px)) !important;
        min-height: 44px !important;
        margin-left: 22px !important;
        margin-bottom: 8px !important;
        padding: 7px 42px 7px 15px !important;
        display: flex !important;
        align-items: center !important;
        gap: 10px !important;
        background: #91332c !important;
        border: 3px solid #a78d57 !important;
        border-radius: 6px !important;
        box-shadow: 0 7px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.12) !important;
      }

      #${ROOT_ID} .ykr-place {
        min-width: 0 !important;
        max-width: 66% !important;
        color: #f1dfc2 !important;
        font-size: 15px !important;
        font-weight: 700 !important;
        letter-spacing: 0.12em !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
        text-shadow: 0 1px 2px rgba(0,0,0,0.28) !important;
      }

      #${ROOT_ID} .ykr-time {
        color: rgba(241,223,194,0.76) !important;
        font-size: 11px !important;
        letter-spacing: 0.08em !important;
        white-space: nowrap !important;
      }

      #${ROOT_ID} .ykr-toggle-detail {
        position: absolute !important;
        right: 8px !important;
        top: 50% !important;
        width: 27px !important;
        height: 27px !important;
        transform: translateY(-50%) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        border: none !important;
        background: transparent !important;
        color: #e7d4ac !important;
        font-size: 15px !important;
        line-height: 1 !important;
        cursor: pointer !important;
        pointer-events: auto !important;
        touch-action: manipulation !important;
        user-select: none !important;
        -webkit-user-select: none !important;
      }

      #${ROOT_ID} .ykr-toggle-detail span {
        display: inline-block !important;
        transform: rotate(-90deg) !important;
        transition: transform 0.22s ease !important;
        text-shadow: 0 1px 3px rgba(0,0,0,0.35) !important;
      }

      #${ROOT_ID}.detail-open .ykr-toggle-detail span {
        transform: rotate(0deg) !important;
      }

      #${ROOT_ID} .ykr-dialogue {
        position: relative !important;
        z-index: 2 !important;
        min-height: 96px !important;
        padding: 19px 22px 18px 96px !important;
        background: #2b2a28 !important;
        border: 4px solid #a78d57 !important;
        border-radius: 7px !important;
        box-shadow: 0 14px 34px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.08) !important;
        color: #e7d4ac !important;
      }

      #${ROOT_ID} .ykr-dialogue::before {
        content: "" !important;
        position: absolute !important;
        left: -7px !important;
        top: -7px !important;
        width: 28px !important;
        height: calc(100% + 14px) !important;
        border-left: 3px solid rgba(167,141,87,0.72) !important;
        border-top: 3px solid rgba(167,141,87,0.28) !important;
        border-bottom: 3px solid rgba(167,141,87,0.28) !important;
        border-radius: 7px 0 0 7px !important;
        pointer-events: none !important;
      }

      #${ROOT_ID} .ykr-voice {
        font-size: 14px !important;
        line-height: 1.78 !important;
        letter-spacing: 0.045em !important;
        white-space: pre-wrap !important;
        text-shadow: 0 1px 2px rgba(0,0,0,0.24) !important;
      }

      #${ROOT_ID} .ykr-cursor {
        display: inline-block !important;
        margin-left: 5px !important;
        color: #a78d57 !important;
        animation: ykrCursor 1.05s ease-in-out infinite !important;
      }

      #${ROOT_ID} .ykr-detail {
        position: relative !important;
        z-index: 1 !important;
        display: grid !important;
        grid-template-rows: 0fr !important;
        width: calc(100% - 12px) !important;
        margin-left: 12px !important;
        margin-top: 0 !important;
        overflow: hidden !important;
        transition: grid-template-rows 0.30s cubic-bezier(.2,.9,.2,1), margin-top 0.24s ease !important;
      }

      #${ROOT_ID}.detail-open .ykr-detail {
        grid-template-rows: 1fr !important;
        margin-top: 8px !important;
      }

      #${ROOT_ID} .ykr-detail-inner {
        min-height: 0 !important;
        overflow: hidden !important;
      }

      #${ROOT_ID} .ykr-detail-scroll {
        max-height: min(46vh, 390px) !important;
        overflow: auto !important;
        -webkit-overflow-scrolling: touch !important;
        padding: 10px 11px 11px !important;
        border: 3px solid rgba(167,141,87,0.76) !important;
        border-radius: 6px !important;
        background:
          linear-gradient(180deg, rgba(238,224,198,0.98), rgba(215,197,164,0.98)) !important;
        box-shadow: 0 10px 24px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.25) !important;
      }

      #${ROOT_ID} .ykr-row {
        margin-bottom: 9px !important;
      }

      #${ROOT_ID} .ykr-row-title {
        margin-bottom: 4px !important;
        color: rgba(92,42,36,0.92) !important;
        font-size: 11px !important;
        font-weight: 700 !important;
        letter-spacing: 0.12em !important;
      }

      #${ROOT_ID} .ykr-row-text {
        color: rgba(43,31,28,0.82) !important;
        font-size: 12px !important;
        line-height: 1.62 !important;
        letter-spacing: 0.03em !important;
        white-space: pre-wrap !important;
      }

      #${ROOT_ID} .ykr-mood-line {
        height: 9px !important;
        border-radius: 999px !important;
        overflow: hidden !important;
        background: rgba(58,42,35,0.18) !important;
        box-shadow: inset 0 1px 3px rgba(43,28,23,0.24), 0 1px 0 rgba(255,255,255,0.25) !important;
      }

      #${ROOT_ID} .ykr-mood-fill {
        display: block !important;
        width: 76% !important;
        height: 100% !important;
        border-radius: inherit !important;
        background: linear-gradient(90deg, #91332c, #a78d57) !important;
      }

      #${ROOT_ID} .ykr-sep {
        height: 2px !important;
        margin: 10px 0 !important;
        background: linear-gradient(90deg, transparent, rgba(92,42,36,0.35), transparent) !important;
      }

      #${ROOT_ID} .ykr-sticky {
        position: relative !important;
        padding: 10px 11px 10px !important;
        margin-top: 3px !important;
        background: rgba(247,231,184,0.92) !important;
        border: 2px solid rgba(167,141,87,0.70) !important;
        border-radius: 4px !important;
        box-shadow: 4px 5px 0 rgba(91,62,36,0.16) !important;
      }

      #${ROOT_ID} .ykr-sticky::before {
        content: "" !important;
        position: absolute !important;
        right: 8px !important;
        top: 0 !important;
        width: 24px !important;
        height: 9px !important;
        background: rgba(145,51,44,0.78) !important;
        border-radius: 0 0 3px 3px !important;
      }

      #${ROOT_ID} .ykr-todos {
        margin: 0 !important;
        padding: 0 !important;
        list-style: none !important;
        display: grid !important;
        gap: 5px !important;
      }

      #${ROOT_ID} .ykr-todos li {
        position: relative !important;
        padding-left: 18px !important;
        color: rgba(43,31,28,0.84) !important;
        font-size: 12px !important;
        line-height: 1.45 !important;
      }

      #${ROOT_ID} .ykr-todos li::before {
        content: "◇" !important;
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        color: rgba(145,51,44,0.82) !important;
      }

      @keyframes ykrCursor {
        0%, 100% { transform: translateY(0); opacity: 0.55; }
        50% { transform: translateY(3px); opacity: 1; }
      }

      @media (max-width: 520px) {
        #${ROOT_ID} .ykr-panel {
          width: min(350px, calc(100vw - 124px)) !important;
        }
        #${ROOT_ID} .ykr-topbar {
          width: min(260px, calc(100% - 52px)) !important;
        }
        #${ROOT_ID} .ykr-dialogue {
          padding: 15px 15px 15px 70px !important;
          min-height: 88px !important;
        }
        #${ROOT_ID} .ykr-voice {
          font-size: 12px !important;
        }
      }
    `;
    doc.head.appendChild(style);
  }

  function makeRoot() {
    const root = doc.createElement('div');
    root.id = ROOT_ID;

    let saved = null;
    try { saved = JSON.parse(win.localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) {}

    if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
      root.style.left = saved.left + 'px';
      root.style.top = saved.top + 'px';
    }

    root.innerHTML = `
      <div class="ykr-icon">
        <img src="${ICON_URL}" alt="">
      </div>

      <div class="ykr-panel">
        <div class="ykr-wrap">
          <div class="ykr-topbar">
            <span class="ykr-place"></span>
            <span class="ykr-time"></span>
            <button class="ykr-toggle-detail" type="button" aria-label="切换状态详情"><span>▼</span></button>
          </div>

          <div class="ykr-dialogue">
            <span class="ykr-voice"></span><span class="ykr-cursor">◆</span>
          </div>

          <div class="ykr-detail">
            <div class="ykr-detail-inner">
              <div class="ykr-detail-scroll">
                <div class="ykr-row">
                  <div class="ykr-row-title">心情值</div>
                  <div class="ykr-mood-line"><i class="ykr-mood-fill"></i></div>
                </div>

                <div class="ykr-row">
                  <div class="ykr-row-title">装束</div>
                  <div class="ykr-row-text ykr-outfit"></div>
                </div>

                <div class="ykr-row">
                  <div class="ykr-row-title">行为</div>
                  <div class="ykr-row-text ykr-action"></div>
                </div>

                <div class="ykr-sep"></div>

                <div class="ykr-row">
                  <div class="ykr-row-title">角色待办</div>
                  <div class="ykr-sticky"><ul class="ykr-todos"></ul></div>
                </div>

                <div class="ykr-row">
                  <div class="ykr-row-title">当前主线</div>
                  <div class="ykr-row-text ykr-main"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    doc.body.appendChild(root);
    return root;
  }

  function stripOuterQuote(text) {
    return String(text || '')
      .trim()
      .replace(/^「/, '')
      .replace(/」$/, '')
      .trim();
  }

  function typeVoice(text) {
    const root = doc.getElementById(ROOT_ID);
    const target = root?.querySelector('.ykr-voice');
    if (!target) return;

    const voice = stripOuterQuote(text || fallback.voice);
    clearInterval(state.typingTimer);
    target.textContent = '「';
    let index = 0;

    state.typingTimer = setInterval(() => {
      index++;
      target.textContent = '「' + voice.slice(0, index) + (index >= voice.length ? '」' : '');
      if (index >= voice.length) clearInterval(state.typingTimer);
    }, 32);
  }

  function render(data, forceVoice) {
    const root = doc.getElementById(ROOT_ID);
    if (!root) return;

    state.data = { ...fallback, ...data };
    const d = state.data;

    root.querySelector('.ykr-place').textContent = d.place || fallback.place;
    root.querySelector('.ykr-time').textContent = d.time || fallback.time;
    root.querySelector('.ykr-outfit').textContent = d.outfit || fallback.outfit;
    root.querySelector('.ykr-action').textContent = d.action || fallback.action;

    const mainText = d.mainSummary ? `${d.mainTitle || '当前主线'}\n${d.mainSummary}` : (d.mainTitle || fallback.mainTitle);
    root.querySelector('.ykr-main').textContent = mainText;

    const mood = Math.max(0, Math.min(100, Number(d.mood) || 0));
    root.querySelector('.ykr-mood-fill').style.width = mood + '%';

    const todosEl = root.querySelector('.ykr-todos');
    todosEl.innerHTML = '';
    (Array.isArray(d.todos) && d.todos.length ? d.todos : fallback.todos).forEach(item => {
      const li = doc.createElement('li');
      li.textContent = item;
      todosEl.appendChild(li);
    });

    if (forceVoice || stripOuterQuote(d.voice) !== stripOuterQuote(root.querySelector('.ykr-voice')?.textContent || '')) {
      typeVoice(d.voice);
    }
  }

  function cleanBlock(text) {
    return String(text || '')
      .replace(/\r/g, '')
      .replace(/\{\/\/.*?\}/g, '')
      .trim();
  }

  function getLatestStatusBlock(text) {
    const list = [...String(text || '').matchAll(/<status\b[^>]*>([\s\S]*?)<\/status>/gi)];
    return list.length ? (list[list.length - 1][1] || '') : '';
  }

  function splitSections(block) {
    const keys = ['地点', '时间', '名字', '心情值', '穿着', '当前动作', '当前主线', '角色待办', '台词'];
    const sections = {};
    keys.forEach(k => sections[k] = []);
    let current = null;

    cleanBlock(block).split('\n').map(x => x.trim()).filter(Boolean).forEach(line => {
      const m = line.match(/^(地点|时间|名字|心情值|穿着|当前动作|当前主线|角色待办|台词)\s*[:：]\s*(.*)$/);
      if (m) {
        current = m[1];
        if (m[2]) sections[current].push(m[2].trim());
      } else if (current) {
        sections[current].push(line);
      }
    });

    return sections;
  }

  function parseTodos(raw) {
    const items = String(raw || '')
      .split('\n')
      .map(x => x.trim())
      .filter(Boolean)
      .map(x => x.replace(/^\d+\s*[.．、]\s*/, '').replace(/^[-•◇◆]\s*/, '').trim())
      .filter(Boolean);
    return items.length ? items : fallback.todos;
  }

  function parseMain(raw) {
    const text = String(raw || '').trim();
    if (!text) return { title: fallback.mainTitle, summary: fallback.mainSummary };
    if (text.includes('|')) {
      const [title, ...rest] = text.split('|');
      return { title: title.trim(), summary: rest.join('|').trim() };
    }
    const lines = text.split('\n').map(x => x.trim()).filter(Boolean);
    return { title: lines[0] || fallback.mainTitle, summary: lines.slice(1).join('\n') || '' };
  }

  function parseVoice(raw, mood) {
    const lines = String(raw || '').split('\n').map(x => x.trim()).filter(Boolean);
    if (!lines.length) return fallback.voice;

    const entries = [];
    lines.forEach(line => {
      const m = line.match(/^([^：:]{1,12})\s*[:：]\s*(.+)$/);
      if (m) entries.push({ tag: m[1].trim(), text: m[2].trim() });
      else if (entries.length) entries[entries.length - 1].text += '\n' + line;
      else entries.push({ tag: '', text: line });
    });

    const moodTag = Number(mood) >= 65 ? '高兴' : Number(mood) < 35 ? '低落' : '平静';
    const matched = entries.filter(e => e.tag && (e.tag.includes(moodTag) || moodTag.includes(e.tag)));
    return (matched[0] || entries[0])?.text || fallback.voice;
  }

  function parseStatus(block) {
    const s = splitSections(block);
    const mood = Math.max(0, Math.min(100, Number((s['心情值'][0] || '76').replace(/[^\d.-]/g, '')) || 76));
    const main = parseMain(s['当前主线'].join('\n'));

    return {
      place: s['地点'][0] || fallback.place,
      time: s['时间'][0] || fallback.time,
      name: s['名字'][0] || fallback.name,
      mood,
      outfit: s['穿着'].join('\n').trim() || fallback.outfit,
      action: s['当前动作'].join('\n').trim() || fallback.action,
      mainTitle: main.title,
      mainSummary: main.summary,
      todos: parseTodos(s['角色待办'].join('\n')),
      voice: parseVoice(s['台词'].join('\n'), mood)
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
    return 0;
  }

  async function findStatusFromHelper() {
    if (typeof getChatMessages !== 'function') return null;
    try {
      const lastId = await getLastMessageIdSafe();
      const messages = await Promise.resolve(getChatMessages(`0-${lastId}`, { role: 'assistant', hide_state: 'unhidden', include_swipes: false }));
      if (!Array.isArray(messages)) return null;
      for (let i = messages.length - 1; i >= 0; i--) {
        const block = getLatestStatusBlock(messages[i]?.message || '');
        if (block) return block;
      }
    } catch (e) {
      console.warn('YUKARI VN STATUS: getChatMessages failed', e);
    }
    return null;
  }

  function findStatusFromContext() {
    try {
      const ctx = win.SillyTavern?.getContext?.();
      const chat = ctx?.chat;
      if (!Array.isArray(chat)) return null;
      for (let i = chat.length - 1; i >= 0; i--) {
        if (chat[i]?.is_user) continue;
        const block = getLatestStatusBlock(chat[i]?.mes || chat[i]?.message || '');
        if (block) return block;
      }
    } catch (e) {}
    return null;
  }

  function findStatusFromDom() {
    try {
      const nodes = [...doc.querySelectorAll('#chat .mes')].reverse();
      for (const node of nodes) {
        const block = getLatestStatusBlock(node.textContent || '');
        if (block) return block;
      }
    } catch (e) {}
    return null;
  }

  function hideStatusInChat() {
    try {
      doc.querySelectorAll('#chat .mes_text').forEach(node => {
        node.querySelectorAll?.('status').forEach(el => {
          el.classList.add('ykr-status-hidden');
          el.style.display = 'none';
        });
        const html = node.innerHTML || '';
        if (!/(&lt;status|<status)/i.test(html)) return;
        const replaced = html
          .replace(/<status\b[^>]*>[\s\S]*?<\/status>/gi, '<span class="ykr-status-hidden"></span>')
          .replace(/&lt;status\b[\s\S]*?&gt;[\s\S]*?&lt;\/status&gt;/gi, '<span class="ykr-status-hidden"></span>');
        if (replaced !== html) node.innerHTML = replaced;
      });
    } catch (e) {}
  }

  async function updateFromLatestStatus() {
    const block = await findStatusFromHelper() || findStatusFromContext() || findStatusFromDom();
    if (block) {
      const hash = cleanBlock(block);
      if (hash !== state.lastHash) {
        state.lastHash = hash;
        render(parseStatus(block), true);
      }
    }
    hideStatusInChat();
  }

  function scheduleUpdate(delay = 520) {
    clearTimeout(state.updateTimer);
    state.updateTimer = setTimeout(updateFromLatestStatus, delay);
  }

  function bindListeners() {
    try {
      if (typeof eventOn === 'function' && typeof tavern_events !== 'undefined') {
        ['MESSAGE_RECEIVED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'CHAT_CHANGED', 'GENERATION_ENDED'].forEach(name => {
          if (tavern_events[name]) eventOn(tavern_events[name], () => scheduleUpdate(450));
        });
      }
    } catch (e) {}

    const chat = doc.querySelector('#chat');
    if (chat) {
      state.observer = new win.MutationObserver(() => scheduleUpdate(700));
      state.observer.observe(chat, { childList: true, subtree: true, characterData: true });
    }
  }

  function initDragAndClick(root) {
    const icon = root.querySelector('.ykr-icon');
    const detailBtn = root.querySelector('.ykr-toggle-detail');

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
      try { win.localStorage.setItem(STORAGE_KEY, JSON.stringify({ left: rect.left, top: rect.top })); } catch (e) {}
    }

    function ensurePanelInView() {
      const panel = root.querySelector('.ykr-panel');
      if (!panel) return;
      const r = root.getBoundingClientRect();
      const w = panel.offsetWidth || 560;
      const needRight = r.left + 98 + w + 8;
      if (needRight > win.innerWidth) {
        root.style.left = Math.max(4, win.innerWidth - w - 112) + 'px';
        savePosition();
      }
    }

    function togglePanel() {
      const willOpen = !root.classList.contains('panel-open');
      if (willOpen) ensurePanelInView();
      root.classList.toggle('panel-open');
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

    detailBtn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      root.classList.toggle('detail-open');
    });
  }

  function init() {
    if (!doc.body || !doc.head) {
      setTimeout(init, 100);
      return;
    }

    cleanup();
    addStyle();
    const root = makeRoot();
    initDragAndClick(root);
    render(fallback, true);
    bindListeners();
    scheduleUpdate(300);
    console.log('YUKARI VN STATUS: mounted');
  }

  window.addEventListener('unload', cleanup);
  window.addEventListener('pagehide', cleanup);

  window.__YUKARI_VN_STATUS__ = {
    cleanup,
    update: updateFromLatestStatus,
    show: () => doc.getElementById(ROOT_ID)?.classList.add('panel-open'),
    hide: () => doc.getElementById(ROOT_ID)?.classList.remove('panel-open')
  };

  init();
})();
