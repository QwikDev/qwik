import { describe, expect, test } from 'vitest';
import { QWIK_DEVTOOLS_GLOBAL, QWIK_VNODE_PROTOCOL } from '@qwik.dev/devtools/kit';
import { createExtensionHookRuntime, createHookRuntime } from './create-hook-runtime';
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

  test('extension hook runtime wraps the same installer in a plain-script IIFE', () => {
    const source = createExtensionHookRuntime();
    // shares the exact canonical installer with the Vite plugin path
    expect(source).toContain('__qwik_install_hook_runtime__');
    expect(source).toContain(QWIK_DEVTOOLS_GLOBAL.key);
    expect(source).toContain('useAsyncComputed');
    // plain-script form: self-invoking, strict, no ES module syntax
    expect(source).toContain("'use strict';");
    expect(source.trimEnd().endsWith('})();')).toBe(true);
    expect(source).not.toContain('export ');
    expect(source).not.toContain('import ');
    // marked as generated so nobody hand-edits the emitted file
    expect(source).toContain('GENERATED FILE');
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
