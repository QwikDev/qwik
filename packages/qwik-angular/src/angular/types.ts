import type { EventEmitter } from '@angular/core';
import type { PropFunction, Signal } from '@builder.io/qwik';
import type { ClientRenderer } from './client';

export interface Internal {
  renderer: ClientRenderer;
}

export interface QwikifyBase {
  /**
   * The component eagerly hydrates when the document loads.
   *
   * **Use case:** Immediately-visible UI elements that need to be interactive as soon as possible.
   */
  'client:load'?: boolean;

  /**
   * The component eagerly hydrates when the browser first become idle,
   * ie, when everything important as already run before.
   *
   * **Use case:** Lower-priority UI elements that don’t need to be immediately interactive.
   */
  'client:idle'?: boolean;

  /**
   * The component eagerly hydrates when it becomes visible in the viewport.
   *
   * **Use case:** Low-priority UI elements that are either far down the page
   * (“below the fold”) or so resource-intensive to load that
   * you would prefer not to load them at all if the user never saw the element.
   */
  'client:visible'?: boolean;

  /**
   * The component eagerly hydrates when the mouse is over the component.
   *
   * **Use case:** Lowest-priority UI elements which interactivity is not crucial, and only needs to run in desktop.
   */
  'client:hover'?: boolean;

  /**
   * When `true`, the component will not run in SSR, only in the browser.
   */
  'client:only'?: boolean;

  /**
   * This is an advanced API that allows to hydrate the component whenever
   * the passed signal becomes `true`.
   *
   * This effectively allows you to implement custom strategies for hydration.
   */
  'client:signal'?: Signal<boolean>;

  /**
   * The component eagerly hydrates when specified DOM events are dispatched.
   */
  'client:event'?: string | string[];

  /**
   * Adds a `click` event listener to the host element, this event will be dispatched even if the component is not hydrated.
   */
  'host:onClick$'?: PropFunction<(ev: Event) => void>;

  /**
   * Adds a `blur` event listener to the host element, this event will be dispatched even if the component is not hydrated.
   */
  'host:onBlur$'?: PropFunction<(ev: Event) => void>;

  /**
   * Adds a `focus` event listener to the host element, this event will be dispatched even if the component is not hydrated.
   */
  'host:onFocus$'?: PropFunction<(ev: Event) => void>;

  /**
   * Adds a `mouseover` event listener to the host element, this event will be dispatched even if the component is not hydrated.
   */
  'host:onMouseOver$'?: PropFunction<(ev: Event) => void>;
}

export type QwikifyProps<PROPS extends Record<string, any>> = PROPS & QwikifyBase;

export interface QwikifyOptions {
  tagName?: string;
  eagerness?: 'load' | 'visible' | 'idle' | 'hover';
  event?: string | string[];
  clientOnly?: boolean;
}

type TransformKey<K> = K extends string ? `${K}$` : K;

type QwikifiedOutputs<ComponentType, Props extends keyof ComponentType> = {
  [K in keyof Pick<ComponentType, Props> as TransformKey<K>]: ComponentType[K] extends EventEmitter<
    infer V
  >
    ? (value: V) => void
    : never;
};

// using "/@" instead of "@" in JSDoc because it's not rendering properly https://github.com/microsoft/TypeScript/issues/47679
/**
 * Assembles a type object for qwikified Angular component
 *
 * @example
 * ```
 * /@Component({..})
 * export class InputComponent {
 *   /@Input() theme: 'primary' | 'accent' | 'warn' = 'primary';
 *   /@Input() placeholder: string;
 *   /@Output() changed = new EventEmitter<string>();
 * }
 *
 * type InputComponentInputs = 'theme' | 'placeholder';
 *
 * type InputComponentOutputs = 'changed';
 *
 * // InputComponentProps is the interface that you can export along with your qwikified component to be used elsewhere
 * export type InputComponentProps = QwikifiedComponentProps<
 *   InputComponent,
 *   InputComponentInputs, // inputs of the "InputComponent"
 *   InputComponentProps // outputs of the "InputComponent"
 * >;
 *
 * // The final type will look like
 * interface FinalInputTypeSample {
 *   theme?: 'primary' | 'accent' | 'warn';
 *   placeholder?: string;
 *   changed$?: (value: string) => void; // notice that "changed" output got a "$" suffix!
 * }
 * // qwikify it later as follows
 * export const MyNgInput = qwikify$<InputComponentProps>(InputComponent);
 *
 * // additionally you can mark types as required
 * type RequiredInputProps = 'theme';
 * export type RequiredInputComponentProps = WithRequiredProps<InputComponentProps, RequiredInputProps>;
 *
 * // The assembled type will have "theme" as a required property this time
 * interface FinalInputTypeRequiredSample {
 *   theme: 'primary' | 'accent' | 'warn'; // <= became required!
 *   placeholder?: string;
 *   changed$?: (value: string) => void;
 * }
 * ```
 */
export type QwikifiedComponentProps<
  ComponentType,
  Inputs extends keyof ComponentType = never,
  Outputs extends keyof ComponentType = never
> = Partial<Pick<ComponentType, Inputs> & QwikifiedOutputs<ComponentType, Outputs>>;

/**
 * Marks provided keys `K` of type `T` as required
 * @example
 * ```
 * interface MyOptionalType {
 *   propOne?: string;
 *   propTwo?: number
 *   propThree?: string[]
 * }
 * type RequiredProps = 'propOne' | 'propThree';
 * type MyRequiredType = WithRequiredProps<MyOptionalType, RequiredProps>;
 *
 * // final type will look like this
 * interface FinalInterface {
 *   propOne: string; // <= became required
 *   propTwo?: number;
 *   propThree: string[]; // <= became required
 * }
 * ```
 */
export type WithRequiredProps<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;
