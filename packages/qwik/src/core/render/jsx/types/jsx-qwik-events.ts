export interface SyntheticEvent<T = Element, E = Event>
  extends BaseSyntheticEvent<E, EventTarget & T, EventTarget> {}

interface BaseSyntheticEvent<E = object, C = any, T = any> {
  nativeEvent: E;
  currentTarget: C;
  target: T;
  bubbles: boolean;
  cancelable: boolean;
  eventPhase: number;
  isTrusted: boolean;
  stopPropagation(): void;
  isPropagationStopped(): boolean;
  persist(): void;
  timeStamp: number;
  type: string;
}

/** @beta */
export type NativeAnimationEvent = AnimationEvent;
/** @beta */
export type NativeClipboardEvent = ClipboardEvent;
/** @beta */
export type NativeCompositionEvent = CompositionEvent;
/** @beta */
export type NativeDragEvent = DragEvent;
/** @beta */
export type NativeFocusEvent = FocusEvent;
/** @beta */
export type NativeKeyboardEvent = KeyboardEvent;
/** @beta */
export type NativeMouseEvent = MouseEvent;
/** @beta */
export type NativeTouchEvent = TouchEvent;
/** @beta */
export type NativePointerEvent = PointerEvent;
/** @beta */
export type NativeTransitionEvent = TransitionEvent;
/** @beta */
export type NativeUIEvent = UIEvent;
/** @beta */
export type NativeWheelEvent = WheelEvent;

/**
 * @beta
 */
export interface QwikAnimationEvent<T = Element> extends SyntheticEvent<T, NativeAnimationEvent> {
  animationName: string;
  elapsedTime: number;
  pseudoElement: string;
}

/**
 * @beta
 */
export interface QwikClipboardEvent<T = Element> extends SyntheticEvent<T, NativeClipboardEvent> {
  clipboardData: DataTransfer;
}

/**
 * @beta
 */
export interface QwikCompositionEvent<T = Element>
  extends SyntheticEvent<T, NativeCompositionEvent> {
  data: string;
}

/**
 * @beta
 */
export interface QwikDragEvent<T = Element> extends QwikMouseEvent<T, NativeDragEvent> {
  dataTransfer: DataTransfer;
}

/**
 * @beta
 */
export interface QwikPointerEvent<T = Element> extends QwikMouseEvent<T, NativePointerEvent> {
  pointerId: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
  width: number;
  height: number;
  pointerType: 'mouse' | 'pen' | 'touch';
  isPrimary: boolean;
}

/**
 * @beta
 */
export interface QwikFocusEvent<T = Element> extends SyntheticEvent<T, NativeFocusEvent> {
  relatedTarget: EventTarget | null;
  target: EventTarget & T;
}

/**
 * @beta
 */
export interface QwikSubmitEvent<T = Element> extends SyntheticEvent<T> {}

/**
 * @beta
 */
export interface QwikInvalidEvent<T = Element> extends SyntheticEvent<T> {
  target: EventTarget & T;
}

/**
 * @beta
 */
export interface QwikChangeEvent<T = Element> extends SyntheticEvent<T> {
  target: EventTarget & T;
}

/**
 * @beta
 */
export interface QwikKeyboardEvent<T = Element> extends SyntheticEvent<T, NativeKeyboardEvent> {
  altKey: boolean;
  charCode: number;
  ctrlKey: boolean;
  /**
   * See [DOM Level 3 Events spec](https://www.w3.org/TR/uievents-key/#keys-modifier). for a list of valid (case-sensitive) arguments to this method.
   */
  getModifierState(key: string): boolean;
  /**
   * See the [DOM Level 3 Events spec](https://www.w3.org/TR/uievents-key/#named-key-attribute-values). for possible values
   */
  key: string;
  keyCode: number;
  locale: string;
  location: number;
  metaKey: boolean;
  repeat: boolean;
  shiftKey: boolean;
  which: number;
}

/**
 * @beta
 */
export interface QwikMouseEvent<T = Element, E = NativeMouseEvent> extends SyntheticEvent<T, E> {
  altKey: boolean;
  button: number;
  buttons: number;
  clientX: number;
  clientY: number;
  ctrlKey: boolean;
  /**
   * See [DOM Level 3 Events spec](https://www.w3.org/TR/uievents-key/#keys-modifier). for a list of valid (case-sensitive) arguments to this method.
   */
  getModifierState(key: string): boolean;
  metaKey: boolean;
  movementX: number;
  movementY: number;
  pageX: number;
  pageY: number;
  relatedTarget: EventTarget | null;
  screenX: number;
  screenY: number;
  shiftKey: boolean;
  x: number;
  y: number;
}

/**
 * @beta
 */
export interface QwikTouchEvent<T = Element> extends SyntheticEvent<T, NativeTouchEvent> {
  altKey: boolean;
  changedTouches: TouchList;
  ctrlKey: boolean;
  /**
   * See [DOM Level 3 Events spec](https://www.w3.org/TR/uievents-key/#keys-modifier). for a list of valid (case-sensitive) arguments to this method.
   */
  getModifierState(key: string): boolean;
  metaKey: boolean;
  shiftKey: boolean;
  targetTouches: TouchList;
  touches: TouchList;
}

/**
 * @beta
 */
export interface QwikUIEvent<T = Element> extends SyntheticEvent<T, NativeUIEvent> {
  detail: number;
  view: AbstractView;
}

/**
 * @beta
 */
export interface QwikWheelEvent<T = Element> extends QwikMouseEvent<T, NativeWheelEvent> {
  deltaMode: number;
  deltaX: number;
  deltaY: number;
  deltaZ: number;
}

/**
 * @beta
 */
export interface QwikTransitionEvent<T = Element> extends SyntheticEvent<T, NativeTransitionEvent> {
  elapsedTime: number;
  propertyName: string;
  pseudoElement: string;
}

interface AbstractView {
  styleMedia: StyleMedia;
  document: Document;
}
