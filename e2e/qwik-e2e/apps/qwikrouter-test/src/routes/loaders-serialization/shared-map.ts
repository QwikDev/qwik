export const IMPORTED_LOADER_SHARED_KEY = 'imported-loader-shared-value';

export const setImportedLoaderSharedValue = (sharedMap: Map<string, unknown>) => {
  sharedMap.set(IMPORTED_LOADER_SHARED_KEY, {
    value: 'shared loader value',
  });
};
