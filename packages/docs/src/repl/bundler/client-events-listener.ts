import type { QwikSymbolEvent } from '@qwik.dev/core/internal';
import type { ReplEvent } from '../types';

(() => {
  const replId = location.pathname.split('/')[2];
  const origConsole: Record<string, any> = {};

  const sendToServerWindow = (data: Omit<ReplEvent, 'start'>) => {
    try {
      parent.postMessage({
        type: 'event',
        replId,
        event: { ...data, start: performance.now() },
      });
    } catch {
      // ignore
    }
  };

  const wrapConsole = (kind: 'log' | 'warn' | 'error' | 'debug') => {
    origConsole[kind] = console[kind];
    console[kind] = (...args: any[]) => {
      sendToServerWindow({
        kind: `console-${kind}` as any,
        scope: 'client',
        message: args.map((a) => String(a)),
      });
      origConsole[kind](...args);
    };
  };
  wrapConsole('log');
  wrapConsole('warn');
  wrapConsole('error');
  // wrapConsole('debug');

  document.addEventListener('qsymbol', (ev) => {
    const customEv: QwikSymbolEvent = ev as any;
    const symbolName = customEv.detail?.symbol;
    sendToServerWindow({
      kind: 'symbol',
      scope: 'client',
      message: [symbolName],
    });
  });

  document.addEventListener('qresume', () => {
    sendToServerWindow({
      kind: 'resume',
      scope: 'client',
      message: [''],
    });
  });

  // Ensure all external links open in a new tab
  document.addEventListener(
    'click',
    (ev) => {
      try {
        if (ev.target && (ev.target as Element).tagName === 'A') {
          const anchor = ev.target as HTMLAnchorElement;
          const href = anchor.href;
          if (href && href !== '#') {
            const url = new URL(anchor.href, origin);
            if (url.origin !== origin) {
              anchor.setAttribute('target', '_blank');
            }
          }
        }
      } catch (e) {
        console.error('repl-request-handler', e);
      }
    },
    true
  );
})();
