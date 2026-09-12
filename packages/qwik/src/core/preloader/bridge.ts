type Preload = (item: string | string[], probability?: number) => void;

type PreloaderGlobal = typeof globalThis & {
  qPreload?: Preload;
};

// Hints issued before the preloader chunk loads must not be lost
let pendingRequests: Parameters<Preload>[] | undefined = [];

/** @internal */
export const requestPreload: Preload = (item, probability) => {
  const preload = (globalThis as PreloaderGlobal).qPreload;
  preload ? preload(item, probability) : pendingRequests?.push([item, probability]);
};

export const setPreloader = (preload: Preload | undefined) => {
  (globalThis as PreloaderGlobal).qPreload = preload;
  if (preload) {
    const buffered = pendingRequests || [];
    for (let i = 0; i < buffered.length; i++) {
      preload(...buffered[i]);
    }
    pendingRequests = undefined;
  }
};
