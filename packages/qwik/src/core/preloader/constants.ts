import { isServer } from '@qwik.dev/core/build';
import { isServerPlatform } from '../shared/platform/platform';

const isBrowser = import.meta.env.TEST ? !isServerPlatform() : !isServer;

// Browser-specific setup
export const doc = isBrowser ? document : undefined!;

export const config = {
  $DEBUG$: false,
  $maxIdlePreloads$: 25,
  $invPreloadProbability$: 0.65,
};

// Determine which rel attribute to use based on browser support
export const rel =
  isBrowser && doc.createElement('link').relList?.supports?.('modulepreload')
    ? 'modulePreload'
    : 'preload';

// Global state
export const loadStart = performance.now();

export const isJSRegex = /\.[mc]?js$/;

export const yieldInterval = 1000 / 60;
