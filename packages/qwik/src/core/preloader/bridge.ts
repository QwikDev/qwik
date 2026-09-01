type Preload = (item: string | string[], probability?: number) => void;

type PreloaderGlobal = typeof globalThis & {
  qPreload?: Preload;
};

/** @internal */
export const requestPreload: Preload = (item, probability) => {
  (globalThis as PreloaderGlobal).qPreload?.(item, probability);
};

export const setPreloader = (preload: Preload | undefined) => {
  (globalThis as PreloaderGlobal).qPreload = preload;
};
