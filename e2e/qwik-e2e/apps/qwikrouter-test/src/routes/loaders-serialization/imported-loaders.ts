import { routeLoader$ } from '@qwik.dev/router';
import { IMPORTED_LOADER_SHARED_KEY } from './shared-map';

export const useImportedNeverLoader = routeLoader$(({ sharedMap }) => {
  return sharedMap.get(IMPORTED_LOADER_SHARED_KEY) as { value: string };
});

export const useImportedAlwaysLoader = routeLoader$(
  ({ sharedMap }) => {
    return sharedMap.get(IMPORTED_LOADER_SHARED_KEY) as { value: string };
  },
  { serializationStrategy: 'always' }
);
