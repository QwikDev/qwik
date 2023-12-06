import type { QwikKeysEvents } from './jsx-qwik-attributes';

/** Emitted by qwik-loader when an element becomes visible. Used by `useVisibleTask$` @public */
export type QwikVisibleEvent = CustomEvent<IntersectionObserverEntry>;
/** Emitted by qwik-loader when a module was lazily loaded @public */
export type QwikSymbolEvent = CustomEvent<{ symbol: string; element: Element; reqTime: number }>;

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
 * The PascalCaseEventLiteralType combines the QwikKeysEvents type and string type using the
 * LiteralUnion utility type, allowing autocompletion for event names while retaining support for
 * custom event names as strings. Despite the name, the event names are all lowercase :)
 */
export type PascalCaseEventLiteralType = LiteralUnion<QwikKeysEvents, string>;

// Deprecated old types
export type SyntheticEvent<T = Element, E = Event> = E & { target: EventTarget & T };
/** @public @deprecated Use `AnimationEvent` */
export type NativeAnimationEvent = AnimationEvent;
/** @public @deprecated Use `ClipboardEvent` */
export type NativeClipboardEvent = ClipboardEvent;
/** @public @deprecated Use `CompositionEvent` */
export type NativeCompositionEvent = CompositionEvent;
/** @public @deprecated Use `DragEvent` */
export type NativeDragEvent = DragEvent;
/** @public @deprecated Use `FocusEvent` */
export type NativeFocusEvent = FocusEvent;
/** @public @deprecated Use `KeyboardEvent` */
export type NativeKeyboardEvent = KeyboardEvent;
/** @public @deprecated Use `MouseEvent` */
export type NativeMouseEvent = MouseEvent;
/** @public @deprecated Use `TouchEvent` */
export type NativeTouchEvent = TouchEvent;
/** @public @deprecated Use `PointerEvent` */
export type NativePointerEvent = PointerEvent;
/** @public @deprecated Use `TransitionEvent` */
export type NativeTransitionEvent = TransitionEvent;
/** @public @deprecated Use `UIEvent` */
export type NativeUIEvent = UIEvent;
/** @public @deprecated Use `WheelEvent` */
export type NativeWheelEvent = WheelEvent;
/** @public @deprecated Use `AnimationEvent` */
export type QwikAnimationEvent<T = Element> = NativeAnimationEvent;
/** @public @deprecated Use `ClipboardEvent` */
export type QwikClipboardEvent<T = Element> = NativeClipboardEvent;
/** @public @deprecated Use `CompositionEvent` */
export type QwikCompositionEvent<T = Element> = NativeCompositionEvent;
/** @public @deprecated Use `DragEvent` */
export type QwikDragEvent<T = Element> = NativeDragEvent;
/** @public @deprecated Use `PointerEvent` */
export type QwikPointerEvent<T = Element> = NativePointerEvent;
/** @public @deprecated Use `FocusEvent` */
export type QwikFocusEvent<T = Element> = NativeFocusEvent;
/** @public @deprecated Use `SubmitEvent` */
export type QwikSubmitEvent<T = Element> = Event;
/** @public @deprecated Use `InvalidEvent` */
export type QwikInvalidEvent<T = Element> = Event;
/** @public @deprecated Use `ChangeEvent` */
export type QwikChangeEvent<T = Element> = Event;
/** @public @deprecated Use `KeyboardEvent` */
export type QwikKeyboardEvent<T = Element> = NativeKeyboardEvent;
/** @public @deprecated Use `MouseEvent` */
export type QwikMouseEvent<T = Element, E = NativeMouseEvent> = E;
/** @public @deprecated Use `TouchEvent` */
export type QwikTouchEvent<T = Element> = NativeTouchEvent;
/** @public @deprecated Use `UIEvent` */
export type QwikUIEvent<T = Element> = NativeUIEvent;
/** @public @deprecated Use `WheelEvent` */
export type QwikWheelEvent<T = Element> = NativeWheelEvent;
/** @public @deprecated Use `TransitionEvent` */
export type QwikTransitionEvent<T = Element> = NativeTransitionEvent;
