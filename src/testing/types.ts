/**
 * Partial Global used by Qwik Framework.
 *
 * A set of properties which the Qwik Framework expects to find on global.
 * @public
 */
export interface MockGlobal extends WindowProxy {
  /**
   * Document used by Qwik during rendering.
   */
  document: MockDocument;
  requestAnimationFrame: MockRequestAnimationFrame;
  cancelAnimationFrame: (handle: number) => void;
}

/**
 * Partial Document used by Qwik Framework.
 *
 * A set of properties which the Qwik Framework expects to find on document.
 * @public
 */
export interface MockDocument extends Document {
  createElement<K extends keyof HTMLElementTagNameMap>(
    tagName: K,
    options?: ElementCreationOptions
  ): HTMLElementTagNameMap[K] & MockHTMLElement;
  createElement(tagName: string, options?: ElementCreationOptions): MockHTMLElement;
  defaultView: (MockGlobal & typeof globalThis) | null;
}

/**
 * Options when creating a mock Qwik Document object.
 * @public
 */
export interface CreateDocumentOptions {
  baseURI?: string;
}

/**
 * Options when creating a mock Qwik Global object.
 * @public
 */
export interface CreateGlobalOptions extends CreateDocumentOptions {}

/**
 * @public
 */
export interface MockRequestAnimationFrame {
  queue: (FrameRequestCallback | null)[];
  flush: () => Promise<void>;
  (callback: FrameRequestCallback): number;
}

export interface MockHTMLElement extends HTMLElement {
  ownerDocument: MockDocument;
}

export interface MockHTMLInputElement extends HTMLInputElement {
  ownerDocument: MockDocument;
}
