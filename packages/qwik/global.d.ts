/* eslint-disable no-var */
// Globals used by qwik, for internal use only

type ExperimentalFeatures = import('../qwik-vite/src').ExperimentalFeatures;

declare var __EXPERIMENTAL__: {
  [K in ExperimentalFeatures]: boolean;
};

// Resolve the platform entry before generated declarations exist.
declare module '@qwik.dev/core/async-local-storage' {
  export const getAsyncLocalStorage: typeof import('./src/core/shared/platform/async-local-storage').getAsyncLocalStorage;
}
