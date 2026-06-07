(function () {
  console.log('YUKARI HORIZONTAL PANEL: start');

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

  const ROOT_ID = 'simple-dot-root';
  const STYLE_ID = 'simple-dot-style';
  const STORAGE_KEY = 'simple-dot-position';
  const ICON_URL = 'https://files.catbox.moe/bv172s.png';

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
  }

  cleanup();

  function init() {
    if (!doc.body || !doc.head) {
      setTimeout(init, 100);
      return;
    }

    cleanup();

    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
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
        outline: none !important;
        pointer-events: auto !important;
        user-select: none !important;
        -webkit-user-select: none !important;
        touch-action: none !important;
        position: relative !important;
        z-index: 5 !important;
      }

      #${ROOT_ID} .simple-icon img {
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

      #${ROOT_ID} .status-panel {
        position: absolute !important;
        left: 100px !important;
        top: 50% !important;
        width: min(520px, calc(100vw - 132px)) !important;
        max-height: min(68vh, 520px) !important;
        overflow: auto !important;
        overscroll-behavior: contain !important;
        -webkit-overflow-scrolling: touch !important;

        pointer-events: none !important;
        opacity: 0 !important;
        transform: translateY(-50%) translateX(-14px) scaleX(0.12) !important;
        transform-origin: left center !important;
        clip-path: inset(0 100% 0 0 round 12px) !important;
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

      #${ROOT_ID}.panel-open .status-panel {
        pointer-events: auto !important;
        opacity: 1 !important;
        transform: translateY(-50%) translateX(0) scaleX(1) !important;
        clip-path: inset(0 0 0 0 round 12px) !important;
        filter: blur(0) !important;
      }

      #${ROOT_ID} .status-shell {
        position: relative !important;
        min-height: 104px !important;
        padding: 10px 12px 11px !important;
        border-radius: 12px !important;
        background:
          linear-gradient(90deg, rgba(42, 35, 31, 0.98), rgba(66, 50, 39, 0.96) 42%, rgba(219, 199, 162, 0.98) 42%, rgba(236, 221, 194, 0.98)) !important;
        border: 2px solid rgba(167, 141, 87, 0.88) !important;
        box-shadow:
          0 14px 34px rgba(0,0,0,0.36),
          inset 0 1px 0 rgba(255,255,255,0.16) !important;
        color: #2b241f !important;
      }

      #${ROOT_ID} .status-shell::before {
        content: "" !important;
        position: absolute !important;
        left: -8px !important;
        top: 50% !important;
        width: 14px !important;
        height: 14px !important;
        background: rgba(46, 38, 33, 0.98) !important;
        border-left: 2px solid rgba(167, 141, 87, 0.88) !important;
        border-bottom: 2px solid rgba(167, 141, 87, 0.88) !important;
        transform: translateY(-50%) rotate(45deg) !important;
      }

      #${ROOT_ID} .status-shell::after {
        content: "" !important;
        position: absolute !important;
        inset: 6px !important;
        border: 1px solid rgba(167, 141, 87, 0.18) !important;
        border-radius: 8px !important;
        pointer-events: none !important;
      }

      #${ROOT_ID} .status-head {
        position: relative !important;
        z-index: 1 !important;
        display: grid !important;
        grid-template-columns: 1fr auto !important;
        gap: 10px !important;
        align-items: start !important;
      }

      #${ROOT_ID} .status-main {
        min-width: 0 !important;
      }

      #${ROOT_ID} .place-time {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        min-width: 0 !important;
        color: #f1dfc2 !important;
        font-size: 13px !important;
        font-weight: 700 !important;
        letter-spacing: 0.12em !important;
        margin: 1px 0 8px !important;
        text-shadow: 0 1px 2px rgba(0,0,0,0.28) !important;
      }

      #${ROOT_ID} .place-time em {
        font-style: normal !important;
        color: #a78d57 !important;
      }

      #${ROOT_ID} .voice-card {
        width: 100% !important;
        min-height: 45px !important;
        padding: 9px 11px !important;
        background: #2b2a28 !important;
        border: 3px solid #a78d57 !important;
        border-radius: 9px !important;
        color: #f1dfc2 !important;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.08),
          0 5px 14px rgba(0,0,0,0.24) !important;
      }

      #${ROOT_ID} .voice-text {
        font-size: 12px !important;
        line-height: 1.55 !important;
        letter-spacing: 0.04em !important;
        white-space: pre-wrap !important;
      }

      #${ROOT_ID} .voice-cursor {
        display: inline-block !important;
        margin-left: 4px !important;
        color: #a78d57 !important;
        animation: yukariCursor 1.05s ease-in-out infinite !important;
      }

      #${ROOT_ID} .expand-btn {
        position: relative !important;
        z-index: 2 !important;
        min-width: 58px !important;
        height: 30px !important;
        padding: 0 9px !important;
        border-radius: 999px !important;
        border: 2px solid rgba(167, 141, 87, 0.86) !important;
        background: rgba(43, 42, 40, 0.96) !important;
        color: #e7d4ac !important;
        font-size: 11px !important;
        font-weight: 700 !important;
        letter-spacing: 0.08em !important;
        pointer-events: auto !important;
        cursor: pointer !important;
        user-select: none !important;
        -webkit-user-select: none !important;
        touch-action: manipulation !important;
      }

      #${ROOT_ID} .expand-btn .arrow {
        display: inline-block !important;
        margin-left: 3px !important;
        transform: rotate(-90deg) !important;
        transition: transform 0.22s ease !important;
      }

      #${ROOT_ID}.detail-open .expand-btn .arrow {
        transform: rotate(0deg) !important;
      }

      #${ROOT_ID} .detail-area {
        position: relative !important;
        z-index: 1 !important;
        display: grid !important;
        grid-template-rows: 0fr !important;
        transition: grid-template-rows 0.30s cubic-bezier(.2,.9,.2,1), margin-top 0.24s ease !important;
        margin-top: 0 !important;
      }

      #${ROOT_ID}.detail-open .detail-area {
        grid-template-rows: 1fr !important;
        margin-top: 10px !important;
      }

      #${ROOT_ID} .detail-inner {
        overflow: hidden !important;
      }

      #${ROOT_ID} .detail-grid {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 8px !important;
      }

      #${ROOT_ID} .info-box {
        min-width: 0 !important;
        padding: 8px 9px !important;
        border-radius: 9px !important;
        background: rgba(255, 250, 235, 0.58) !important;
        border: 1px solid rgba(105, 71, 45, 0.18) !important;
      }

      #${ROOT_ID} .info-box.wide {
        grid-column: 1 / -1 !important;
      }

      #${ROOT_ID} .info-title {
        margin-bottom: 4px !important;
        font-size: 11px !important;
        font-weight: 700 !important;
        letter-spacing: 0.10em !important;
        color: rgba(94, 45, 37, 0.88) !important;
      }

      #${ROOT_ID} .info-text {
        font-size: 12px !important;
        line-height: 1.58 !important;
        color: rgba(43, 31, 28, 0.80) !important;
        white-space: pre-wrap !important;
      }

      #${ROOT_ID} .todo-list {
        display: grid !important;
        gap: 4px !important;
        margin: 0 !important;
        padding: 0 !important;
        list-style: none !important;
      }

      #${ROOT_ID} .todo-list li {
        position: relative !important;
        padding-left: 18px !important;
        line-height: 1.45 !important;
      }

      #${ROOT_ID} .todo-list li::before {
        content: "◇" !important;
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        color: rgba(137, 51, 45, 0.76) !important;
      }

      @keyframes yukariCursor {
        0%, 100% { transform: translateY(0); opacity: 0.55; }
        50% { transform: translateY(3px); opacity: 1; }
      }

      @media (max-width: 520px) {
        #${ROOT_ID} .status-panel {
          width: min(330px, calc(100vw - 118px)) !important;
        }

        #${ROOT_ID} .status-shell {
          background:
            linear-gradient(90deg, rgba(42, 35, 31, 0.98), rgba(59, 47, 39, 0.97) 50%, rgba(225, 207, 174, 0.98) 50%, rgba(238, 224, 198, 0.98)) !important;
        }

        #${ROOT_ID} .detail-grid {
          grid-template-columns: 1fr !important;
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
      <div class="simple-icon">
        <img src="${ICON_URL}" alt="">
      </div>

      <div class="status-panel">
        <div class="status-shell">
          <div class="status-head">
            <div class="status-main">
              <div class="place-time">
                <span>万事屋</span>
                <em>·</em>
                <span>11:20</span>
              </div>

              <div class="voice-card">
                <span class="voice-text">「真是的……又露出这种表情。」</span><span class="voice-cursor">◆</span>
              </div>
            </div>

            <button class="expand-btn" type="button">
              展开<span class="arrow">▼</span>
            </button>
          </div>

          <div class="detail-area">
            <div class="detail-inner">
              <div class="detail-grid">
                <div class="info-box">
                  <div class="info-title">名</div>
                  <div class="info-text">虚見 相</div>
                </div>

                <div class="info-box">
                  <div class="info-title">心情值</div>
                  <div class="info-text">76</div>
                </div>

                <div class="info-box wide">
                  <div class="info-title">装束</div>
                  <div class="info-text">白襦袢，外披一件松散的黑羽织，袖口压着旧账册的一角。</div>
                </div>

                <div class="info-box wide">
                  <div class="info-title">所作</div>
                  <div class="info-text">他倚在柜台后翻看账册，指尖停在某一页泛黄的契约记录上，像是已经看见了某个愿望背后的代价，却暂时没有说破。</div>
                </div>

                <div class="info-box wide">
                  <div class="info-title">当前主线</div>
                  <div class="info-text">神隐少女事件

雨夜进入万事屋的少女提出“想要消失”的愿望。虚见相已经察觉这并非普通逃避，而是某种被长期压迫后的断裂。</div>
                </div>

                <div class="info-box wide">
                  <div class="info-title">角色待办</div>
                  <div class="info-text">
                    <ul class="todo-list">
                      <li>调查愿望代价</li>
                      <li>确认少女身上的异常气息</li>
                      <li>准备茶点安抚user</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    doc.head.appendChild(style);
    doc.body.appendChild(root);

    const icon = root.querySelector('.simple-icon');
    const expandBtn = root.querySelector('.expand-btn');

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let moved = false;

    function getPoint(event) {
      const touch = event.touches?.[0] || event.changedTouches?.[0];
      return touch
        ? { x: touch.clientX, y: touch.clientY }
        : { x: event.clientX, y: event.clientY };
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
        win.localStorage.setItem(STORAGE_KEY, JSON.stringify({
          left: rect.left,
          top: rect.top,
        }));
      } catch (e) {}
    }

    function ensurePanelInView() {
      const panel = root.querySelector('.status-panel');
      if (!panel) return;

      const rootRect = root.getBoundingClientRect();
      const panelWidth = panel.offsetWidth || 520;
      const needRight = rootRect.left + 100 + panelWidth + 8;

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

      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        moved = true;
      }

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
        togglePanel();
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

    expandBtn.addEventListener('click', toggleDetail);
    expandBtn.addEventListener('touchend', toggleDetail, { passive: false });

    console.log('YUKARI HORIZONTAL PANEL: mounted');
  }

  window.addEventListener('unload', cleanup);
  window.addEventListener('pagehide', cleanup);

  init();
})();