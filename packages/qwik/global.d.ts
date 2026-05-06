/* eslint-disable no-var */
// Globals used by qwik, for internal use only

type ExperimentalFeatures = import('../qwik-vite/src').ExperimentalFeatures;

declare var __EXPERIMENTAL__: {
  [K in ExperimentalFeatures]: boolean;
};
