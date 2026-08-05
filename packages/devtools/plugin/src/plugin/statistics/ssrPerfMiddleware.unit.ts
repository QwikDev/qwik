import { describe, expect, test } from 'vitest';
import {
  DEVTOOLS_MESSAGES,
  QWIK_DEVTOOLS_GLOBAL,
  QWIK_VNODE_PROTOCOL,
} from '@qwik.dev/devtools/kit';
import { injectSsrDevtoolsIntoHtml } from './ssrPerfMiddleware';

describe('ssrPerfMiddleware', () => {
  test('injects protocol-defined ssr perf and preload names', () => {
    const html = '<html><head></head><body></body></html>';
    const nextHtml = injectSsrDevtoolsIntoHtml(
      html,
      {
        __QWIK_SSR_PERF__: [{ component: 'App', phase: 'ssr', duration: 1 }],
        __QWIK_SSR_PRELOADS__: [{ href: '/build/q-a.js', phase: 'ssr', loadDuration: 9 }],
      },
      '/demo'
    );

    expect(nextHtml).toContain(`window[${JSON.stringify(QWIK_DEVTOOLS_GLOBAL.key)}]`);
    expect(nextHtml).toContain(`[${JSON.stringify(QWIK_DEVTOOLS_GLOBAL.props.perf)}]`);
    expect(nextHtml).toContain(`CustomEvent('${DEVTOOLS_MESSAGES.events.ssrPerf}'`);
    expect(nextHtml).toContain(`[${JSON.stringify(QWIK_DEVTOOLS_GLOBAL.props.ssrPreloads)}]`);
    expect(nextHtml).not.toContain('window.__QWIK_PERF__');
    expect(nextHtml).not.toContain('window.__QWIK_SSR_PRELOADS__');
    expect(nextHtml).toContain(`CustomEvent('${DEVTOOLS_MESSAGES.events.ssrPreloads}'`);
    expect(nextHtml).toContain(`src="/${QWIK_VNODE_PROTOCOL.bridgeVirtualModuleId}"`);
  });
});
