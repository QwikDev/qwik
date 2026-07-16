import { afterEach, describe, expect, test, vi } from 'vitest';
import { QWIK_DEVTOOLS_GLOBAL } from '@qwik.dev/devtools/kit';
import { createRemotePageDataSource } from './extension-data-provider';

/**
 * Stubs `chrome.devtools.inspectedWindow.eval`, capturing every evaluated expression and returning
 * a response chosen by `respond(expression)`. This models the inspected page so the remote data
 * source can be tested without a real browser or devtools panel.
 */
function stubChromeEval(respond: (expression: string) => unknown): string[] {
  const expressions: string[] = [];
  vi.stubGlobal('chrome', {
    devtools: {
      inspectedWindow: {
        eval(expression: string, cb: (result: unknown, exceptionInfo?: unknown) => void) {
          expressions.push(expression);
          cb(respond(expression));
        },
      },
    },
    runtime: {
      getURL(path: string) {
        return `chrome-extension://qwik${path}`;
      },
    },
  });
  return expressions;
}

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

  test('readVNodeTree returns the parsed tree the page hook exposes', async () => {
    const tree = [{ id: 'q-1', name: 'Counter', props: {} }];
    const expressions = stubChromeEval((expr) =>
      expr.includes('getVNodeTree?.()') ? JSON.stringify(tree) : 'true'
    );

    const result = await createRemotePageDataSource().readVNodeTree();

    expect(result).toEqual(tree);
    expect(expressions.some((e) => e.includes('getVNodeTree?.()'))).toBe(true);
  });

  test('readComponentDetail passes the component name and qrl chunk into the eval', async () => {
    const detail = [{ hookType: 'useSignal', variableName: 'count', data: 1 }];
    const expressions = stubChromeEval((expr) =>
      expr.includes('getComponentDetail') ? JSON.stringify(detail) : 'true'
    );

    const result = await createRemotePageDataSource().readComponentDetail('Counter', 'chunk-a');

    expect(result).toEqual(detail);
    const call = expressions.find((e) => e.includes('getComponentDetail'))!;
    expect(call).toContain('"Counter"');
    expect(call).toContain('"chunk-a"');
  });

  test('readNodeProps forwards the node id and parses the result', async () => {
    const props = { title: 'Hi' };
    const expressions = stubChromeEval((expr) =>
      expr.includes('getNodeProps') ? JSON.stringify(props) : 'true'
    );

    const result = await createRemotePageDataSource().readNodeProps('q-9');

    expect(result).toEqual(props);
    expect(expressions.find((e) => e.includes('getNodeProps'))).toContain('"q-9"');
  });

  test('setSignalValue evaluates the setter with all arguments and returns its boolean', async () => {
    const expressions = stubChromeEval((expr) => (expr.includes('setSignalValue') ? true : 'true'));

    const ok = await createRemotePageDataSource().setSignalValue('Counter', 'chunk-a', 'count', 42);

    expect(ok).toBe(true);
    const call = expressions.find((e) => e.includes('setSignalValue'))!;
    expect(call).toContain('"Counter"');
    expect(call).toContain('"chunk-a"');
    expect(call).toContain('"count"');
    expect(call).toContain('42');
  });

  test('highlightElement / unhighlightElement evaluate the hook highlight methods', async () => {
    const expressions = stubChromeEval(() => undefined);
    const source = createRemotePageDataSource();

    await source.highlightElement('q-4', 'Counter');
    await source.unhighlightElement();

    expect(expressions.some((e) => e.includes('highlightNode?.("q-4", "Counter")'))).toBe(true);
    expect(expressions.some((e) => e.includes('unhighlightNode?.()'))).toBe(true);
  });

  test('read methods resolve to null when the page eval throws', async () => {
    vi.stubGlobal('chrome', {
      devtools: {
        inspectedWindow: {
          eval(_expression: string, cb: (result: unknown, exceptionInfo?: unknown) => void) {
            cb(null, { isError: true, value: 'boom' });
          },
        },
      },
      runtime: { getURL: (path: string) => `chrome-extension://qwik${path}` },
    });

    expect(await createRemotePageDataSource().readVNodeTree()).toBeNull();
  });
});
