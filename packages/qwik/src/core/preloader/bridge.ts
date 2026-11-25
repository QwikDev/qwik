type Preload = (item: string | string[], priority?: number, isPageToRender?: boolean) => void;

export type PreloaderGlobal = typeof globalThis & {
  qPreload?: Preload;
  /** Hints sent before the preloader loaded; shared by core, qwikloader and the preloader. */
  qPreloadQueue?: Parameters<Preload>[];
};

/** @internal */
export const requestPreload: Preload = (...hint) => {
  const g = globalThis as PreloaderGlobal;
  g.qPreload ? g.qPreload(...hint) : (g.qPreloadQueue ||= []).push(hint);
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
