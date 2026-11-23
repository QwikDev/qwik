const PALETTE_TOKENS = [
  '--color-foreground',
  '--color-primary',
  '--color-primary-hover',
  '--color-border',
  '--color-card-item-hover-bg',
] as const;

const INSPECT_THEME_CSS = String.raw`
  html, body, #app, main, header, nav, footer { background-color: transparent !important; }
  html, .text-main { color: var(--color-foreground) !important; }
  .border-main, [border~="main"], .children\:border-main > * {
    border-color: var(--color-border) !important;
  }
  .bg-active, [bg-active], .hover\:bg-active:hover, [hover~="bg-active"]:hover {
    background-color: var(--color-card-item-hover-bg) !important;
  }
  .bg-teal5, [bg-teal5] {
    background-color: var(--color-primary) !important;
    color: #09090b !important;
  }
  .bg-teal5:hover, [bg-teal5]:hover { background-color: var(--color-primary-hover) !important; }
  html, body, #app { overflow-x: hidden !important; max-width: 100vw !important; }
`;

export function setupIframeThemeSync(iframe: HTMLIFrameElement): (() => void) | undefined {
  const doc = iframe.contentDocument;
  const parentWindow = iframe.ownerDocument.defaultView;
  if (!doc?.head || doc.URL === 'about:blank' || !parentWindow) {
    return;
  }

  const root = doc.documentElement;
  const systemTheme = parentWindow.matchMedia('(prefers-color-scheme: dark)');
  const syncTheme = () => {
    const palette = parentWindow.getComputedStyle(iframe);
    const theme = palette.getPropertyValue('--theme-name').trim().replace(/['"]/g, '');
    const isDark = theme === 'dark';
    root.classList.toggle('dark', isDark);
    root.style.colorScheme = isDark ? 'dark' : 'light';
    for (const token of PALETTE_TOKENS) {
      root.style.setProperty(token, palette.getPropertyValue(token));
    }
  };

  const style = doc.createElement('style');
  style.textContent = INSPECT_THEME_CSS;
  syncTheme();
  doc.head.appendChild(style);

  const themeObserver = new MutationObserver(syncTheme);
  themeObserver.observe(iframe.ownerDocument.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme'],
  });
  systemTheme.addEventListener('change', syncTheme);

  return () => {
    themeObserver.disconnect();
    systemTheme.removeEventListener('change', syncTheme);
    style.remove();
  };
}
