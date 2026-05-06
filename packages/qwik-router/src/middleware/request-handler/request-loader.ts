import type { SerializationStrategy } from '@qwik.dev/core/internal';
import { getRouteLoaderData } from '../../runtime/src/route-loaders';
import type { LoaderInternal } from '../../runtime/src/types';
import type { RequestEvent, RequestEventLoader } from './types';

export async function getRouteLoaderPromise<
  TRequestEvent extends RequestEvent & RequestEventLoader,
>(
  loader: LoaderInternal,
  loaders: Record<string, unknown>,
  loadersSerializationStrategy: Map<string, SerializationStrategy>,
  requestEv: TRequestEvent
) {
  const loaderId = loader.__id;
  loaders[loaderId] = getRouteLoaderData(loader.__qrl, loader.__validators, requestEv).then(
    (resolvedLoader) => {
      loaders[loaderId] = resolvedLoader;
      return resolvedLoader;
    }
  );
  loadersSerializationStrategy.set(loaderId, loader.__serializationStrategy);
  return loaders[loaderId];
}
