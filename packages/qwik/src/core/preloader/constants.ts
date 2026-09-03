import { isServer } from '@qwik.dev/core/build';
import { qTest } from '../shared/utils/qdev';
import { isServerPlatform } from '../shared/platform/platform';

const hasDocument = typeof document !== 'undefined';

export const isBrowser = (qTest ? !isServerPlatform() : !isServer) && hasDocument;

// Browser-specific setup
export const doc = isBrowser ? document : undefined!;

export const config = {
  $DEBUG$: false,
  $maxIdlePreloads$: 25,
  // Bundles below this probability are not speculatively preloaded. Combined with fan-out-aware
  // edge probabilities (see convertManifestToBundleGraph), this keeps large lazy maps/registries
  // (many mutually-exclusive dynamic imports, each scored low) from preloading every entry, while
  // still preloading likely code (a modal, a route's components) that scores well above it.
  $minPreloadProbability$: 0.2,
};

// Determine which rel attribute to use based on browser support
export const rel =
  isBrowser && doc.createElement('link').relList?.supports?.('modulepreload')
    ? 'modulePreload'
    : 'preload';

export const isJSRegex = /\.[mc]?js$/;

export const yieldInterval = 10;
