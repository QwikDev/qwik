/**
 * @public
 */
export interface CorePlatform {
  /**
   * Dynamic import()
   */
  import: (url: string) => Promise<any>;
  /**
   * Step to modify a dynamic import's path, such as adding .js, .mjs, or .cjs
   */
  toPath: (url: URL) => string;
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
