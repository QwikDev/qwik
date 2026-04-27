import { createSerializationContext } from './index';
import { assertTrue } from '../error/assert';
import type { DeserializeContainer } from '../types';
import { wrapDeserializerProxy } from './deser-proxy';
import { eagerDeserializeStateIterator } from './inflate';
import { preprocessState } from './preprocess-state';
import { isDev } from '@qwik.dev/core/build';
import {
  createMacroTask,
  runYieldingIterator,
  scheduleYieldingIterator,
  type YieldingIteratorState,
} from '../platform/next-tick';

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
 * Deserialize data from string.
 *
 * @param rawStateData - Data to deserialize
 * @internal
 */

export async function _deserialize<T>(rawStateData: string): Promise<T> {
  if (rawStateData == null) {
    throw new Error('No state data to deserialize');
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

const runDeserializeIterator = <T>(iterator: Generator<void, T, void>): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const state: YieldingIteratorState<T> = {
      $iterator$: iterator,
      $schedule$: undefined!,
      $scheduled$: false,
    };
    const schedule = createMacroTask(() =>
      runYieldingIterator(
        state,
        () => true,
        (value) => {
          schedule.$destroy$?.();
          resolve(value);
        },
        (error) => {
          schedule.$destroy$?.();
          reject(error);
        },
        undefined,
        false
      )
    );
    state.$schedule$ = schedule;
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
