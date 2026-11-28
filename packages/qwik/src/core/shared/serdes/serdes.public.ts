import { assertTrue } from '../error/assert';
import type { DeserializeContainer } from '../types';
import { BinaryStateReader, isBinaryState } from './binary-state';
import { qTest } from '../utils/qdev';
import { wrapBinaryStateProxy, wrapDeserializerProxy } from './deser-proxy';
import { eagerDeserializeStateIterator } from './inflate';
import { preprocessState } from './preprocess-state';
import { isDev } from '@qwik.dev/core/build';
import {
  createYieldingIteratorState,
  scheduleYieldingIterator,
} from '../../client/yielding-iterator';

/**
 * Deserialize data from string.
 *
 * @param rawStateData - Data to deserialize
 * @internal
 */

export async function _deserialize<T>(rawStateData: string): Promise<T> {
  if (rawStateData == null) {
    throw new Error('No state data to deserialize');
  }
  if (__EXPERIMENTAL__.binaryState && (!qTest || isBinaryState(rawStateData))) {
    return deserializeBinary<T>(rawStateData);
  }
  const stateData = JSON.parse(rawStateData);
  if (!Array.isArray(stateData) || stateData.length < 2 || typeof stateData[0] !== 'number') {
    throw new Error('Invalid state data');
  }

  const state = Array(stateData.length / 2);
  const container = createBaseDeserializeContainer(stateData, () => state);
  container.$state$ = state;
  await runDeserializeIterator(eagerDeserializeStateIterator(container, stateData, state));
  return state[0] as T;
}

const deserializeBinary = <T>(stateScript: string): T => {
  if (!isBinaryState(stateScript)) {
    throw new Error('Invalid state data');
  }
  const reader = new BinaryStateReader(stateScript);
  const container: DeserializeContainer = {
    $getObjectById$: (id: number | string) => getObjectById(id, state),
    $getForwardRef$: (id: number | string) => reader.$forwardRefs$?.[Number(id)],
    getSyncFn: (_: number) => () => {},
    $storeProxyMap$: new WeakMap(),
    element: null,
    $forwardRefs$: reader.$forwardRefs$,
  };
  if (reader.$rootEnds$.length === 0) {
    throw new Error('Invalid state data');
  }
  // Only the first root is wanted, so nothing is restored or released in the background.
  const state = wrapBinaryStateProxy(container as any, reader, false);
  return state[0] as T;
};

const runDeserializeIterator = <T>(iterator: Generator<void, T, void>): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const state = createYieldingIteratorState(iterator, resolve, reject);
    scheduleYieldingIterator(state);
  });
};

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
export function _createDeserializeContainer(stateData: unknown[]): DeserializeContainer {
  // eslint-disable-next-line prefer-const
  let state: unknown[];
  const container = createBaseDeserializeContainer(stateData, () => state);
  state = wrapDeserializerProxy(container as any, stateData);
  container.$state$ = state;
  return container;
}

function createBaseDeserializeContainer(
  stateData: unknown[],
  getState: () => unknown[]
): DeserializeContainer {
  const container: DeserializeContainer = {
    $getObjectById$: (id: number | string) => getObjectById(id, getState()),
    $getForwardRef$: (id: number | string) => container.$forwardRefs$?.[Number(id)],
    getSyncFn: (_: number) => {
      const fn = () => {};
      return fn;
    },
    $storeProxyMap$: new WeakMap(),
    element: null,
    $forwardRefs$: null,
  };
  preprocessState(stateData, container);
  return container;
}
