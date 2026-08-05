import { target } from './shared';
import type { ComponentDevtoolsState, QwikDevtoolsWindowGlobal } from './globals';
import { QWIK_DEVTOOLS_GLOBAL } from './protocol/globals';

type GlobalStore = Record<string, unknown>;

const globalStore = target as unknown as GlobalStore;

export function createGlobalAccessor<T>(key: string) {
  return {
    get: () => globalStore[key] as T,
    set: (value: T) => {
      globalStore[key] = value;
    },
  };
}

type DevtoolsWindow = Window & Record<string, QwikDevtoolsWindowGlobal | undefined>;

function getDefaultWindow(): Window | undefined {
  return typeof window === 'undefined' ? undefined : window;
}

export function getQwikDevtoolsGlobal(
  pageWindow: Window | undefined | null = getDefaultWindow()
): QwikDevtoolsWindowGlobal | undefined {
  return pageWindow ? (pageWindow as DevtoolsWindow)[QWIK_DEVTOOLS_GLOBAL.key] : undefined;
}

export function getOrCreateQwikDevtoolsGlobal(
  pageWindow: Window | undefined = getDefaultWindow()
): QwikDevtoolsWindowGlobal {
  if (!pageWindow) {
    throw new Error('Qwik DevTools global is only available in the browser');
  }

  const record = pageWindow as DevtoolsWindow;
  const root =
    record[QWIK_DEVTOOLS_GLOBAL.key] ??
    (record[QWIK_DEVTOOLS_GLOBAL.key] = {
      version: QWIK_DEVTOOLS_GLOBAL.version,
      [QWIK_DEVTOOLS_GLOBAL.props.componentState]: {},
    });

  root.version = root.version || QWIK_DEVTOOLS_GLOBAL.version;
  root[QWIK_DEVTOOLS_GLOBAL.props.componentState] ??= {};
  return root;
}

export function getQwikDevtoolsComponentState(
  pageWindow: Window | undefined | null = getDefaultWindow()
): Record<string, ComponentDevtoolsState> {
  return getQwikDevtoolsGlobal(pageWindow)?.[QWIK_DEVTOOLS_GLOBAL.props.componentState] ?? {};
}
