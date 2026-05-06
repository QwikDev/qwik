const STYLE_ID = 'qwik-inspect-custom-style';

const GLASSMORPHISM_CSS = `
  :root {
    --c-bg-base: transparent !important;
    --c-bg-nav: transparent !important;
    --c-bg-active: transparent !important;
    --iframe-border: rgba(0, 0, 0, 0.1) !important;
    --iframe-hover: rgba(0, 0, 0, 0.04) !important;
    color-scheme: light;
  }
  html.dark {
    --c-bg-base: transparent !important;
    --c-bg-nav: transparent !important;
    --c-bg-active: transparent !important;
    --iframe-border: rgba(0, 0, 0, 0.1) !important;
    --iframe-hover: rgba(0, 0, 0, 0.04) !important;
    color-scheme: light;
  }
  /* 仅针对主视图容器做透明处理，不再暴力让所有 div/section 变透明 */
  html, body, #app, main, header, nav, footer { background-color: transparent !important; }
  .bg-active, .hover\\\\:bg-active:hover, tr:hover, li:hover,
  .hover\\\\:bg-gray-400\\\\/10:hover, a:hover { background-color: var(--iframe-hover) !important; }
  input, button, select, [role="button"] { background-color: var(--iframe-hover) !important; }
  .border-base, [class*="border-b"], [class*="border-r"],
  [class*="border-t"], [class*="border-l"], .border { border-color: var(--iframe-border) !important; }
  html.dark { color: #fafafa !important; }
  html, body, #app { overflow-x: hidden !important; max-width: 100vw !important; }
`;

/** 在 iframe onLoad 中调用，同步父主题 + 注入透明背景样式 */
export function setupIframeThemeSync(iframe: HTMLIFrameElement): void {
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    return;
  }

  const syncTheme = () => {
    const dark =
      document.documentElement.classList.contains('dark') ||
      document.documentElement.getAttribute('data-theme') === 'dark';
    win.localStorage.setItem('vueuse-color-scheme', dark ? 'dark' : 'light');
    if (dark) {
      doc.documentElement.classList.add('dark');
    } else {
      doc.documentElement.classList.remove('dark');
    }
  };

  const ensureStyle = () => {
    if (!doc.getElementById(STYLE_ID)) {
      const s = doc.createElement('style');
      s.id = STYLE_ID;
      s.textContent = GLASSMORPHISM_CSS;
      doc.head.appendChild(s);
    }
  };

  syncTheme();
  ensureStyle();

  const themeObs = new MutationObserver(syncTheme);
  themeObs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme'],
  });

  const styleObs = new MutationObserver(ensureStyle);
  styleObs.observe(doc.body || doc.documentElement, {
    childList: true,
    subtree: true,
  });

  doc.defaultView?.addEventListener('unload', () => {
    themeObs.disconnect();
    styleObs.disconnect();
  });
}
