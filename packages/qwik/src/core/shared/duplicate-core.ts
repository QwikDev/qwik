import { isServer } from '@qwik.dev/core/build';
import { version } from '../version';
import { qError, QError } from './error/error';
import { qwikGlobal } from './singletons';

// Runs once per copy of core: only the public entry imports this, so the server and preloader
// bundles that embed the registry do not take part.
if (isServer) {
  // The server allows one Qwik version per process; same-version copies share the registry.
  const existing = qwikGlobal.version;
  if (existing && existing !== version) {
    qError(QError.duplicateQwik, [existing, version]);
  }
  qwikGlobal.version = version;
}
