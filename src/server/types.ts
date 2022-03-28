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
  url?: URL | string;
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
  snapshot?: boolean;

  /**
   * Specifies the root of the JS files of the client build.
   * Setting a base, will cause the render of the `q:base` attribute in the `q:container` element.
   */
  base?: string;
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
