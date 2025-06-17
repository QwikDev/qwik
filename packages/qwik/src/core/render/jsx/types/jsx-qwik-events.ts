import type { AllEventKeys } from './jsx-qwik-attributes';

/** Emitted by qwik-loader when an element becomes visible. Used by `useVisibleTask$` @public */
export type QwikVisibleEvent = CustomEvent<IntersectionObserverEntry>;
/** Emitted by qwik-loader when a module was lazily loaded @public */
export type QwikSymbolEvent = CustomEvent<{
  symbol: string;
  element: Element;
  reqTime: number;
  qBase?: string;
  qManifest?: string;
  qVersion?: string;
  href?: string;
}>;
/** Emitted by qwik-loader on document when the document first becomes interactive @public */
export type QwikInitEvent = CustomEvent<{}>;
/** Emitted by qwik-loader on document when the document first becomes idle @public */
export type QwikIdleEvent = CustomEvent<{}>;
/** Emitted by qwik-core on document when the a view transition start @public */
export type QwikViewTransitionEvent = CustomEvent<ViewTransition>;
/** Emitted by qwik-loader on document when there was an error loading a module @public */
export type QwikErrorEvent = CustomEvent<
  {
    importError?: 'sync' | 'async' | 'no-symbol';
    error: unknown;
  } & QwikSymbolEvent['detail']
>;

// Utility types for supporting autocompletion in union types

/** Matches any primitive value. */
export type Primitive = null | undefined | string | number | boolean | symbol | bigint;

/**
 * Allows creating a union type by combining primitive types and literal types without sacrificing
 * auto-completion in IDEs for the literal type part of the union.
 *
 * This type is a workaround for Microsoft/TypeScript#29729. It will be removed as soon as it's not
 * needed anymore.
 *
 * Example:
 *
 * ```ts
 * // Before
 * type Pet = 'dog' | 'cat' | string;
 *
 * const pet: Pet = '';
 * // Start typing in your TypeScript-enabled IDE.
 * // You **will not** get auto-completion for `dog` and `cat` literals.
 *
 * // After
 * type Pet2 = LiteralUnion<'dog' | 'cat', string>;
 *
 * const pet: Pet2 = '';
 * // You **will** get auto-completion for `dog` and `cat` literals.
 * ```
 */
export type LiteralUnion<LiteralType, BaseType extends Primitive> =
  | LiteralType
  | (BaseType & Record<never, never>);

/**
 * The names of events that Qwik knows about. They are all lowercase, but on the JSX side, they are
 * PascalCase for nicer DX. (`onAuxClick$` vs `onauxclick$`)
 *
 * @public
 */
export type KnownEventNames = LiteralUnion<AllEventKeys, string>;

// Deprecated old types
export type SyntheticEvent<T = Element, E = Event> = E & { target: EventTarget & T };
/** @public @deprecated Use `AnimationEvent` and use the second argument to the handler function for the current event target */
export type NativeAnimationEvent = AnimationEvent;
/** @public @deprecated Use `ClipboardEvent` and use the second argument to the handler function for the current event target */
export type NativeClipboardEvent = ClipboardEvent;
/** @public @deprecated Use `CompositionEvent` and use the second argument to the handler function for the current event target */
export type NativeCompositionEvent = CompositionEvent;
/** @public @deprecated Use `DragEvent` and use the second argument to the handler function for the current event target */
export type NativeDragEvent = DragEvent;
/** @public @deprecated Use `FocusEvent` and use the second argument to the handler function for the current event target */
export type NativeFocusEvent = FocusEvent;
/** @public @deprecated Use `KeyboardEvent` and use the second argument to the handler function for the current event target */
export type NativeKeyboardEvent = KeyboardEvent;
/** @public @deprecated Use `MouseEvent` and use the second argument to the handler function for the current event target */
export type NativeMouseEvent = MouseEvent;
/** @public @deprecated Use `TouchEvent` and use the second argument to the handler function for the current event target */
export type NativeTouchEvent = TouchEvent;
/** @public @deprecated Use `PointerEvent` and use the second argument to the handler function for the current event target */
export type NativePointerEvent = PointerEvent;
/** @public @deprecated Use `TransitionEvent` and use the second argument to the handler function for the current event target */
export type NativeTransitionEvent = TransitionEvent;
/** @public @deprecated Use `UIEvent` and use the second argument to the handler function for the current event target */
export type NativeUIEvent = UIEvent;
/** @public @deprecated Use `WheelEvent` and use the second argument to the handler function for the current event target */
export type NativeWheelEvent = WheelEvent;
/** @public @deprecated Use `AnimationEvent` and use the second argument to the handler function for the current event target */
export type QwikAnimationEvent<T = Element> = NativeAnimationEvent;
/** @public @deprecated Use `ClipboardEvent` and use the second argument to the handler function for the current event target */
export type QwikClipboardEvent<T = Element> = NativeClipboardEvent;
/** @public @deprecated Use `CompositionEvent` and use the second argument to the handler function for the current event target */
export type QwikCompositionEvent<T = Element> = NativeCompositionEvent;
/** @public @deprecated Use `DragEvent` and use the second argument to the handler function for the current event target */
export type QwikDragEvent<T = Element> = NativeDragEvent;
/** @public @deprecated Use `PointerEvent` and use the second argument to the handler function for the current event target */
export type QwikPointerEvent<T = Element> = NativePointerEvent;
/** @public @deprecated Use `FocusEvent` and use the second argument to the handler function for the current event target */
export type QwikFocusEvent<T = Element> = NativeFocusEvent;
/** @public @deprecated Use `SubmitEvent` and use the second argument to the handler function for the current event target */
export type QwikSubmitEvent<T = Element> = SubmitEvent;
/** @public @deprecated Use `Event` and use the second argument to the handler function for the current event target */
export type QwikInvalidEvent<T = Element> = Event;
/** @public @deprecated Use `Event` and use the second argument to the handler function for the current event target. Also note that in Qwik, onInput$ with the InputEvent is the event that behaves like onChange in React. */
export type QwikChangeEvent<T = Element> = Event;
/** @public @deprecated Use `KeyboardEvent` and use the second argument to the handler function for the current event target */
export type QwikKeyboardEvent<T = Element> = NativeKeyboardEvent;
/** @public @deprecated Use `MouseEvent` and use the second argument to the handler function for the current event target */
export type QwikMouseEvent<T = Element, E = NativeMouseEvent> = E;
/** @public @deprecated Use `TouchEvent` and use the second argument to the handler function for the current event target */
export type QwikTouchEvent<T = Element> = NativeTouchEvent;
/** @public @deprecated Use `UIEvent` and use the second argument to the handler function for the current event target */
export type QwikUIEvent<T = Element> = NativeUIEvent;
/** @public @deprecated Use `WheelEvent` and use the second argument to the handler function for the current event target */
export type QwikWheelEvent<T = Element> = NativeWheelEvent;
/** @public @deprecated Use `TransitionEvent` and use the second argument to the handler function for the current event target */
export type QwikTransitionEvent<T = Element> = NativeTransitionEvent;
