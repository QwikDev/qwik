import { isServer } from '@qwik.dev/core/build';
import { version } from '../version';
import { qError, QError } from './error/error';
import { getSingleton, qwikGlobal, registerSingleton } from './singletons';

// Runs once per copy of core: only the public entry imports this, so the server and preloader
// bundles that embed the registry do not take part.
if (isServer) {
  // The server allows one Qwik version per process; same-version copies share the registry.
  const existing = qwikGlobal.version;
  if (existing && existing !== version) {
    qError(QError.duplicateQwik, [existing, version]);
  }
  qwikGlobal.version = version;

  /**
   * The bundler replaces every `__EXPERIMENTAL__.feature` read with a literal. A copy of core that
   * loads without a bundler (a Qwik library kept external on the server) reads this global instead,
   * which resolves to the flags published by the bundled copy.
   */
  globalThis.__EXPERIMENTAL__ ??= new Proxy({} as typeof __EXPERIMENTAL__, {
    get: (_, feature) => getSingleton<Record<string | symbol, boolean>>('experimental')?.[feature],
  });
  const flags = {
    each: __EXPERIMENTAL__.each,
    show: __EXPERIMENTAL__.show,
    suspense: __EXPERIMENTAL__.suspense,
    errorBoundary: __EXPERIMENTAL__.errorBoundary,
    valibot: __EXPERIMENTAL__.valibot,
    noSPA: __EXPERIMENTAL__.noSPA,
    insights: __EXPERIMENTAL__.insights,
    blockSSR: __EXPERIMENTAL__.blockSSR,
  };
  // Only a bundled copy has literal flags; an unbundled copy reads `undefined` until published.
  if (typeof flags.each === 'boolean') {
    registerSingleton('experimental', () => flags);
  }
}
