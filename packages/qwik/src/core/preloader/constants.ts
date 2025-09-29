import { isBrowser } from '@builder.io/qwik/build';

// Browser-specific setup
export const doc = isBrowser ? document : undefined!;
export const modulePreloadStr = 'modulepreload';
export const preloadStr = 'preload';

export const config = {
  $DEBUG$: false,
  $maxIdlePreloads$: 25,
  $invPreloadProbability$: 0.65,
};

// Determine which rel attribute to use based on browser support
export const rel =
  isBrowser && doc.createElement('link').relList.supports(modulePreloadStr)
    ? modulePreloadStr
    : preloadStr;

// Global state
export const loadStart = Date.now();

export const isJSRegex = /\.[mc]?js$/;
