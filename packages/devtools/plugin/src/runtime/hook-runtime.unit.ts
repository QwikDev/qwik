import { runInThisContext } from 'node:vm';
import { QWIK_DEVTOOLS_GLOBAL, SIGNAL_HOOK_TYPES } from '@qwik.dev/devtools/kit';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createExtensionHookRuntime } from './create-hook-runtime';
import {
  __qwik_derive_component_name__,
  __qwik_find_component_key__,
  __qwik_install_hook_runtime__,
  type HookRuntimeOptions,
} from './installers';

describe('__qwik_derive_component_name__', () => {
  test('returns the segment after the last underscore of the last path part', () => {
    expect(__qwik_derive_component_name__('src/routes/foo_Counter')).toBe('Counter');
    expect(__qwik_derive_component_name__('a/b/chunk_Button_Widget')).toBe('Widget');
  });

  test('falls back to the last path segment when there is no underscore', () => {
    expect(__qwik_derive_component_name__('src/routes/Plain')).toBe('Plain');
    expect(__qwik_derive_component_name__('Bare')).toBe('Bare');
  });
});

describe('__qwik_find_component_key__', () => {
  const state = { '/src/app/header_Nav': {}, '/src/foo_Counter': {} };

  test('prefers an exact QRL chunk suffix match', () => {
    expect(__qwik_find_component_key__(state, 'anything', 'foo_Counter')).toBe('/src/foo_Counter');
  });

  test('falls back to a case-insensitive component name match', () => {
    expect(__qwik_find_component_key__(state, 'nav', null)).toBe('/src/app/header_Nav');
  });

  test('returns null when nothing matches', () => {
    expect(__qwik_find_component_key__(state, 'Missing', null)).toBeNull();
    expect(__qwik_find_component_key__({}, 'Nav', null)).toBeNull();
  });
});

const OPTIONS: HookRuntimeOptions = {
  componentStateKey: QWIK_DEVTOOLS_GLOBAL.props.componentState,
  devtoolsGlobalKey: QWIK_DEVTOOLS_GLOBAL.key,
  globalVersion: QWIK_DEVTOOLS_GLOBAL.version,
  hookKey: QWIK_DEVTOOLS_GLOBAL.props.hook,
  signalHookTypes: [...SIGNAL_HOOK_TYPES],
};

type AnyRecord = Record<string, any>;

// The exact script the browser extension ships: scripts/gen-devtools-hook.mjs writes this same
// string to public/devtools-hook.js (a generated, uncommitted file) on predev/prebuild.
const generatedSource = createExtensionHookRuntime();

/**
 * Two ways to obtain the running hook. Running the same behavioral contract against both proves the
 * generated browser-extension script behaves identically to the canonical installer, so the two
 * injection paths (Vite plugin SSR middleware and extension content script) cannot drift.
 */
const installers: Array<{ name: string; install: () => void }> = [
  {
    name: 'canonical installer (source of truth)',
    install: () => __qwik_install_hook_runtime__(OPTIONS),
  },
  {
    name: 'generated browser-extension script',
    // A self-invoking classic script that reads the global `window`; run it in the current
    // global context so it installs onto the window stub below.
    install: () => runInThisContext(generatedSource),
  },
];

function seedComponent(state: AnyRecord, path: string, hooks: AnyRecord[]) {
  state[path] = { hooks };
}

function signal(value: any) {
  return { value };
}

describe.each(installers)('hook runtime: $name', ({ install }) => {
  let win: AnyRecord;

  function getHook(): AnyRecord {
    return win[OPTIONS.devtoolsGlobalKey][OPTIONS.hookKey];
  }

  function getState(): AnyRecord {
    return win[OPTIONS.devtoolsGlobalKey][OPTIONS.componentStateKey];
  }

  beforeEach(() => {
    win = {};
    (globalThis as any).window = win;
    install();
  });

  afterEach(() => {
    delete (globalThis as any).window;
  });

  test('installs the hook under the devtools global with version 1', () => {
    expect(win[OPTIONS.devtoolsGlobalKey].version).toBe(QWIK_DEVTOOLS_GLOBAL.version);
    expect(getHook().version).toBe(1);
    expect(getState()).toEqual({});
  });

  test('does not reinstall over an existing hook', () => {
    const sentinel = { version: 1, marker: true };
    win[OPTIONS.devtoolsGlobalKey][OPTIONS.hookKey] = sentinel;
    install();
    expect(getHook()).toBe(sentinel);
  });

  test('getSignalsSnapshot returns only signal-typed hooks with data', () => {
    seedComponent(getState(), '/src/foo_Counter', [
      { variableName: 'count', hookType: 'useSignal', data: signal(42) },
      { variableName: 'task', hookType: 'useTask', data: signal('ignored') },
      { variableName: 'empty', hookType: 'useSignal', data: null },
    ]);
    expect(getHook().getSignalsSnapshot()).toEqual({
      '/src/foo_Counter': [{ name: 'count', hookType: 'useSignal', value: 42 }],
    });
  });

  test('getSignalsSnapshot omits components without signals', () => {
    seedComponent(getState(), '/src/foo_NoSig', [
      { variableName: 'task', hookType: 'useTask', data: signal('x') },
    ]);
    expect(getHook().getSignalsSnapshot()).toEqual({});
  });

  test('getComponentTreeSnapshot extracts the name after the last underscore', () => {
    seedComponent(getState(), '/src/path/to/chunk_MyButton', [
      { variableName: 'open', hookType: 'useSignal', category: 'state', data: signal(true) },
    ]);
    const tree = getHook().getComponentTreeSnapshot();
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({
      path: '/src/path/to/chunk_MyButton',
      name: 'MyButton',
      signals: [{ name: 'open', hookType: 'useSignal', value: true }],
      hooks: [{ variableName: 'open', hookType: 'useSignal', category: 'state' }],
    });
  });

  test('getComponentDetail matches by qrlChunk suffix and deep-serializes data', () => {
    seedComponent(getState(), '/src/app/header_Nav', [
      {
        variableName: 'items',
        hookType: 'useStore',
        data: signal({ open: true, depth: { a: 1 } }),
      },
    ]);
    // serializeDeep keeps the signal `.value` wrapper (it only unwraps `$untrackedValue$`)
    expect(getHook().getComponentDetail('whatever', 'header_Nav')).toEqual([
      {
        hookType: 'useStore',
        variableName: 'items',
        data: { value: { open: true, depth: { a: 1 } } },
      },
    ]);
  });

  test('getComponentDetail falls back to a case-insensitive name match', () => {
    seedComponent(getState(), '/src/app/header_Nav', [
      { variableName: 'count', hookType: 'useSignal', data: signal(7) },
    ]);
    const detail = getHook().getComponentDetail('nav', null);
    expect(detail).toHaveLength(1);
    expect(detail[0].variableName).toBe('count');
  });

  test('getComponentDetail returns null when nothing matches', () => {
    seedComponent(getState(), '/src/app/header_Nav', [
      { variableName: 'count', hookType: 'useSignal', data: signal(7) },
    ]);
    expect(getHook().getComponentDetail('DoesNotExist', null)).toBeNull();
  });

  test('setSignalValue mutates the matching signal and returns true', () => {
    const sig = signal(1);
    seedComponent(getState(), '/src/foo_Counter', [
      { variableName: 'count', hookType: 'useSignal', data: sig },
    ]);
    expect(getHook().setSignalValue('Counter', null, 'count', 99)).toBe(true);
    expect(sig.value).toBe(99);
  });

  test('setSignalValue returns false for an unknown variable', () => {
    seedComponent(getState(), '/src/foo_Counter', [
      { variableName: 'count', hookType: 'useSignal', data: signal(1) },
    ]);
    expect(getHook().setSignalValue('Counter', null, 'missing', 99)).toBe(false);
  });

  test('onRender subscribes, receives _emitRender payloads, and unsubscribes', () => {
    const seen: any[] = [];
    const off = getHook().onRender((info: any) => seen.push(info));
    getHook()._emitRender({ component: 'A' });
    off();
    getHook()._emitRender({ component: 'B' });
    expect(seen).toEqual([{ component: 'A' }]);
  });

  test('_emitRender isolates a throwing listener from the others', () => {
    const seen: any[] = [];
    getHook().onRender(() => {
      throw new Error('boom');
    });
    getHook().onRender((info: any) => seen.push(info));
    expect(() => getHook()._emitRender({ component: 'A' })).not.toThrow();
    expect(seen).toEqual([{ component: 'A' }]);
  });

  test('getSignalValue reads a signal reference, undefined otherwise', () => {
    expect(getHook().getSignalValue(signal('v'))).toBe('v');
    expect(getHook().getSignalValue(123)).toBeUndefined();
  });
});
