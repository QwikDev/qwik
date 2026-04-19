import type { JSXOutput } from './types/jsx-node';
import type { JSXChildren } from './types/jsx-qwik-attributes';
import type { Component } from '../component.public';

const SUSPENSE_EXPERIMENTAL_ERROR =
  'Suspense is experimental and must be enabled with `experimental: ["suspense"]` in the `qwikVite` plugin.';

/** @public */
export type SuspenseProps = {
  /** Content shown while the children cursor has been paused longer than `timeout` ms. */
  fallback?: JSXOutput;
  /**
   * Client-only: when `true`, keep the last resolved children visible during later pending updates
   * while also showing the `fallback`.
   */
  showStale?: boolean;
  /**
   * Client-only: ms to wait while the children cursor is paused on a Promise before switching to
   * `fallback`. If omitted, the fallback is never shown.
   */
  timeout?: number;
  children?: JSXChildren;
};

/** @internal */
export const assertSuspenseExperimental = (): void => {
  if (!__EXPERIMENTAL__.suspense) {
    throw new Error(SUSPENSE_EXPERIMENTAL_ERROR);
  }
};

/**
 * Suspense boundary.
 *
 * Handled as a renderer primitive by vnode diff and SSR, similar to `Slot`.
 *
 * @public
 * @experimental
 */
export const Suspense: Component<SuspenseProps> = ((props: SuspenseProps) => {
  assertSuspenseExperimental();
  return props.children as JSXOutput;
}) as Component<SuspenseProps>;
