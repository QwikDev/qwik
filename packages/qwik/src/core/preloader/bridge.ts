type Preload = (item: string | string[], probability?: number) => void;

type PreloaderGlobal = typeof globalThis & {
  qPreload?: Preload;
  qPreloadQueue?: Parameters<Preload>[];
};

/** @internal */
export const requestPreload: Preload = (item, probability) => {
  const runtime = globalThis as PreloaderGlobal;
  runtime.qPreload
    ? runtime.qPreload(item, probability)
    : (runtime.qPreloadQueue ||= []).push([item, probability]);
};

export const setPreloader = (preload: Preload | undefined) => {
  const runtime = globalThis as PreloaderGlobal;
  runtime.qPreload = preload;
  const buffered = runtime.qPreloadQueue;
  if (preload && buffered) {
    runtime.qPreloadQueue = undefined;
    for (let i = 0; i < buffered.length; i++) {
      preload(...buffered[i]);
    }
  }
};
