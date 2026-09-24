import { isServer } from '@qwik.dev/core/build';
import { version } from '../version';

type Singletons = Record<string, unknown>;
export type QwikGlobal = { version?: string; singletons?: Singletons } & {
  [version: string]: Singletons | string | undefined;
};

/** Process-wide home of the state that every copy of Qwik in this process shares. */
export const qwikGlobal = ((globalThis as any).__qwik__ ||= {}) as QwikGlobal;

// The server shares one registry across copies; the client keeps one registry per Qwik version,
// so containers rendered by different builds stay independent.
const singletons: Singletons = isServer
  ? (qwikGlobal.singletons ||= Object.create(null))
  : ((qwikGlobal[version] ||= Object.create(null)) as Singletons);

/**
 * Get or create a singleton shared by all Qwik module instances in this process/version.
 *
 * @internal
 */
export const registerSingleton = <T>(key: string, factory: () => T): T => {
  if (!(key in singletons)) {
    singletons[key] = factory();
  }
  return singletons[key] as T;
};

/**
 * Read a singleton registered with `registerSingleton`, if any.
 *
 * @internal
 */
export const getSingleton = <T>(key: string): T | undefined => {
  return singletons[key] as T | undefined;
};
