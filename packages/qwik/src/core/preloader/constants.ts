import { isBrowser } from '@qwik.dev/core/build';

// Browser-specific setup
export const doc = isBrowser ? document : undefined!;
export const modulePreloadStr = 'modulepreload';
export const preloadStr = 'preload';
export const maxSimultaneousPreloadsStr = 'maxSimultaneousPreloads';
export const maxSignificantInverseProbabilityStr = 'maxSignificantInverseProbability';

export const config = {
  DEBUG: false,
  [maxSimultaneousPreloadsStr]: 6,
  [maxSignificantInverseProbabilityStr]: 0.75,
};

// Determine which rel attribute to use based on browser support
export const rel =
  isBrowser && doc.createElement('link').relList.supports(modulePreloadStr)
    ? modulePreloadStr
    : preloadStr;

// Global state
export const loadStart = Date.now();
