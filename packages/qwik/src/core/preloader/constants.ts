import { isBrowser } from '@qwik.dev/core/build';
import { qTest } from '../shared/utils/qdev';
import { isServerPlatform } from '../shared/platform/platform';

export const isRunningOnBrowser = qTest ? !isServerPlatform() : isBrowser;

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
