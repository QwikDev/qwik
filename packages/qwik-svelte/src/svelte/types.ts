import type { PropFunction, Signal } from "@builder.io/qwik";

export interface QwikifyBase {
  /**
   * The component eagerly hydrates when the document loads.
   *
   * **Use case:** Immediately-visible UI elements that need to be interactive as soon as possible.
   */
  "client:load"?: boolean;

  /**
   * The component eagerly hydrates when the browser first become idle,
   * ie, when everything important as already run before.
   *
   * **Use case:** Lower-priority UI elements that don’t need to be immediately interactive.
   */
  "client:idle"?: boolean;

  /**
   * The component eagerly hydrates when it becomes visible in the viewport.
   *
   * **Use case:** Low-priority UI elements that are either far down the page
   * (“below the fold”) or so resource-intensive to load that
   * you would prefer not to load them at all if the user never saw the element.
   */
  "client:visible"?: boolean;

  /**
   * The component eagerly hydrates when the mouse is over the component.
   *
   * **Use case:** Lowest-priority UI elements which interactivity is not crucial, and only needs to run in desktop.
   */
  "client:hover"?: boolean;

  /**
   * When `true`, the component will not run in SSR, only in the browser.
   */
  "client:only"?: boolean;

  /**
   * This is an advanced API that allows to hydrate the component whenever
   * the passed signal becomes `true`.
   *
   * This effectively allows you to implement custom strategies for hydration.
   */
  "client:signal"?: Signal<boolean>;

  /**
   * The component eagerly hydrates when specified DOM events are dispatched.
   */
  "client:event"?: string | string[];

  /**
   * Adds a `click` event listener to the host element, this event will be dispatched even if the react component is not hydrated.
   */
  "host:onClick$"?: PropFunction<(ev: Event) => void>;

  /**
   * Adds a `blur` event listener to the host element, this event will be dispatched even if the react component is not hydrated.
   */
  "host:onBlur$"?: PropFunction<(ev: Event) => void>;

  /**
   * Adds a `focus` event listener to the host element, this event will be dispatched even if the react component is not hydrated.
   */
  "host:onFocus$"?: PropFunction<(ev: Event) => void>;

  /**
   * Adds a `mouseover` event listener to the host element, this event will be dispatched even if the react component is not hydrated.
   */
  "host:onMouseOver$"?: PropFunction<(ev: Event) => void>;

  children?: any;
}

export type TransformProps<PROPS extends {}> = {
  [K in keyof PROPS as TransformKey<K>]: TransformProp<K, PROPS[K]>;
};

export type TransformKey<K extends string | number | symbol> =
  K extends `on${string}` ? `${K}$` : K;

export type TransformProp<
  K extends string | number | symbol,
  V
> = K extends `on${string}`
  ? V extends Function
    ? PropFunction<V>
    : never
  : V;

export type QwikifyProps<PROPS extends {}> = TransformProps<PROPS> &
  QwikifyBase;

export interface QwikifyOptions {
  tagName?: string;
  eagerness?: "load" | "visible" | "idle" | "hover";
  event?: string | string[];
  clientOnly?: boolean;
}
