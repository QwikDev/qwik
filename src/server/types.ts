import type { OutputEntryMap } from '@builder.io/qwik/optimizer';

/**
 * Partial Global used by Qwik Framework.
 *
 * A set of properties which the Qwik Framework expects to find on global.
 * @public
 */
export interface QwikGlobal extends WindowProxy {
  /**
   * Document used by Qwik during rendering.
   */
  document: QwikDocument;
  location: Location;
}

/**
 * Partial Document used by Qwik Framework.
 *
 * A set of properties which the Qwik Framework expects to find on document.
 * @public
 */
export interface QwikDocument extends Document {}

/**
 * Options when creating a mock Qwik Document object.
 * @public
 */
export interface DocumentOptions {
  url?: string;
  debug?: boolean;
}

/**
 * Options when creating a mock Qwik Global object.
 * @public
 */
export interface GlobalOptions extends DocumentOptions {}

/**
 * @public
 */
export interface SerializeDocumentOptions extends DocumentOptions {
  symbols: QrlMapper | OutputEntryMap | null;
}

/**
 * @public
 */
export interface RenderToStringResult {
  html: string;
  timing: {
    createDocument: number;
    render: number;
    toString: number;
  };
}

/**
 * @public
 */
export interface RenderToDocumentOptions extends SerializeDocumentOptions, DocumentOptions {
  /**
   * Defaults to `true`
   */
  dehydrate?: boolean;
}

/**
 * @public
 */
export interface RenderToStringOptions extends RenderToDocumentOptions {}

/**
 * @public
 */
export interface CreateRenderToStringOptions {
  symbolsPath: string;
}

/**
 * @public
 */
export type RenderToString = (opts: RenderToStringOptions) => Promise<RenderToStringResult>;

/**
 * @public
 */
export type QrlMapper = (path: string, symbol: string) => string;
