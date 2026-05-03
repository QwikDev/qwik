import { isServer } from '@qwik.dev/core/build';
import { qError, QError } from './error/error';
import { version } from '../version';

type Singletons = Record<string, unknown>;
type QwikGlobal = { version?: string | undefined } & { [version: string]: Singletons };

const QWIK = ((globalThis as any).__qwik__ ||= {}) as QwikGlobal;

// This will probably never happen, but better be safe
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    (globalThis as any).__qwik__ = undefined;
  });
}

let singletons: Singletons;

if (isServer) {
  // We can only have 1 Qwik version
  const existing = QWIK.version;
  if (existing) {
    if (existing !== version) {
      // Server allows only one Qwik version per process; same-version coexistence is fine
      // and gets to share the singleton state.
      qError(QError.duplicateQwik, [existing, version]);
    }
  } else {
    QWIK.version = version;
  }
  singletons = QWIK.singletons ||= {};
} else {
  // On the client, we can have multiple Qwik versions coexisting, but they don't share state.
  singletons = QWIK[version] ||= {};
}

export const registerSingleton = <T>(key: string, factory: () => T): T => {
  if (!(key in singletons)) {
    singletons[key] = factory();
  }
  return singletons[key] as T;
};

export const getGlobalSingleton = <T>(key: string): T | undefined => {
  return singletons[key] as T | undefined;
};
