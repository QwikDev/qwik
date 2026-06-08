import { QWIK_DEVTOOLS_GLOBAL, SIGNAL_HOOK_TYPES } from '@qwik.dev/devtools/kit';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { __qwik_install_hook_runtime__, type HookRuntimeOptions } from './installers';

const OPTIONS: HookRuntimeOptions = {
  componentStateKey: QWIK_DEVTOOLS_GLOBAL.props.componentState,
  devtoolsGlobalKey: QWIK_DEVTOOLS_GLOBAL.key,
  globalVersion: QWIK_DEVTOOLS_GLOBAL.version,
  hookKey: QWIK_DEVTOOLS_GLOBAL.props.hook,
  signalHookTypes: [...SIGNAL_HOOK_TYPES],
};

type AnyRecord = Record<string, any>;

/** Installs the hook against a fresh stubbed window and returns the global + hook. */
function install(): { root: AnyRecord; hook: AnyRecord; state: AnyRecord } {
  __qwik_install_hook_runtime__(OPTIONS);
  const root = (globalThis as any).window[OPTIONS.devtoolsGlobalKey];
  return {
    root,
    hook: root[OPTIONS.hookKey],
    state: root[OPTIONS.componentStateKey],
  };
}

/** Seeds one component with the given hooks into componentState. */
function seedComponent(state: AnyRecord, path: string, hooks: AnyRecord[]) {
  state[path] = { hooks };
}

function signal(value: any) {
  return { value };
}

describe('__qwik_install_hook_runtime__', () => {
  beforeEach(() => {
    (globalThis as any).window = {};
  });

  afterEach(() => {
    delete (globalThis as any).window;
  });

  test('installs the hook under the devtools global with version 1', () => {
    const { root, hook } = install();
    expect(root.version).toBe(QWIK_DEVTOOLS_GLOBAL.version);
    expect(typeof hook).toBe('object');
    expect(hook.version).toBe(1);
    expect(root[OPTIONS.componentStateKey]).toEqual({});
  });

  test('does not reinstall when a hook already exists', () => {
    const { root, hook } = install();
    const sentinel = { version: 1, marker: true };
    root[OPTIONS.hookKey] = sentinel;
    __qwik_install_hook_runtime__(OPTIONS);
    expect(root[OPTIONS.hookKey]).toBe(sentinel);
    expect(hook).not.toBe(sentinel);
  });

  test('getSignalsSnapshot returns only signal-typed hooks with data', () => {
    const { hook, state } = install();
    seedComponent(state, '/src/foo_Counter', [
      { variableName: 'count', hookType: 'useSignal', data: signal(42) },
      { variableName: 'task', hookType: 'useTask', data: signal('ignored') },
      { variableName: 'empty', hookType: 'useSignal', data: null },
    ]);
    expect(hook.getSignalsSnapshot()).toEqual({
      '/src/foo_Counter': [{ name: 'count', hookType: 'useSignal', value: 42 }],
    });
  });

  test('getSignalsSnapshot omits components without signals', () => {
    const { hook, state } = install();
    seedComponent(state, '/src/foo_NoSig', [
      { variableName: 'task', hookType: 'useTask', data: signal('x') },
    ]);
    expect(hook.getSignalsSnapshot()).toEqual({});
  });

  test('getComponentTreeSnapshot extracts the component name after the last underscore', () => {
    const { hook, state } = install();
    seedComponent(state, '/src/path/to/chunk_MyButton', [
      { variableName: 'open', hookType: 'useSignal', category: 'state', data: signal(true) },
    ]);
    const tree = hook.getComponentTreeSnapshot();
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({
      path: '/src/path/to/chunk_MyButton',
      name: 'MyButton',
      signals: [{ name: 'open', hookType: 'useSignal', value: true }],
      hooks: [{ variableName: 'open', hookType: 'useSignal', category: 'state' }],
    });
  });

  test('getComponentDetail matches by qrlChunk suffix and deep-serializes data', () => {
    const { hook, state } = install();
    seedComponent(state, '/src/app/header_Nav', [
      {
        variableName: 'items',
        hookType: 'useStore',
        data: signal({ open: true, depth: { a: 1 } }),
      },
    ]);
    const detail = hook.getComponentDetail('whatever', 'header_Nav');
    // serializeDeep preserves the signal `.value` wrapper (it only unwraps `$untrackedValue$`)
    expect(detail).toEqual([
      {
        hookType: 'useStore',
        variableName: 'items',
        data: { value: { open: true, depth: { a: 1 } } },
      },
    ]);
  });

  test('getComponentDetail falls back to case-insensitive name match', () => {
    const { hook, state } = install();
    seedComponent(state, '/src/app/header_Nav', [
      { variableName: 'count', hookType: 'useSignal', data: signal(7) },
    ]);
    const detail = hook.getComponentDetail('nav', null);
    expect(detail).toHaveLength(1);
    expect(detail[0].variableName).toBe('count');
  });

  test('getComponentDetail returns null when nothing matches', () => {
    const { hook, state } = install();
    seedComponent(state, '/src/app/header_Nav', [
      { variableName: 'count', hookType: 'useSignal', data: signal(7) },
    ]);
    expect(hook.getComponentDetail('DoesNotExist', null)).toBeNull();
  });

  test('setSignalValue mutates the matching signal and returns true', () => {
    const { hook, state } = install();
    const sig = signal(1);
    seedComponent(state, '/src/foo_Counter', [
      { variableName: 'count', hookType: 'useSignal', data: sig },
    ]);
    expect(hook.setSignalValue('Counter', null, 'count', 99)).toBe(true);
    expect(sig.value).toBe(99);
  });

  test('setSignalValue returns false for an unknown variable', () => {
    const { hook, state } = install();
    seedComponent(state, '/src/foo_Counter', [
      { variableName: 'count', hookType: 'useSignal', data: signal(1) },
    ]);
    expect(hook.setSignalValue('Counter', null, 'missing', 99)).toBe(false);
  });

  test('onRender subscribes, receives _emitRender payloads, and unsubscribes', () => {
    const { hook } = install();
    const seen: any[] = [];
    const off = hook.onRender((info: any) => seen.push(info));
    hook._emitRender({ component: 'A' });
    off();
    hook._emitRender({ component: 'B' });
    expect(seen).toEqual([{ component: 'A' }]);
  });

  test('_emitRender isolates a throwing listener from the others', () => {
    const { hook } = install();
    const seen: any[] = [];
    hook.onRender(() => {
      throw new Error('boom');
    });
    hook.onRender((info: any) => seen.push(info));
    expect(() => hook._emitRender({ component: 'A' })).not.toThrow();
    expect(seen).toEqual([{ component: 'A' }]);
  });

  test('getSignalValue reads a signal reference, undefined otherwise', () => {
    const { hook } = install();
    expect(hook.getSignalValue(signal('v'))).toBe('v');
    expect(hook.getSignalValue(123)).toBeUndefined();
  });
});
