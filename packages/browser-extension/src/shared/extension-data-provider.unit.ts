import { afterEach, describe, expect, test, vi } from 'vitest';
import { QWIK_DEVTOOLS_GLOBAL } from '@qwik.dev/devtools/kit';
import { createRemotePageDataSource } from './extension-data-provider';

describe('createRemotePageDataSource', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('evaluates inspected page data through the single devtools global', async () => {
    const expressions: string[] = [];
    vi.stubGlobal('chrome', {
      devtools: {
        inspectedWindow: {
          eval(expression: string, cb: (result: unknown, exceptionInfo?: unknown) => void) {
            expressions.push(expression);
            cb(null);
          },
        },
      },
      runtime: {
        getURL(path: string) {
          return `chrome-extension://qwik${path}`;
        },
      },
    });

    const source = createRemotePageDataSource();
    await source.readPerfData();
    await source.readPreloadStore();
    await source.clearPreloadStore();
    await source.readComponentTree();

    const sourceText = expressions.join('\n');
    expect(sourceText).toContain(`window[${JSON.stringify(QWIK_DEVTOOLS_GLOBAL.key)}]`);
    expect(sourceText).toContain(`?.[${JSON.stringify(QWIK_DEVTOOLS_GLOBAL.props.perf)}]`);
    expect(sourceText).toContain(`?.[${JSON.stringify(QWIK_DEVTOOLS_GLOBAL.props.preloads)}]`);
    expect(sourceText).toContain(`?.[${JSON.stringify(QWIK_DEVTOOLS_GLOBAL.props.hook)}]`);
    expect(sourceText).not.toContain('window.__QWIK_PERF__');
    expect(sourceText).not.toContain('window.__QWIK_PRELOADS__');
    expect(sourceText).not.toContain('window.__QWIK_DEVTOOLS_HOOK__');
  });
});
