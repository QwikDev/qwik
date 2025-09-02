import type { CorePlatform } from '@qwik.dev/core';

/** @public */
export interface MockDocument extends Document {}

/** @public */
export interface MockWindow extends Window {
  document: MockDocument;
}

/**
 * Options when creating a mock Qwik Document object.
 *
 * @public
 */
export interface MockDocumentOptions {
  url?: URL | string;
  html?: string;
}

/**
 * Options when creating a mock Qwik Window object.
 *
 * @public
 */
export interface MockWindowOptions extends MockDocumentOptions {}

/** @public */
export interface TestPlatform extends CorePlatform {
  /**
   * @deprecated No longer used, please use {@link waitForDrain} instead.
   * @example With `ssrRenderToDom`
   *
   * ```ts
   * import { waitForDrain } from '@qwik.dev/testing';
   *
   * const { container } = ssrRenderToDom(...);
   * await waitForDrain(container);
   * ```
   *
   * @example With `domRender`
   *
   * ```ts
   * import { waitForDrain } from '@qwik.dev/testing';
   *
   * const { container } = domRender(...);
   * await waitForDrain(container);
   * ```
   */
  flush: () => Promise<void>;
}
