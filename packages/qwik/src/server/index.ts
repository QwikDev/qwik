import { type } from 'os';
import { isQrl } from '../core/import/qrl-class';
import { stringifyClassOrStyle } from '../core/props/props';
import { promiseAll, then } from '../core/util/promises';
import type { ValueOrPromise } from '../core/util/types';

export type {
  GlobalInjections,
  PrefetchResource,
  PrefetchImplementation,
  PrefetchStrategy,
  QwikManifest,
  QwikBundle,
  QwikSymbol,
  RenderToStringOptions,
  RenderToStringResult,
  SnapshotResult,
} from './types';
export { renderToString } from './render';
export { createTimer, versions } from './utils';
export { getQwikLoaderScript } from './scripts';
export { serializeDocument } from './serialize';
export { setServerPlatform } from './platform';
export { _createDocument } from './document';

