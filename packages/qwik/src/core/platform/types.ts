import type { ValueOrPromise } from '../util/types';

/**
 * @public
 */
export interface CorePlatform {
  /**
   * Dynamic import()
   */
  isServer: boolean;
  /**
   * Dynamic import()
   */
  importSymbol: (element: Element, url: string | URL, symbol: string) => ValueOrPromise<any>;
  /**
   * Platform specific queue, such as process.nextTick() for Node
   * and requestAnimationFrame() for the browser.
   */
  raf: (fn: () => any) => Promise<any>;
  nextTick: (fn: () => any) => Promise<any>;
  /**
   * Takes a qrl and serializes into a string
   */
  chunkForSymbol: (symbolName: string) => [string, string] | undefined;
}
