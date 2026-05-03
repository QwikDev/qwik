// @ts-expect-error we don't have types for the preloader
import { p as preload } from '@qwik.dev/core/preloader';
import type { DeserializeContainer } from '../types';
import { TypeIds } from './constants';

/**
 * Preprocess the state data to:
 *
 * - Replace RootRef with the actual object
 * - Create a map for forward refs
 * - Create an array of indexes for initial QRLs
 *
 * Before:
 *
 * ```
 * 0 Object [
 *   String "foo"
 *   Object [
 *     String "shared"
 *     Number 1
 *   ]
 * ]
 * 1 Object [
 *   String "bar"
 *   RootRef 2
 * ]
 * 2 RootRef "0 1"
 * (59 chars)
 * ```
 *
 * After:
 *
 * ```
 * 0 Object [
 *   String "foo"
 *   RootRef 2
 * ]
 * 1 Object [
 *   String "bar"
 *   RootRef 2
 * ]
 * 2 Object [
 *   String "shared"
 *   Number 1
 * ]
 * (55 chars)
 * ```
 *
 * @param data - The state data to preprocess
 * @returns The preprocessed state data
 * @internal
 */

export function preprocessState(
  data: unknown[],
  container: DeserializeContainer,
  segmentId?: string
) {
  const isRootDeepRef = (type: TypeIds, value: unknown) => {
    return type === TypeIds.RootRef && typeof value === 'string' && value.indexOf(' ') !== -1;
  };

  const isForwardRefsMap = (type: TypeIds) => {
    return type === TypeIds.ForwardRefs;
  };

  const getSegmentAndIndex = (value: string) => {
    const segmentSeparator = __EXPERIMENTAL__.suspense ? value.indexOf(':') : -1;
    if (segmentSeparator === -1) {
      return {
        segment: __EXPERIMENTAL__.suspense ? segmentId : undefined,
        index: parseInt(value, 10),
      };
    }
    return {
      segment: value.slice(0, segmentSeparator),
      index: parseInt(value.slice(segmentSeparator + 1), 10),
    };
  };

  const processRootRef = (index: number) => {
    const rootRefPath = (data[index + 1] as string).split(' ');
    const firstRef = getSegmentAndIndex(rootRefPath[0]);
    const normalizedSegmentId = firstRef.segment;
    let object: unknown[] | number | string = data;
    let objectType: TypeIds = TypeIds.RootRef;
    let typeIndex = 0;
    let valueIndex = 0;
    let parent: unknown[] | null = null;

    for (let i = 0; i < rootRefPath.length; i++) {
      parent = object as unknown[];

      typeIndex = (i === 0 ? firstRef.index : parseInt(rootRefPath[i], 10)) * 2;
      valueIndex = typeIndex + 1;

      const objectArray = object as unknown[];
      objectType = objectArray[typeIndex] as TypeIds;
      object = objectArray[valueIndex] as unknown[];

      if (objectType === TypeIds.RootRef) {
        const rootRef =
          typeof object === 'string'
            ? getSegmentAndIndex(object).index
            : (object as unknown as number);
        const rootRefTypeIndex = rootRef * 2;
        objectType = data[rootRefTypeIndex] as TypeIds;
        object = data[rootRefTypeIndex + 1] as unknown[];
      }
    }

    if (parent) {
      parent[typeIndex] = TypeIds.RootRef;
      parent[valueIndex] =
        __EXPERIMENTAL__.suspense && normalizedSegmentId
          ? `${normalizedSegmentId}:${index / 2}`
          : index / 2;
    }
    data[index] = objectType;
    data[index + 1] = object;
  };

  for (let i = 0; i < data.length; i += 2) {
    if (isRootDeepRef(data[i] as TypeIds, data[i + 1])) {
      processRootRef(i);
    } else if (isForwardRefsMap(data[i] as TypeIds)) {
      container.$forwardRefs$ = data[i + 1] as Array<number | string>;
    }
  }
}
