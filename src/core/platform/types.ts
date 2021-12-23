import type { QRL } from '..';

/**
 * @public
 */
export interface CorePlatform {
  /**
   * Dynamic import()
   */
  importSymbol: (element: Element, url: string | QRL | URL) => Promise<any>;
  /**
   * Platform specific queue, such as process.nextTick() for Node
   * and requestAnimationFrame() for the browser.
   */
  queueRender: (renderMarked: (doc: Document) => Promise<any>) => Promise<any>;
  /**
   * Platform specific queue, such as process.nextTick() for Node
   * and requestAnimationFrame() for the browser.
   */
  queueStoreFlush: (flushStore: (doc: Document) => Promise<any>) => Promise<any>;
}
