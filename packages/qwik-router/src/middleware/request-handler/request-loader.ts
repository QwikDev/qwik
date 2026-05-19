import type { QRL } from '@qwik.dev/core';
import { _verifySerializable, isDev, type SerializationStrategy } from '@qwik.dev/core/internal';
import type { DataValidator, LoaderInternal, ValidatorReturn } from '../../runtime/src/types';
import type { RequestEvent, RequestEventBase, RequestEventLoader } from './types';

export async function getRouteLoaderPromise<
  TRequestEvent extends RequestEvent & RequestEventLoader,
>(
  loader: LoaderInternal,
  loaders: Record<string, unknown>,
  loadersSerializationStrategy: Map<string, SerializationStrategy>,
  requestEv: TRequestEvent
) {
  const loaderId = loader.__id;
  loaders[loaderId] = runValidators(
    requestEv,
    loader.__validators,
    undefined // data
  )
    .then((res) => {
      if (res.success) {
        if (isDev) {
          return measure<Promise<unknown>>(requestEv, loader.__qrl.getHash(), () =>
            loader.__qrl.call(requestEv, requestEv)
          );
        } else {
          return loader.__qrl.call(requestEv, requestEv);
        }
      } else {
        return requestEv.fail(res.status ?? 500, res.error);
      }
    })
    .then((resolvedLoader) => {
      if (typeof resolvedLoader === 'function') {
        loaders[loaderId] = resolvedLoader();
      } else {
        if (isDev) {
          verifySerializable(resolvedLoader, loader.__qrl);
        }
        loaders[loaderId] = resolvedLoader;
      }
      return resolvedLoader;
    });
  loadersSerializationStrategy.set(loaderId, loader.__serializationStrategy);
  return loaders[loaderId];
}

async function runValidators(
  requestEv: RequestEvent,
  validators: DataValidator[] | undefined,
  data: unknown
) {
  let lastResult: ValidatorReturn = {
    success: true,
    data,
  };
  if (validators) {
    for (const validator of validators) {
      if (isDev) {
        lastResult = await measure(requestEv, `validator$`, () =>
          validator.validate(requestEv, data)
        );
      } else {
        lastResult = await validator.validate(requestEv, data);
      }
      if (!lastResult.success) {
        return lastResult;
      } else {
        data = lastResult.data;
      }
    }
  }
  return lastResult;
}

function verifySerializable(data: any, qrl: QRL) {
  try {
    _verifySerializable(data, undefined);
  } catch (e: any) {
    if (e instanceof Error && qrl.dev) {
      (e as any).loc = qrl.dev;
    }
    throw e;
  }
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : 0;
}

async function measure<T>(
  requestEv: RequestEventBase,
  name: string,
  fn: () => T
): Promise<Awaited<T>> {
  const start = now();
  try {
    return await fn();
  } finally {
    const duration = now() - start;
    let measurements = requestEv.sharedMap.get('@serverTiming');
    if (!measurements) {
      requestEv.sharedMap.set('@serverTiming', (measurements = []));
    }
    measurements.push([name, duration]);
  }
}
