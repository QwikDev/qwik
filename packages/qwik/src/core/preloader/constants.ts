import { isBrowser } from '@qwik.dev/core/build';
import { isServerPlatform } from '../shared/platform/platform';

const isRunningOnBrowser = import.meta.env.TEST ? !isServerPlatform() : isBrowser;

// Browser-specific setup
export const doc = isRunningOnBrowser ? document : undefined!;

export const config = {
  $DEBUG$: false,
  $maxIdlePreloads$: 25,
};

// Determine which rel attribute to use based on browser support
export const rel =
  isRunningOnBrowser && doc.createElement('link').relList?.supports?.('modulepreload')
    ? 'modulePreload'
    : 'preload';

// Global state
export const loadStart = performance.now();

export const isJSRegex = /\.[mc]?js$/;

export const yieldInterval = 1000 / 60;
