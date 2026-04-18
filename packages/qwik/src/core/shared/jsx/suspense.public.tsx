import type { JSXOutput } from './types/jsx-node';
import type { JSXChildren } from './types/jsx-qwik-attributes';
import type { Component } from '../component.public';

/** @public */
export type SuspenseProps = {
  /** Content shown while the children cursor has been paused longer than `timeout` ms. */
  fallback?: JSXOutput;
  /**
   * Client-only: ms to wait while the children cursor is paused on a Promise before switching to
   * `fallback`. If omitted, the fallback is never shown.
   */
  timeout?: number;
  children?: JSXChildren;
};

/**
 * Suspense boundary.
 *
 * Handled as a renderer primitive by vnode diff and SSR, similar to `Slot`.
 *
 * @public
 */
export const Suspense: Component<SuspenseProps> = ((props: SuspenseProps) => {
  return props.children as JSXOutput;
}) as Component<SuspenseProps>;
