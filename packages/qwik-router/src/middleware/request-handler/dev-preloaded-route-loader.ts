import type { LoaderInternal } from '../../runtime/src/types';

export const devPreloadedRouteLoaders = ((globalThis as any)[
  Symbol.for('devPreloadedRouteLoaders')
] ??= new WeakMap<object, LoaderInternal>());
