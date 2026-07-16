import type { RequestHandler } from '@qwik.dev/router';
import { setImportedLoaderSharedValue } from './loaders-serialization/shared-map';

export const onRequest: RequestHandler = ({ sharedMap }) => {
  setImportedLoaderSharedValue(sharedMap);
};
