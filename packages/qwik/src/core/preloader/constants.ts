import { isServer } from '@qwik.dev/core/build';
import { isServerPlatform } from '../shared/platform/platform';

const hasDocument = typeof document !== 'undefined';

export const isBrowser =
  ((globalThis as any).qTest === true ? !isServerPlatform() : !isServer) && hasDocument;

// Browser-specific setup
export const doc = isBrowser ? document : undefined!;

export const config = {
  $maxIdlePreloads$: 25,
};

// Determine which rel attribute to use based on browser support
export const rel =
  isBrowser && doc.createElement('link').relList?.supports?.('modulepreload')
    ? 'modulePreload'
    : 'preload';

export const isJSRegex = /\.[mc]?js$/;

export const yieldInterval = 10;
