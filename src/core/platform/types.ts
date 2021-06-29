/**
 * @public
 */
export interface CorePlatform {
  /**
   * Dynamic import()
   */
  import?: (url: string) => Promise<any>;
  /**
   * Step to modify a dynamic import's path, such as adding .js, .mjs, or .cjs
   */
  toPath?: (url: URL) => string;
}
