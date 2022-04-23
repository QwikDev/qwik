import type { SymbolsEntryMap } from '../optimizer/src';

/**
 * Partial Window used by Qwik Framework.
 *
 * A set of properties which the Qwik Framework expects to find on global.
 * @public
 */
export interface QwikWindow extends WindowProxy {
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
  url?: URL | string;
  html?: string;
  debug?: boolean;
}

/**
 * Options when creating a mock Qwik Window object.
 * @public
 */
export interface WindowOptions extends DocumentOptions {}

/**
 * @public
 */
export interface SerializeDocumentOptions extends DocumentOptions {
  symbols?: ServerOutputSymbols;
}

/**
 * @public
 */
export type ServerOutputSymbols = QrlMapper | SymbolsEntryMap | null;

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
  snapshot?: boolean;

  /**
   * Specifies the root of the JS files of the client build.
   * Setting a base, will cause the render of the `q:base` attribute in the `q:container` element.
   */
  base?: string;

  /**
   * Specifies if the Qwik Loader script is added to the document or not. Defaults to `{ include: true }`.
   */
  qwikLoader?: { events?: string[]; include?: boolean };
}

/**
 * @public
 */
export interface RenderToStringOptions extends RenderToDocumentOptions {
  /**
   * When set, the app is serialized into a fragment. And the returned html is not a complete document.
   * Defaults to `undefined`
   */
  fragmentTagName?: string;
}

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
export type QrlMapper = (symbolName: string) => string | undefined;
