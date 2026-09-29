import type { RequestEventCommon } from './types';

const FailureSegments = '@failureSegments';

export const PLUGIN_SEGMENT = -1;

const PASSED_THROUGH = null;

type FailureSegmentMap = WeakMap<object, number | typeof PASSED_THROUGH>;

export const toRouteSegment = (requestEv: RequestEventCommon, segment: number): number =>
  segment === PLUGIN_SEGMENT
    ? requestEv.basePathname.split('/').filter((part) => part.length > 0).length
    : segment;

const recordFailure = (
  requestEv: RequestEventCommon,
  error: Error,
  segment: number | typeof PASSED_THROUGH
) => {
  let failures = requestEv.sharedMap.get(FailureSegments) as FailureSegmentMap | undefined;
  if (!failures) {
    requestEv.sharedMap.set(FailureSegments, (failures = new WeakMap()));
  }
  if (!failures.has(error)) {
    failures.set(error, segment);
  }
};

export const placeFailure = (requestEv: RequestEventCommon, error: unknown, segment: number) => {
  if (error instanceof Error) {
    recordFailure(requestEv, error, toRouteSegment(requestEv, segment));
  }
};

export const markPassedThrough = (requestEv: RequestEventCommon, error: unknown) => {
  if (error instanceof Error) {
    recordFailure(requestEv, error, PASSED_THROUGH);
  }
};

export const getFailureSegment = (
  requestEv: RequestEventCommon,
  error: unknown
): number | undefined =>
  (requestEv.sharedMap.get(FailureSegments) as FailureSegmentMap | undefined)?.get(
    error as object
  ) ?? undefined;
