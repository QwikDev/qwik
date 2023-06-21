import type { QRL } from '../../../qrl/qrl.public';
import type { Signal } from '../../../state/signal';
import type { JSXNode } from './jsx-node';
import type {
  QwikAnimationEvent,
  QwikChangeEvent,
  QwikClipboardEvent,
  QwikCompositionEvent,
  QwikDragEvent,
  QwikFocusEvent,
  QwikInvalidEvent,
  QwikKeyboardEvent,
  QwikMouseEvent,
  QwikPointerEvent,
  QwikSubmitEvent,
  QwikTouchEvent,
  QwikTransitionEvent,
  QwikUIEvent,
  QwikWheelEvent,
  SyntheticEvent,
} from './jsx-qwik-events';

export type QwikEventMap<T> = {
  Copy: QwikClipboardEvent<T>;
  CopyCapture: QwikClipboardEvent<T>;
  Cut: QwikClipboardEvent<T>;
  CutCapture: QwikClipboardEvent<T>;
  Paste: QwikClipboardEvent<T>;
  PasteCapture: QwikClipboardEvent<T>;
  CompositionEnd: QwikCompositionEvent<T>;
  CompositionEndCapture: QwikCompositionEvent<T>;
  CompositionStart: QwikCompositionEvent<T>;
  CompositionStartCapture: QwikCompositionEvent<T>;
  CompositionUpdate: QwikCompositionEvent<T>;
  CompositionUpdateCapture: QwikCompositionEvent<T>;
  Focus: QwikFocusEvent<T>;
  FocusCapture: QwikFocusEvent<T>;
  Focusin: QwikFocusEvent<T>;
  FocusinCapture: QwikFocusEvent<T>;
  Focusout: QwikFocusEvent<T>;
  FocusoutCapture: QwikFocusEvent<T>;
  Blur: QwikFocusEvent<T>;
  BlurCapture: QwikFocusEvent<T>;
  Change: QwikChangeEvent<T>;
  ChangeCapture: QwikChangeEvent<T>;
  Input: Event;
  InputCapture: Event;
  Reset: Event;
  ResetCapture: Event;
  Submit: QwikSubmitEvent<T>;
  SubmitCapture: Event;
  Invalid: QwikInvalidEvent<T>;
  InvalidCapture: QwikInvalidEvent<T>;
  Load: Event;
  LoadCapture: Event;
  Error: Event; // also a Media Event
  ErrorCapture: Event; // also a Media Event
  KeyDown: QwikKeyboardEvent<T>;
  KeyDownCapture: QwikKeyboardEvent<T>;
  KeyPress: QwikKeyboardEvent<T>;
  KeyPressCapture: QwikKeyboardEvent<T>;
  KeyUp: QwikKeyboardEvent<T>;
  KeyUpCapture: QwikKeyboardEvent<T>;
  AuxClick: QwikMouseEvent<T>;
  Click: QwikMouseEvent<T>;
  ClickCapture: QwikMouseEvent<T>;
  ContextMenu: QwikMouseEvent<T>;
  ContextMenuCapture: QwikMouseEvent<T>;
  DblClick: QwikMouseEvent<T>;
  DblClickCapture: QwikMouseEvent<T>;
  Drag: QwikDragEvent<T>;
  DragCapture: QwikDragEvent<T>;
  DragEnd: QwikDragEvent<T>;
  DragEndCapture: QwikDragEvent<T>;
  DragEnter: QwikDragEvent<T>;
  DragEnterCapture: QwikDragEvent<T>;
  DragExit: QwikDragEvent<T>;
  DragExitCapture: QwikDragEvent<T>;
  DragLeave: QwikDragEvent<T>;
  DragLeaveCapture: QwikDragEvent<T>;
  DragOver: QwikDragEvent<T>;
  DragOverCapture: QwikDragEvent<T>;
  DragStart: QwikDragEvent<T>;
  DragStartCapture: QwikDragEvent<T>;
  Drop: QwikDragEvent<T>;
  DropCapture: QwikDragEvent<T>;
  MouseDown: QwikMouseEvent<T>;
  MouseDownCapture: QwikMouseEvent<T>;
  MouseEnter: QwikMouseEvent<T>;
  MouseLeave: QwikMouseEvent<T>;
  MouseMove: QwikMouseEvent<T>;
  MouseMoveCapture: QwikMouseEvent<T>;
  MouseOut: QwikMouseEvent<T>;
  MouseOutCapture: QwikMouseEvent<T>;
  MouseOver: QwikMouseEvent<T>;
  MouseOverCapture: QwikMouseEvent<T>;
  MouseUp: QwikMouseEvent<T>;
  MouseUpCapture: QwikMouseEvent<T>;
  TouchCancel: QwikTouchEvent<T>;
  TouchCancelCapture: QwikTouchEvent<T>;
  TouchEnd: QwikTouchEvent<T>;
  TouchEndCapture: QwikTouchEvent<T>;
  TouchMove: QwikTouchEvent<T>;
  TouchMoveCapture: QwikTouchEvent<T>;
  TouchStart: QwikTouchEvent<T>;
  TouchStartCapture: QwikTouchEvent<T>;
  PointerDown: QwikPointerEvent<T>;
  PointerDownCapture: QwikPointerEvent<T>;
  PointerMove: QwikPointerEvent<T>;
  PointerMoveCapture: QwikPointerEvent<T>;
  PointerUp: QwikPointerEvent<T>;
  PointerUpCapture: QwikPointerEvent<T>;
  PointerCancel: QwikPointerEvent<T>;
  PointerCancelCapture: QwikPointerEvent<T>;
  PointerEnter: QwikPointerEvent<T>;
  PointerEnterCapture: QwikPointerEvent<T>;
  PointerLeave: QwikPointerEvent<T>;
  PointerLeaveCapture: QwikPointerEvent<T>;
  PointerOver: QwikPointerEvent<T>;
  PointerOverCapture: QwikPointerEvent<T>;
  PointerOut: QwikPointerEvent<T>;
  PointerOutCapture: QwikPointerEvent<T>;
  GotPointerCapture: QwikPointerEvent<T>;
  GotPointerCaptureCapture: QwikPointerEvent<T>;
  LostPointerCapture: QwikPointerEvent<T>;
  LostPointerCaptureCapture: QwikPointerEvent<T>;
  Scroll: QwikUIEvent<T>;
  ScrollCapture: QwikUIEvent<T>;
  Wheel: QwikWheelEvent<T>;
  WheelCapture: QwikWheelEvent<T>;
  AnimationStart: QwikAnimationEvent<T>;
  AnimationStartCapture: QwikAnimationEvent<T>;
  AnimationEnd: QwikAnimationEvent<T>;
  AnimationEndCapture: QwikAnimationEvent<T>;
  AnimationIteration: QwikAnimationEvent<T>;
  AnimationIterationCapture: QwikAnimationEvent<T>;
  TransitionEnd: QwikTransitionEvent<T>;
  TransitionEndCapture: QwikTransitionEvent<T>;

  //Audio / Video Events
  AudioProcess: Event;
  CanPlay: Event;
  CanPlayThrough: Event;
  Complete: Event;
  DurationChange: Event;
  Emptied: Event;
  Ended: Event;
  LoadedData: Event;
  LoadedMetadata: Event;
  Pause: Event;
  Play: Event;
  Playing: Event;
  Progress: Event;
  RateChange: Event;
  Seeked: Event;
  Seeking: Event;
  Stalled: Event;
  Suspend: Event;
  TimeUpdate: Event;
  VolumeChange: Event;
  Waiting: Event;
};

export type PreventDefault<T extends Element> = {
  [K in keyof QwikEventMap<T> as `preventdefault:${Lowercase<K>}`]?: boolean;
};

export type QwikKeysEvents = Lowercase<keyof QwikEventMap<any>>;

export type BaseClassList =
  | string
  | undefined
  | null
  | false
  | Record<string, boolean | string | number | null | undefined>
  | BaseClassList[];

/**
 * @public
 */
export type ClassList = BaseClassList | BaseClassList[];

export interface QwikProps<T extends Element> extends PreventDefault<T> {
  class?: ClassList | Signal<ClassList> | undefined;
  dangerouslySetInnerHTML?: string | undefined;

  /**
   * Corresponding slot name used to project the element into.
   */
  'q:slot'?: string;
}

// Allows for Event Handlers to by typed as QwikEventMap[Key] or Event
// https://stackoverflow.com/questions/52667959/what-is-the-purpose-of-bivariancehack-in-typescript-types/52668133#52668133
export type BivariantEventHandler<T extends SyntheticEvent<any> | Event, EL> = {
  bivarianceHack(event: T, element: EL): any;
}['bivarianceHack'];

/**
 * @public
 */
export type NativeEventHandler<T extends Event = Event, EL = Element> =
  | BivariantEventHandler<T, EL>
  | QRL<BivariantEventHandler<T, EL>>[];

/**
 * @public
 */
export type QrlEvent<Type extends Event = Event> = QRL<NativeEventHandler<Type, Element>>;

export interface QwikCustomEvents<El> {
  [key: `${'document:' | 'window:' | ''}on${string}$`]:
    | SingleOrArray<NativeEventHandler<Event, El>>
    | SingleOrArray<Function>
    | SingleOrArray<undefined>;
}

type SingleOrArray<T> = T | (SingleOrArray<T> | undefined | null)[];

export type QwikKnownEvents<T> = {
  [K in keyof QwikEventMap<T> as `${'document:' | 'window:' | ''}on${K}$`]?: SingleOrArray<
    BivariantEventHandler<QwikEventMap<T>[K], T>
  >;
};
/**
 * @public
 */
export interface QwikEvents<T> extends QwikKnownEvents<T>, QwikCustomEvents<T> {
  'document:onLoad$'?: BivariantEventHandler<Event, T>;
  'document:onScroll$'?: BivariantEventHandler<QwikUIEvent<T>, T>;
  'document:onVisible$'?: BivariantEventHandler<Event, T>;
  'document:onVisibilityChange$'?: BivariantEventHandler<Event, T>;
}

/**
 * @public
 */
export type JSXTagName = keyof HTMLElementTagNameMap | Omit<string, keyof HTMLElementTagNameMap>;

/**
 * @public
 */
export interface ComponentBaseProps {
  key?: string | number | null | undefined;
  'q:slot'?: string;
}

/**
 * @public
 */
export type JSXChildren =
  | string
  | number
  | boolean
  | null
  | undefined
  | Function
  | RegExp
  | JSXChildren[]
  | Promise<JSXChildren>
  | Signal<JSXChildren>
  | JSXNode;

/**
 * @public
 */
export interface DOMAttributes<T extends Element> extends QwikProps<T>, QwikEvents<T> {
  children?: JSXChildren;
  key?: string | number | null | undefined;
}

/**
 * @public
 */
export type Ref<T extends Element = Element> =
  | Signal<Element | undefined>
  | ((el: Element) => void);
