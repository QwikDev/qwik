import { isBrowser } from '@qwik.dev/core/build';

// Browser-specific setup
export const hasDocument = isBrowser && typeof document === 'object';
export const doc = hasDocument ? document : undefined!;

export const config = {
  $DEBUG$: false,
  $maxIdlePreloads$: 25,
  $invPreloadProbability$: 0.65,
};

// Determine which rel attribute to use based on browser support
export const rel =
  hasDocument && doc.createElement('link').relList.supports('modulepreload')
    ? 'modulePreload'
    : 'preload';

// Global state
export const loadStart = Date.now();

export const isJSRegex = /\.[mc]?js$/;
