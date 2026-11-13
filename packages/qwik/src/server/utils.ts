import type { RenderOptions } from './types';

export function getBuildBase(opts: RenderOptions<any>) {
  let base = opts.base;
  if (typeof opts.base === 'function') {
    base = opts.base(opts);
  }
  if (typeof base === 'string') {
    if (!base.endsWith('/')) {
      base += '/';
    }
    return base;
  }
  return `${import.meta.env?.BASE_URL || '/'}build/`;
}

/** @public */
export const versions = {
  qwik: (globalThis as any).QWIK_VERSION as string,
  qwikDom: (globalThis as any).QWIK_DOM_VERSION as string,
} as const;
