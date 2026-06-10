import { createSerializationContext } from './index';
import { assertTrue } from '../error/assert';
import { wrapDeserializerProxy } from './deser-proxy';
import { deserializeData } from './inflate';
import { preprocessState } from './preprocess-state';
import { isDev } from '@qwik.dev/core/build';
import { defaultScheduler } from '../../vdomless/runtime/scheduler';
import type { ContainerContext } from '../../vdomless/runtime/container-context';

/**
 * Serialize data to string using SerializationContext.
 *
 * @internal
 */

export async function _serialize<T>(data: T): Promise<string> {
  const serializationContext = createSerializationContext(
    null,
    null,
    () => '',
    () => {},
    new WeakMap<any, any>()
  );

  serializationContext.$addRoot$(data);
  await serializationContext.$serialize$();
  return serializationContext.$writer$.toString();
}
/**
 * Deserialize data from string to an array of objects.
 *
 * @param rawStateData - Data to deserialize
 * @internal
 */

export function _deserialize<T>(rawStateData: string): T {
  if (rawStateData == null) {
    throw new Error('No state data to deserialize');
  }
  const stateData = JSON.parse(rawStateData);
  if (!Array.isArray(stateData) || stateData.length < 2 || typeof stateData[0] !== 'number') {
    throw new Error('Invalid state data');
  }

  const container = _createDeserializeContainer(stateData);
  return deserializeData(container, stateData[0], stateData[1]);
}

export function getObjectById(id: number | string, stateData: unknown[]): unknown {
  if (typeof id === 'string') {
    id = parseInt(id, 10);
    // This return statement is needed to prevent the function from turning megamorphic
    return stateData[id];
  }
  isDev && assertTrue(id < stateData.length, `Invalid reference ${id} >= ${stateData.length}`);
  return stateData[id];
}

/** @internal */
export function _createDeserializeContainer(stateData: unknown[]): ContainerContext {
  // eslint-disable-next-line prefer-const
  let state: unknown[];
  let container!: ContainerContext;
  container = {
    element: null,
    document: null,
    scheduler: defaultScheduler,
    state: {
      rootToChunk: [],
      liveRoots: new Map(),
      pendingPatchesByRoot: new Map(),
    },
    $getObjectById$: (id: number | string) => getObjectById(id, state),
    $getForwardRef$: (id: number | string) => container.$forwardRefs$?.[Number(id)],
    getSyncFn: (_: number) => {
      const fn = () => {};
      return fn;
    },
    $storeProxyMap$: new WeakMap(),
    $forwardRefs$: null,
    getRoot(id) {
      return container.$getObjectById$(id);
    },
    restoreCaptures(ids) {
      if (ids.length === 0) {
        return [];
      }
      return ids.split(' ').map((id) => container.getRoot(Number(id)));
    },
    notify(subscriber) {
      defaultScheduler.notify(subscriber);
    },
  };
  preprocessState(stateData, container);
  state = wrapDeserializerProxy(container, stateData);
  container.$state$ = state;
  return container;
}
