import { createSerializationContext } from './index';
import { assertTrue } from '../error/assert';
import type { DeserializeContainer } from '../types';
import { isNode, isElement } from '../utils/element';
import { wrapDeserializerProxy } from './deser-proxy';
import { deserializeData } from './inflate';
import { preprocessState } from './preprocess-state';

/**
 * Serialize data to string using SerializationContext.
 *
 * @param data - Data to serialize
 * @internal
 */

export async function _serialize(data: unknown[]): Promise<string> {
  const serializationContext = createSerializationContext(
    null,
    null,
    () => '',
    () => '',
    () => {},
    new WeakMap<any, any>()
  );

  for (const root of data) {
    serializationContext.$addRoot$(root);
  }
  await serializationContext.$serialize$();
  return serializationContext.$writer$.toString();
}
/**
 * Deserialize data from string to an array of objects.
 *
 * @param rawStateData - Data to deserialize
 * @param element - Container element
 * @internal
 */

export function _deserialize(rawStateData: string | null, element?: unknown): unknown[] {
  if (rawStateData == null) {
    return [];
  }
  const stateData = JSON.parse(rawStateData);
  if (!Array.isArray(stateData)) {
    return [];
  }

  let container: DeserializeContainer | undefined;
  if (isNode(element) && isElement(element)) {
    container = _createDeserializeContainer(stateData, element as HTMLElement);
  } else {
    container = _createDeserializeContainer(stateData);
  }
  const output = [];
  for (let i = 0; i < stateData.length; i += 2) {
    output[i / 2] = deserializeData(container, stateData[i], stateData[i + 1]);
  }
  return output;
}

export function getObjectById(id: number | string, stateData: unknown[]): unknown {
  if (typeof id === 'string') {
    id = parseInt(id, 10);
  }
  assertTrue(id < stateData.length, `Invalid reference ${id} >= ${stateData.length}`);
  return stateData[id];
}

export function _createDeserializeContainer(
  stateData: unknown[],
  element?: HTMLElement
): DeserializeContainer {
  // eslint-disable-next-line prefer-const
  let state: unknown[];
  const container: DeserializeContainer = {
    $getObjectById$: (id: number | string) => getObjectById(id, state),
    getSyncFn: (_: number) => {
      const fn = () => {};
      return fn;
    },
    $storeProxyMap$: new WeakMap(),
    element: null,
    $forwardRefs$: null,
    $initialQRLs$: null,
    $scheduler$: null,
  };
  preprocessState(stateData, container);
  state = wrapDeserializerProxy(container as any, stateData);
  container.$state$ = state;
  if (element) {
    container.element = element;
  }
  return container;
}
