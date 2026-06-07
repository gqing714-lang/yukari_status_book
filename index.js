/*
 * 虚见相 · 結縁帳状态册 v7.0
 * 重写显示骨架：root 只当挂载点，真正悬浮的是内部 fixed container。
 * 按钮/API 走酒馆助手当前脚本环境；UI / CSS / #chat 走 parent document。
 */
(() => {
  'use strict';

  const VERSION = 'v7.0';
  const ROOT_ID = 'ykr-status-book-root';
  const STYLE_ID = 'ykr-status-book-style';
  const CONTAINER_CLASS = 'ykr-root-container';

  const CONFIG = {
    buttonName: '結縁帳',
    icon: 'https://files.catbox.moe/bv172s.png',
    storageVisible: 'ykr_status_book_visible_v7',
    storageExpanded: 'ykr_status_book_expanded_v7',
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

  function getTargetEnv() {
    let win = window;
    let doc = document;
    let isParent = false;

    try {
      if (window.parent && window.parent !== window && window.parent.document) {
        const pdoc = window.parent.document;
        if (pdoc.body || pdoc.documentElement) {
          win = window.parent;
          doc = pdoc;
          isParent = true;
        }
      }
    } catch (error) {
      console.warn('[結縁帳] 无法访问 parent document，回退当前 document：', error);
    }

    return { win, doc, isParent };
  }

  const TARGET = getTargetEnv();
  const win = TARGET.win;
  const doc = TARGET.doc;

  function getAllReachableDocs() {
    const docs = [document];
    try {
      if (window.parent && window.parent.document && !docs.includes(window.parent.document)) {
        docs.push(window.parent.document);
      }
    } catch (_) {}
    if (!docs.includes(doc)) docs.push(doc);
    return docs;
  }

  function cleanupOldNodes() {
    for (const d of getAllReachableDocs()) {
      try {
        d.getElementById(ROOT_ID)?.remove();
        d.getElementById(STYLE_ID)?.remove();
      } catch (_) {}
    }
  }

  try {
    if (window.__YUKARI_STATUS_BOOK__?.destroy) {
      window.__YUKARI_STATUS_BOOK__.destroy();
    }
  } catch (_) {}

  try {
    if (win.__YUKARI_STATUS_BOOK__?.destroy && win.__YUKARI_STATUS_BOOK__ !== window.__YUKARI_STATUS_BOOK__) {
      win.__YUKARI_STATUS_BOOK__.destroy();
    }
  } catch (_) {}

  cleanupOldNodes();

  const state = {
    visible: localStorage.getItem(CONFIG.storageVisible) !== '0',
    expanded: localStorage.getItem(CONFIG.storageExpanded) === '1',
    data: { ...CONFIG.fallback },
    quoteCycle: 0,
    updateTimer: null,
    observer: null,
    registeredButton: false,
    eventStops: [],
  };

  function clamp(num, min, max) {
    return Math.max(min, Math.min(max, num));
  }

  function safeText(value) {
    return String(value ?? '').trim();
  }

  function removeInlineComment(text) {
    return String(text ?? '').replace(/\{\/\/.*?\}/g, '').trim();
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

  function getLatestStatusBlock(text) {
    const raw = String(text ?? '');
    const list = [...raw.matchAll(/<status\b[^>]*>([\s\S]*?)<\/status>/gi)];
    if (!list.length) return '';
    return list[list.length - 1][1] || '';
  }

  function splitStatusSections(block) {
    const keys = ['地点', '时间', '名字', '心情值', '穿着', '当前动作', '当前主线', '角色待办', '台词'];
    const sections = Object.fromEntries(keys.map(key => [key, []]));
    let current = null;

    const lines = cleanBlock(block)
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      const match = line.match(/^(地点|时间|名字|心情值|穿着|当前动作|当前主线|角色待办|台词)\s*[:：]\s*(.*)$/);

      if (match) {
        current = match[1];
        const value = removeInlineComment(match[2]);
        if (value) sections[current].push(value);
        continue;
      }

      if (current) {
        const value = removeInlineComment(line);
        if (value) sections[current].push(value);
      }
    }

    return sections;
  }

  function parseTodos(raw) {
    const items = String(raw ?? '')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => line.replace(/^\d+\s*[.．、]\s*/, '').replace(/^[-•◇◆]\s*/, '').trim())
      .filter(Boolean);

    return items.length ? items : ['暂无待办。'];
  }

  function parseMain(raw) {
    const text = safeText(raw);

    if (!text) {
      return { title: '未启封', summary: '尚未读取到当前主线。' };
    }

    if (text.includes('|')) {
      const [title, ...rest] = text.split('|');
      return {
        title: safeText(title) || '未命名主线',
        summary: safeText(rest.join('|')) || '暂无梗概。',
      };
    }

    const lines = text.split('\n').map(v => v.trim()).filter(Boolean);
    return {
      title: lines[0] || '未命名主线',
      summary: lines.slice(1).join('\n') || '暂无梗概。',
    };
  }

  function parseQuotes(raw, moodValue, messageId) {
    const lines = String(raw ?? '')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    const items = [];

    for (const line of lines) {
      const match = line.match(/^([^：:]{1,12})\s*[:：]\s*(.+)$/);

      if (match) {
        items.push({ mood: safeText(match[1]), text: safeText(match[2]) });
      } else if (items.length) {
        items[items.length - 1].text += '\n' + safeText(line);
      }
    }

    const mood = scoreToMood(moodValue);

    if (!items.length) {
      return { quote: '……', quoteMood: mood, quoteItems: [{ mood, text: '……' }] };
    }

    const matched = items.filter(item => item.mood.includes(mood) || mood.includes(item.mood));
    const pool = matched.length ? matched : items;
    const index = Math.abs(Number(messageId) || 0) % pool.length;
    const picked = pool[index];

    return {
      quote: picked.text,
      quoteMood: picked.mood || mood,
      quoteItems: items,
    };
  }

  function parseStatus(block, messageId = 0) {
    const sections = splitStatusSections(block);
    const moodValue = clamp(Number((sections['心情值'][0] ?? '50').replace(/[^\d.-]/g, '')) || 50, 0, 100);
    const main = parseMain(sections['当前主线'].join('\n'));
    const quotes = parseQuotes(sections['台词'].join('\n'), moodValue, messageId);

    return {
      place: sections['地点'][0] || CONFIG.fallback.place,
      time: sections['时间'][0] || CONFIG.fallback.time,
      name: sections['名字'][0] || CONFIG.fallback.name,
      moodValue,
      moodLabel: quotes.quoteMood || scoreToMood(moodValue),
      outfit: sections['穿着'].join('\n').trim() || '未记录',
      action: sections['当前动作'].join('\n').trim() || CONFIG.fallback.action,
      mainTitle: main.title,
      mainSummary: main.summary,
      todos: parseTodos(sections['角色待办'].join('\n')),
      quote: quotes.quote,
      quoteMood: quotes.quoteMood,
      quoteItems: quotes.quoteItems,
    };
  }

  function addStyle() {
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      status,
      .ykr-status-hidden {
        display: none !important;
      }

      #${ROOT_ID} {
        position: static !important;
        display: block !important;
        opacity: 1 !important;
        pointer-events: none !important;
      }

      #${ROOT_ID} * {
        box-sizing: border-box;
      }

      #${ROOT_ID} .${CONTAINER_CLASS} {
        --ykr-ink: #30241f;
        --ykr-paper: rgba(239, 224, 196, .96);
        --ykr-paper-2: rgba(206, 184, 150, .95);
        --ykr-red: #89332d;
        --ykr-gold: #b4955e;
        --ykr-shadow: rgba(0, 0, 0, .36);

        position: fixed !important;
        right: clamp(10px, 3vw, 26px) !important;
        bottom: calc(env(safe-area-inset-bottom, 0px) + 86px) !important;
        z-index: 2147483647 !important;
        width: clamp(244px, 34vw, 356px) !important;
        max-width: calc(100vw - 20px) !important;
        color: var(--ykr-ink) !important;
        font-family: "CustomFont", "NanoOldSong-A", "LXGW WenKai", "Noto Serif SC", "Source Han Serif SC", serif !important;
        pointer-events: auto !important;
        opacity: 1 !important;
        transform: translateY(0) scale(1) !important;
        transition: opacity .22s ease, transform .22s ease !important;
      }

      #${ROOT_ID} .${CONTAINER_CLASS}.ykr-hidden {
        opacity: 0 !important;
        transform: translateY(12px) scale(.985) !important;
        pointer-events: none !important;
      }

      #${ROOT_ID} .ykr-seal {
        position: absolute !important;
        right: 18px !important;
        top: -38px !important;
        width: 62px !important;
        height: 62px !important;
        padding: 7px !important;
        border: 1px solid rgba(93, 45, 35, .36) !important;
        border-radius: 999px !important;
        background:
          radial-gradient(circle at 33% 24%, rgba(255, 241, 217, .98), rgba(216, 181, 133, .94) 45%, rgba(101, 43, 36, .98) 100%) !important;
        box-shadow:
          0 10px 22px rgba(0, 0, 0, .34),
          inset 0 2px 0 rgba(255, 255, 255, .32),
          inset 0 -5px 10px rgba(63, 20, 15, .33) !important;
        cursor: pointer !important;
        z-index: 3 !important;
        transform-origin: 50% 10% !important;
        animation: ykrSealFloat 3.8s ease-in-out infinite !important;
      }

      #${ROOT_ID} .ykr-seal::before {
        content: "";
        position: absolute;
        left: 50%;
        top: 58px;
        width: 1px;
        height: 20px;
        background: linear-gradient(to bottom, rgba(92, 44, 35, .6), transparent);
      }

      #${ROOT_ID} .ykr-seal img {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: contain;
        filter: drop-shadow(0 2px 2px rgba(50, 16, 12, .38));
      }

      #${ROOT_ID} .${CONTAINER_CLASS}[data-mood="高兴"] .ykr-seal {
        background:
          radial-gradient(circle at 33% 24%, rgba(255, 245, 223, .98), rgba(226, 184, 121, .96) 45%, rgba(151, 58, 45, .98) 100%) !important;
      }

      #${ROOT_ID} .${CONTAINER_CLASS}[data-mood="低落"] .ykr-seal,
      #${ROOT_ID} .${CONTAINER_CLASS}[data-mood="危险"] .ykr-seal,
      #${ROOT_ID} .${CONTAINER_CLASS}[data-mood="愤怒"] .ykr-seal {
        background:
          radial-gradient(circle at 33% 24%, rgba(231, 219, 205, .96), rgba(153, 131, 118, .94) 45%, rgba(52, 36, 39, .98) 100%) !important;
      }

      #${ROOT_ID} .ykr-book {
        position: relative !important;
        border-radius: 19px 19px 15px 15px !important;
        overflow: hidden !important;
        background:
          linear-gradient(135deg, rgba(255,255,255,.28), transparent 30%),
          radial-gradient(circle at 22% 8%, rgba(255, 242, 210, .7), transparent 34%),
          linear-gradient(180deg, var(--ykr-paper), var(--ykr-paper-2)) !important;
        border: 1px solid rgba(96, 58, 42, .32) !important;
        box-shadow:
          0 18px 40px var(--ykr-shadow),
          inset 0 2px 0 rgba(255, 255, 255, .26),
          inset 0 -16px 24px rgba(75, 43, 30, .10) !important;
        backdrop-filter: blur(9px) !important;
      }

      #${ROOT_ID} .ykr-book::before {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        opacity: .54;
        background-image:
          radial-gradient(circle at 10% 20%, rgba(88, 60, 42, .09) 0 1px, transparent 1.5px),
          radial-gradient(circle at 80% 35%, rgba(88, 60, 42, .07) 0 1px, transparent 1.4px),
          linear-gradient(90deg, rgba(255,255,255,.12), transparent 22%, rgba(77,45,35,.07) 90%);
        background-size: 18px 22px, 23px 19px, 100% 100%;
        mix-blend-mode: multiply;
      }

      #${ROOT_ID} .ykr-book::after {
        content: "";
        position: absolute;
        inset: 8px;
        border: 1px solid rgba(112, 70, 52, .18);
        border-radius: 13px;
        pointer-events: none;
      }

      #${ROOT_ID} .ykr-inner {
        position: relative;
        z-index: 2;
        padding: 18px 18px 16px;
      }

      #${ROOT_ID} .ykr-close {
        position: absolute;
        right: 12px;
        top: 12px;
        width: 24px;
        height: 24px;
        border: 1px solid rgba(99, 58, 43, .18);
        border-radius: 50%;
        background: rgba(255,255,255,.18);
        color: rgba(64, 43, 35, .64);
        line-height: 20px;
        cursor: pointer;
      }

      #${ROOT_ID} .ykr-title-area {
        padding-right: 66px;
        text-align: left;
      }

      #${ROOT_ID} .ykr-title {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        font-size: 15px;
        font-weight: 700;
        letter-spacing: .24em;
        color: #51342b;
        line-height: 1;
      }

      #${ROOT_ID} .ykr-title::before,
      #${ROOT_ID} .ykr-title::after {
        content: "";
        width: 15px;
        height: 1px;
        background: linear-gradient(to right, transparent, rgba(105, 62, 44, .46), transparent);
      }

      #${ROOT_ID} .ykr-subtitle {
        margin-top: 5px;
        color: rgba(82, 56, 46, .58);
        font-size: 9px;
        letter-spacing: .32em;
        text-transform: uppercase;
      }

      #${ROOT_ID} .ykr-meta {
        margin-top: 12px;
        text-align: center;
        cursor: pointer;
      }

      #${ROOT_ID} .ykr-place-time {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        max-width: 100%;
        padding: 5px 12px;
        border-radius: 999px;
        background: rgba(67, 38, 31, .08);
        color: rgba(49, 34, 30, .84);
        font-size: 12px;
        letter-spacing: .08em;
      }

      #${ROOT_ID} .ykr-place,
      #${ROOT_ID} .ykr-time {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      #${ROOT_ID} .ykr-dot {
        color: rgba(137, 51, 45, .55);
        font-style: normal;
      }

      #${ROOT_ID} .ykr-name {
        margin-top: 10px;
        color: #2f2521;
        font-size: 21px;
        font-weight: 700;
        letter-spacing: .16em;
        text-shadow: 0 1px 0 rgba(255,255,255,.34);
      }

      #${ROOT_ID} .ykr-mood {
        width: min(210px, 86%);
        margin: 13px auto 0;
      }

      #${ROOT_ID} .ykr-mood-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        color: rgba(65, 43, 36, .74);
        font-size: 11px;
        letter-spacing: .13em;
      }

      #${ROOT_ID} .ykr-mood-value {
        font-weight: 700;
        color: rgba(111, 43, 37, .88);
      }

      #${ROOT_ID} .ykr-mood-bar {
        position: relative;
        height: 7px;
        margin-top: 7px;
        border-radius: 999px;
        overflow: hidden;
        background: linear-gradient(90deg, rgba(57, 42, 38, .22), rgba(255,255,255,.18));
        box-shadow: inset 0 1px 3px rgba(43, 28, 23, .28), 0 1px 0 rgba(255,255,255,.28);
      }

      #${ROOT_ID} .ykr-mood-fill {
        position: absolute;
        inset: 0 auto 0 0;
        width: 50%;
        border-radius: 999px;
        background: linear-gradient(90deg, rgba(116, 45, 39, .88), rgba(184, 149, 94, .88));
        box-shadow: 0 0 10px rgba(135, 54, 45, .22), inset 0 1px 0 rgba(255,255,255,.28);
        transition: width .48s ease;
      }

      #${ROOT_ID} .ykr-quote {
        position: relative;
        margin: 15px 2px 0;
        padding: 14px 15px 15px;
        border-radius: 12px;
        background:
          radial-gradient(circle at 0 0, rgba(137, 51, 45, .24), transparent 34%),
          linear-gradient(180deg, rgba(43, 35, 32, .94), rgba(32, 26, 24, .96));
        color: #f1dfc2;
        box-shadow: 0 8px 18px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.08);
        cursor: pointer;
      }

      #${ROOT_ID} .ykr-quote::before {
        content: "心ノ聲";
        position: absolute;
        right: 12px;
        top: -8px;
        padding: 2px 7px;
        border-radius: 999px;
        background: rgba(137, 51, 45, .96);
        color: #f6e8ce;
        font-size: 10px;
        letter-spacing: .16em;
      }

      #${ROOT_ID} .ykr-quote-text {
        display: inline;
        min-height: 2.8em;
        font-size: 13px;
        line-height: 1.75;
        letter-spacing: .04em;
        white-space: pre-wrap;
      }

      #${ROOT_ID} .ykr-cursor {
        display: inline-block;
        margin-left: 5px;
        color: #d8b377;
        animation: ykrCursor 1.05s ease-in-out infinite;
      }

      #${ROOT_ID} .ykr-hint {
        margin-top: 9px;
        text-align: center;
        color: rgba(77, 48, 39, .46);
        font-size: 10px;
        letter-spacing: .16em;
      }

      #${ROOT_ID} .ykr-detail {
        display: none;
        margin-top: 13px;
        padding-top: 11px;
        border-top: 1px solid rgba(94, 58, 43, .18);
      }

      #${ROOT_ID} .${CONTAINER_CLASS}.ykr-expanded .ykr-detail {
        display: block;
        animation: ykrInkIn .24s ease both;
      }

      #${ROOT_ID} .${CONTAINER_CLASS}.ykr-expanded .ykr-hint {
        display: none;
      }

      #${ROOT_ID} .ykr-fold {
        margin-top: 8px;
        border-radius: 12px;
        border: 1px solid rgba(95, 57, 43, .16);
        background: rgba(255,255,255,.16);
        overflow: hidden;
      }

      #${ROOT_ID} .ykr-fold summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 9px 11px;
        cursor: pointer;
        list-style: none;
        color: rgba(52, 36, 31, .84);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: .10em;
        user-select: none;
      }

      #${ROOT_ID} .ykr-fold summary::-webkit-details-marker {
        display: none;
      }

      #${ROOT_ID} .ykr-fold summary::after {
        content: "◆";
        color: rgba(137, 51, 45, .62);
        font-size: 10px;
        transform: rotate(0deg);
        transition: transform .2s ease;
      }

      #${ROOT_ID} .ykr-fold[open] summary::after {
        transform: rotate(45deg);
      }

      #${ROOT_ID} .ykr-fold-body {
        padding: 0 11px 11px;
        color: rgba(43, 31, 28, .78);
        font-size: 12px;
        line-height: 1.72;
        letter-spacing: .03em;
        white-space: pre-wrap;
      }

      #${ROOT_ID} .ykr-main-title {
        display: inline-block;
        margin-bottom: 6px;
        padding: 2px 8px;
        border-radius: 999px;
        background: rgba(137, 51, 45, .10);
        color: rgba(98, 38, 33, .94);
        font-weight: 700;
      }

      #${ROOT_ID} .ykr-todo-list {
        display: grid;
        gap: 6px;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      #${ROOT_ID} .ykr-todo-list li {
        position: relative;
        padding: 7px 9px 7px 30px;
        border-radius: 10px;
        background: rgba(48, 35, 31, .07);
        color: rgba(42, 31, 28, .78);
      }

      #${ROOT_ID} .ykr-todo-list li::before {
        content: "壱";
        position: absolute;
        left: 9px;
        top: 7px;
        color: rgba(137, 51, 45, .72);
        font-size: 11px;
        font-weight: 700;
      }

      #${ROOT_ID} .ykr-todo-list li:nth-child(2)::before { content: "弐"; }
      #${ROOT_ID} .ykr-todo-list li:nth-child(3)::before { content: "参"; }
      #${ROOT_ID} .ykr-todo-list li:nth-child(4)::before { content: "肆"; }
      #${ROOT_ID} .ykr-todo-list li:nth-child(5)::before { content: "伍"; }
      #${ROOT_ID} .ykr-todo-list li:nth-child(n+6)::before { content: "◇"; }

      #${ROOT_ID} .ykr-quote.ykr-flash .ykr-quote-text {
        animation: ykrInkIn .22s ease both;
      }

      @keyframes ykrSealFloat {
        0%, 100% { transform: translateY(0) rotate(-1deg); }
        50% { transform: translateY(-3px) rotate(1.4deg); }
      }

      @keyframes ykrCursor {
        0%, 100% { transform: translateY(0); opacity: .55; }
        50% { transform: translateY(3px); opacity: 1; }
      }

      @keyframes ykrInkIn {
        from { opacity: 0; filter: blur(3px); transform: translateY(-4px); }
        to { opacity: 1; filter: blur(0); transform: translateY(0); }
      }

      @media (max-width: 520px) {
        #${ROOT_ID} .${CONTAINER_CLASS} {
          right: 8px !important;
          bottom: calc(env(safe-area-inset-bottom, 0px) + 76px) !important;
          width: min(330px, calc(100vw - 16px)) !important;
        }

        #${ROOT_ID} .ykr-inner {
          padding: 17px 15px 14px;
        }

        #${ROOT_ID} .ykr-seal {
          right: 14px !important;
          width: 56px !important;
          height: 56px !important;
        }

        #${ROOT_ID} .ykr-name {
          font-size: 19px;
        }

        #${ROOT_ID} .ykr-quote-text {
          font-size: 12px;
        }
      }
    `;
    doc.head.appendChild(style);
  }

  function makeUI() {
    let root = doc.getElementById(ROOT_ID);
    if (root) return root;

    root = doc.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = `
      <div class="${CONTAINER_CLASS}">
        <button class="ykr-seal" type="button" title="翻开/收起">
          <img class="ykr-avatar" src="${CONFIG.icon}" alt="">
        </button>

        <section class="ykr-book">
          <div class="ykr-inner">
            <button class="ykr-close" type="button" title="隐藏">×</button>

            <div class="ykr-title-area">
              <div class="ykr-title">結縁帳</div>
              <div class="ykr-subtitle">Yukari no Ki</div>
            </div>

            <div class="ykr-meta">
              <div class="ykr-place-time">
                <span class="ykr-place"></span>
                <em class="ykr-dot">·</em>
                <span class="ykr-time"></span>
              </div>
              <div class="ykr-name"></div>
            </div>

            <div class="ykr-mood">
              <div class="ykr-mood-row">
                <span class="ykr-mood-label"></span>
                <span class="ykr-mood-value"></span>
              </div>
              <div class="ykr-mood-bar"><i class="ykr-mood-fill"></i></div>
            </div>

            <div class="ykr-quote" title="点一下切换同心情台词 / 展开札记">
              <span class="ykr-quote-text"></span><span class="ykr-cursor">◆</span>
            </div>

            <div class="ykr-hint">点触翻开札记</div>

            <div class="ykr-detail">
              <details class="ykr-fold">
                <summary>装束</summary>
                <div class="ykr-fold-body ykr-outfit"></div>
              </details>

              <details class="ykr-fold" open>
                <summary>所作</summary>
                <div class="ykr-fold-body ykr-action"></div>
              </details>

              <details class="ykr-fold">
                <summary>縁の記録</summary>
                <div class="ykr-fold-body">
                  <span class="ykr-main-title"></span>
                  <div class="ykr-main-summary"></div>
                </div>
              </details>

              <details class="ykr-fold">
                <summary>約束事</summary>
                <div class="ykr-fold-body"><ul class="ykr-todo-list"></ul></div>
              </details>
            </div>
          </div>
        </section>
      </div>
    `;

    doc.body.appendChild(root);

    const container = getContainer(root);
    root.querySelector('.ykr-seal')?.addEventListener('click', event => {
      event.stopPropagation();
      toggleExpanded();
    });

    root.querySelector('.ykr-close')?.addEventListener('click', event => {
      event.stopPropagation();
      setVisible(false);
    });

    root.querySelector('.ykr-meta')?.addEventListener('click', () => setExpanded(true));

    root.querySelector('.ykr-quote')?.addEventListener('click', () => {
      if (!state.expanded) setExpanded(true);
      else cycleQuote();
    });

    if (container) {
      container.dataset.version = VERSION;
    }

    return root;
  }

  function getRoot() {
    return doc.getElementById(ROOT_ID);
  }

  function getContainer(root = getRoot()) {
    return root?.querySelector(`.${CONTAINER_CLASS}`) || null;
  }

  function setText(selector, text) {
    const el = doc.querySelector(selector);
    if (el) el.textContent = text ?? '';
  }

  function setVisible(value) {
    state.visible = Boolean(value);
    localStorage.setItem(CONFIG.storageVisible, state.visible ? '1' : '0');
    render();
  }

  function toggleVisible() {
    setVisible(!state.visible);
  }

  function setExpanded(value) {
    state.expanded = Boolean(value);
    localStorage.setItem(CONFIG.storageExpanded, state.expanded ? '1' : '0');
    render();
  }

  function toggleExpanded() {
    setExpanded(!state.expanded);
  }

  function getQuotePool() {
    const items = state.data.quoteItems || [];
    const mood = state.data.quoteMood || state.data.moodLabel || scoreToMood(state.data.moodValue);
    const matched = items.filter(item => item.mood.includes(mood) || mood.includes(item.mood));
    return matched.length ? matched : items;
  }

  function cycleQuote() {
    const pool = getQuotePool();
    if (!pool.length) return;

    state.quoteCycle = (state.quoteCycle + 1) % pool.length;
    const picked = pool[state.quoteCycle];
    state.data.quote = picked.text;
    state.data.quoteMood = picked.mood || state.data.quoteMood;

    const quote = doc.querySelector(`#${ROOT_ID} .ykr-quote`);
    quote?.classList.remove('ykr-flash');
    void quote?.offsetWidth;
    quote?.classList.add('ykr-flash');
    render();
  }

  function render(nextData) {
    if (nextData) {
      state.data = { ...CONFIG.fallback, ...nextData };
    }

    const root = makeUI();
    const container = getContainer(root);
    const data = state.data;
    const mood = data.quoteMood || data.moodLabel || scoreToMood(data.moodValue);
    const moodValue = clamp(Number(data.moodValue) || 0, 0, 100);
    const avatar = CONFIG.avatarByMood[mood] || CONFIG.avatarByMood.default || CONFIG.icon;

    if (container) {
      container.classList.toggle('ykr-hidden', !state.visible);
      container.classList.toggle('ykr-expanded', state.expanded);
      container.dataset.mood = mood;
    }

    const avatarEl = root.querySelector('.ykr-avatar');
    if (avatarEl && avatarEl.getAttribute('src') !== avatar) avatarEl.setAttribute('src', avatar);

    setText(`#${ROOT_ID} .ykr-place`, data.place);
    setText(`#${ROOT_ID} .ykr-time`, data.time);
    setText(`#${ROOT_ID} .ykr-name`, data.name);
    setText(`#${ROOT_ID} .ykr-mood-label`, mood);
    setText(`#${ROOT_ID} .ykr-mood-value`, `${moodValue}`);
    setText(`#${ROOT_ID} .ykr-quote-text`, `「${data.quote || '……'}」`);
    setText(`#${ROOT_ID} .ykr-outfit`, data.outfit);
    setText(`#${ROOT_ID} .ykr-action`, data.action);
    setText(`#${ROOT_ID} .ykr-main-title`, data.mainTitle);
    setText(`#${ROOT_ID} .ykr-main-summary`, data.mainSummary);

    const fill = root.querySelector('.ykr-mood-fill');
    if (fill) fill.style.width = `${moodValue}%`;

    const todoList = root.querySelector('.ykr-todo-list');
    if (todoList) {
      todoList.innerHTML = '';
      const todos = Array.isArray(data.todos) && data.todos.length ? data.todos : CONFIG.fallback.todos;
      for (const todo of todos) {
        const li = doc.createElement('li');
        li.textContent = todo;
        todoList.appendChild(li);
      }
    }
  }

  function registerScriptButton() {
    if (state.registeredButton) return;
    state.registeredButton = true;

    try {
      if (typeof appendInexistentScriptButtons === 'function') {
        appendInexistentScriptButtons([{ name: CONFIG.buttonName, visible: true }]);
      }

      if (typeof eventOn === 'function' && typeof getButtonEvent === 'function') {
        const stop = eventOn(getButtonEvent(CONFIG.buttonName), () => toggleVisible());
        if (stop?.stop) state.eventStops.push(stop);
      }
    } catch (error) {
      console.warn('[結縁帳] 脚本按钮注册失败：', error);
    }
  }

  async function getLastMessageIdSafe() {
    try {
      if (typeof getLastMessageId === 'function') {
        const id = Number(getLastMessageId());
        if (!Number.isNaN(id)) return id;
      }
    } catch (_) {}

    try {
      if (typeof triggerSlash === 'function') {
        const id = Number(await triggerSlash('/pass {{lastMessageId}}'));
        if (!Number.isNaN(id)) return id;
      }
    } catch (_) {}

    try {
      const ctx = win.SillyTavern?.getContext?.();
      const chat = ctx?.chat;
      if (Array.isArray(chat)) return chat.length - 1;
    } catch (_) {}

    return 0;
  }

  async function getLatestAssistantMessageFromHelper() {
    if (typeof getChatMessages !== 'function') return null;

    try {
      const lastId = await getLastMessageIdSafe();
      const messages = await Promise.resolve(
        getChatMessages(`0-${lastId}`, {
          role: 'assistant',
          hide_state: 'unhidden',
          include_swipes: false,
        }),
      );

      if (!Array.isArray(messages) || !messages.length) return null;

      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        const block = getLatestStatusBlock(msg?.message);
        if (block) {
          return { messageId: msg.message_id ?? i, message: msg.message, block };
        }
      }
    } catch (error) {
      console.warn('[結縁帳] getChatMessages 读取失败：', error);
    }

    return null;
  }

  function getLatestAssistantMessageFromContext() {
    try {
      const ctx = win.SillyTavern?.getContext?.();
      const chat = ctx?.chat;
      if (!Array.isArray(chat) || !chat.length) return null;

      for (let i = chat.length - 1; i >= 0; i--) {
        const msg = chat[i];
        if (msg?.is_user) continue;
        const text = msg?.mes ?? msg?.message ?? '';
        const block = getLatestStatusBlock(text);
        if (block) return { messageId: i, message: text, block };
      }
    } catch (error) {
      console.warn('[結縁帳] SillyTavern context 读取失败：', error);
    }
    return null;
  }

  function getLatestStatusFromDom() {
    const nodes = [...doc.querySelectorAll('#chat .mes_text')].reverse();
    for (let i = 0; i < nodes.length; i++) {
      const text = nodes[i].textContent || '';
      const block = getLatestStatusBlock(text);
      if (block) return { messageId: nodes.length - i, message: text, block };
    }
    return null;
  }

  async function findLatestStatus() {
    return (await getLatestAssistantMessageFromHelper()) || getLatestAssistantMessageFromContext() || getLatestStatusFromDom();
  }

  async function updateFromLatestStatus() {
    try {
      const found = await findLatestStatus();
      if (found?.block) {
        const data = parseStatus(found.block, found.messageId);
        state.quoteCycle = 0;
        render(data);
      } else {
        render();
      }
      hideStatusBlocksInChat();
    } catch (error) {
      console.warn('[結縁帳] 更新失败：', error);
      render();
    }
  }

  function scheduleUpdate(delay = 420) {
    clearTimeout(state.updateTimer);
    state.updateTimer = setTimeout(updateFromLatestStatus, delay);
  }

  function bindEvents() {
    try {
      if (typeof eventOn === 'function' && typeof tavern_events !== 'undefined') {
        const names = ['MESSAGE_RECEIVED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'CHAT_CHANGED', 'GENERATION_ENDED'];
        for (const name of names) {
          if (tavern_events[name]) {
            const stop = eventOn(tavern_events[name], () => scheduleUpdate(520));
            if (stop?.stop) state.eventStops.push(stop);
          }
        }
      }
    } catch (error) {
      console.warn('[結縁帳] 酒馆事件监听失败，启用 DOM 兜底：', error);
    }
    bindDomObserverFallback();
  }

  function bindDomObserverFallback() {
    const chat = doc.querySelector('#chat');
    if (!chat || state.observer) return;

    const Observer = win.MutationObserver || window.MutationObserver;
    if (!Observer) return;

    state.observer = new Observer(() => scheduleUpdate(700));
    state.observer.observe(chat, { childList: true, subtree: true, characterData: true });
  }

  function hideStatusBlocksInChat() {
    if (!CONFIG.hideStatusBlockInChat) return;
    const nodes = doc.querySelectorAll('#chat .mes_text');

    for (const node of nodes) {
      try {
        node.querySelectorAll?.('status').forEach(el => {
          el.classList.add('ykr-status-hidden');
          el.style.display = 'none';
        });

        const html = node.innerHTML || '';
        if (!/(&lt;status|<status)/i.test(html)) continue;

        const replaced = html
          .replace(/<status\b[^>]*>[\s\S]*?<\/status>/gi, '<span class="ykr-status-hidden"></span>')
          .replace(/&lt;status\b[\s\S]*?&gt;[\s\S]*?&lt;\/status&gt;/gi, '<span class="ykr-status-hidden"></span>');

        if (replaced !== html) node.innerHTML = replaced;
      } catch (error) {
        console.warn('[結縁帳] 隐藏 status 失败：', error);
      }
    }
  }

  function debug() {
    const root = doc.getElementById(ROOT_ID);
    const container = root?.querySelector(`.${CONTAINER_CLASS}`);
    const rect = container?.getBoundingClientRect?.();

    const lines = [
      `結縁帳 ${VERSION}`,
      `target is parent: ${TARGET.isParent}`,
      `target has body: ${!!doc.body}`,
      `target has head: ${!!doc.head}`,
      `target has #chat: ${!!doc.querySelector('#chat')}`,
      `root exists: ${!!root}`,
      `container exists: ${!!container}`,
      `style exists: ${!!doc.getElementById(STYLE_ID)}`,
      `visible state: ${state.visible}`,
      `container hidden class: ${container?.classList?.contains('ykr-hidden')}`,
      `container rect: ${rect ? `${Math.round(rect.width)}x${Math.round(rect.height)} @ ${Math.round(rect.left)},${Math.round(rect.top)}` : 'none'}`,
      `button api append: ${typeof appendInexistentScriptButtons === 'function'}`,
      `button api eventOn: ${typeof eventOn === 'function'}`,
      `button api getButtonEvent: ${typeof getButtonEvent === 'function'}`,
      `getChatMessages: ${typeof getChatMessages === 'function'}`,
    ];

    alert(lines.join('\n'));
  }

  function show() {
    setVisible(true);
  }

  function hide() {
    setVisible(false);
  }

  function destroy() {
    clearTimeout(state.updateTimer);

    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }

    for (const item of state.eventStops) {
      try { item?.stop?.(); } catch (_) {}
    }
    state.eventStops = [];

    for (const d of getAllReachableDocs()) {
      try {
        d.getElementById(ROOT_ID)?.remove();
        d.getElementById(STYLE_ID)?.remove();
      } catch (_) {}
    }
  }

  function exposeApi() {
    const api = {
      version: VERSION,
      init,
      destroy,
      update: updateFromLatestStatus,
      toggle: toggleVisible,
      show,
      hide,
      debug,
    };

    window.__YUKARI_STATUS_BOOK__ = api;
    try { win.__YUKARI_STATUS_BOOK__ = api; } catch (_) {}
  }

  function init() {
    if (!doc.body || !doc.head) {
      setTimeout(init, 200);
      return;
    }

    addStyle();
    makeUI();
    render();
    registerScriptButton();
    bindEvents();
    scheduleUpdate(260);

    try {
      if (typeof replaceScriptInfo === 'function') {
        replaceScriptInfo(`虚见相 · 結縁帳状态册 ${VERSION}：root 挂载点 + fixed container 显示结构。`);
      }
    } catch (_) {}
  }

  exposeApi();
  init();
})();
