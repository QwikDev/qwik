import { describe, expect, test } from 'vitest';
import { QWIK_DEVTOOLS_GLOBAL, QWIK_VNODE_PROTOCOL } from '@qwik.dev/devtools/kit';
import { createHookRuntime } from './create-hook-runtime';
import { createPerfRuntime } from './create-perf-runtime';
import { createVNodeRuntime } from './create-vnode-runtime';

describe('runtime module factories', () => {
  test('hook runtime uses protocol signal hook names', () => {
    const source = createHookRuntime();
    expect(source).toContain('useSignal');
    expect(source).toContain('useAsyncComputed');
    expect(source).toContain(QWIK_DEVTOOLS_GLOBAL.key);
    expect(source).toContain('componentState');
    expect(source).toContain('__qwik_install_hook_runtime__');
  });

  test('perf runtime writes perf data under the single devtools global', () => {
    const source = createPerfRuntime();
    expect(source).toContain(QWIK_DEVTOOLS_GLOBAL.key);
    expect(source).toContain('perf');
    expect(source).not.toContain('window.__QWIK_PERF__');
    expect(source).toContain('__qwik_install_perf_runtime__');
  });

  test('vnode runtime uses protocol vnode field names and preserves bridge methods', () => {
    const source = createVNodeRuntime();
    expect(source).toContain(
      `var QRENDERFN = ${JSON.stringify(QWIK_VNODE_PROTOCOL.attrs.renderFn)};`
    );
    expect(source).toContain('__qwik_install_vnode_runtime__');
    expect(source).toContain('hook.resolveElementToComponent');
    expect(source).toContain('hook.getElementRect');
    expect(source).toContain('hook.highlightNode');
    expect(source).toContain('hook.unhighlightNode');
    expect(source).toContain('hook.getNodeProps');
  });
});
