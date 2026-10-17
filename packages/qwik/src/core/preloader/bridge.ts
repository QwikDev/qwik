type Preload = (item: string | string[], probability?: number) => void;

type PreloaderGlobal = typeof globalThis & {
  qPreload?: Preload;
  /** Hints sent before the preloader loaded; shared by core's and the preloader's copy. */
  qPreloadQueue?: Parameters<Preload>[];
};

/** @internal */
export const requestPreload: Preload = (item, probability) => {
  const g = globalThis as PreloaderGlobal;
  g.qPreload ? g.qPreload(item, probability) : (g.qPreloadQueue ||= []).push([item, probability]);
};

export const setPreloader = (preload: Preload | undefined) => {
  const g = globalThis as PreloaderGlobal;
  g.qPreload = preload;
  const buffered = g.qPreloadQueue;
  if (preload && buffered) {
    g.qPreloadQueue = undefined;
    for (let i = 0; i < buffered.length; i++) {
      preload(...buffered[i]);
    }
  }
};
