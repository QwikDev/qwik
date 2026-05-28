import type { Container, ObjToProxyMap } from '../types';

/** @internal */
export interface InnerContainer extends Container {
  $storeProxyMap$: ObjToProxyMap;
  _didAddQwikLoader?: boolean;
}

/** @internal */
export const getRootContainer = (container: Container): Container => {
  const rootContainer = container.$rootContainer$;
  return rootContainer || container;
};

/** @internal */
export const isOutOfOrderSegmentContainer = (container: Container): boolean => {
  return container.$isOutOfOrderSegment$;
};

/** @internal */
export const isSameContainer = (left: Container, right: Container | null): boolean => {
  return getRootContainer(left) === (right ? getRootContainer(right) : null);
};
