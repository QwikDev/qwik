/* eslint-disable */

import type { QRL } from '../../../import/qrl.public';
import type { Signal } from '../../../object/q-object';
import type { Ref } from '../../../use/use-ref';
import type { JSXNode } from './jsx-node';

export type QwikEventMap = {
  Copy: ClipboardEvent;
  CopyCapture: ClipboardEvent;
  Cut: ClipboardEvent;
  CutCapture: ClipboardEvent;
  Paste: ClipboardEvent;
  PasteCapture: ClipboardEvent;
  CompositionEnd: CompositionEvent;
  CompositionEndCapture: CompositionEvent;
  CompositionStart: CompositionEvent;
  CompositionStartCapture: CompositionEvent;
  CompositionUpdate: CompositionEvent;
  CompositionUpdateCapture: CompositionEvent;
  Focus: FocusEvent;
  FocusCapture: FocusEvent;
  Focusin: FocusEvent;
  FocusinCapture: FocusEvent;
  Focusout: FocusEvent;
  FocusoutCapture: FocusEvent;
  Blur: FocusEvent;
  BlurCapture: FocusEvent;
  Change: Event;
  ChangeCapture: Event;
  Input: Event;
  InputCapture: Event;
  Reset: Event;
  ResetCapture: Event;
  Submit: Event;
  SubmitCapture: Event;
  Invalid: Event;
  InvalidCapture: Event;
  Load: Event;
  LoadCapture: Event;
  Error: Event; // also a Media Event
  ErrorCapture: Event; // also a Media Event
  KeyDown: KeyboardEvent;
  KeyDownCapture: KeyboardEvent;
  KeyPress: KeyboardEvent;
  KeyPressCapture: KeyboardEvent;
  KeyUp: KeyboardEvent;
  KeyUpCapture: KeyboardEvent;
  AuxClick: MouseEvent;
  Click: MouseEvent;
  ClickCapture: MouseEvent;
  ContextMenu: MouseEvent;
  ContextMenuCapture: MouseEvent;
  DblClick: MouseEvent;
  DblClickCapture: MouseEvent;
  Drag: DragEvent;
  DragCapture: DragEvent;
  DragEnd: DragEvent;
  DragEndCapture: DragEvent;
  DragEnter: DragEvent;
  DragEnterCapture: DragEvent;
  DragExit: DragEvent;
  DragExitCapture: DragEvent;
  DragLeave: DragEvent;
  DragLeaveCapture: DragEvent;
  DragOver: DragEvent;
  DragOverCapture: DragEvent;
  DragStart: DragEvent;
  DragStartCapture: DragEvent;
  Drop: DragEvent;
  DropCapture: DragEvent;
  MouseDown: MouseEvent;
  MouseDownCapture: MouseEvent;
  MouseEnter: MouseEvent;
  MouseLeave: MouseEvent;
  MouseMove: MouseEvent;
  MouseMoveCapture: MouseEvent;
  MouseOut: MouseEvent;
  MouseOutCapture: MouseEvent;
  MouseOver: MouseEvent;
  MouseOverCapture: MouseEvent;
  MouseUp: MouseEvent;
  MouseUpCapture: MouseEvent;
  TouchCancel: TouchEvent;
  TouchCancelCapture: TouchEvent;
  TouchEnd: TouchEvent;
  TouchEndCapture: TouchEvent;
  TouchMove: TouchEvent;
  TouchMoveCapture: TouchEvent;
  TouchStart: TouchEvent;
  TouchStartCapture: TouchEvent;
  PointerDown: PointerEvent;
  PointerDownCapture: PointerEvent;
  PointerMove: PointerEvent;
  PointerMoveCapture: PointerEvent;
  PointerUp: PointerEvent;
  PointerUpCapture: PointerEvent;
  PointerCancel: PointerEvent;
  PointerCancelCapture: PointerEvent;
  PointerEnter: PointerEvent;
  PointerEnterCapture: PointerEvent;
  PointerLeave: PointerEvent;
  PointerLeaveCapture: PointerEvent;
  PointerOver: PointerEvent;
  PointerOverCapture: PointerEvent;
  PointerOut: PointerEvent;
  PointerOutCapture: PointerEvent;
  GotPointerCapture: PointerEvent;
  GotPointerCaptureCapture: PointerEvent;
  LostPointerCapture: PointerEvent;
  LostPointerCaptureCapture: PointerEvent;
  Scroll: UIEvent;
  ScrollCapture: UIEvent;
  Wheel: WheelEvent;
  WheelCapture: WheelEvent;
  AnimationStart: AnimationEvent;
  AnimationStartCapture: AnimationEvent;
  AnimationEnd: AnimationEvent;
  AnimationEndCapture: AnimationEvent;
  AnimationIteration: AnimationEvent;
  AnimationIterationCapture: AnimationEvent;
  TransitionEnd: TransitionEvent;
  TransitionEndCapture: TransitionEvent;
};

export type PreventDefault = {
  [K in keyof QwikEventMap as `prevent${'default' | 'Default'}:${Lowercase<K>}`]?: boolean;
};

export interface QwikProps extends PreventDefault {
  class?: string | { [className: string]: boolean } | string[];
  dangerouslySetInnerHTML?: string;
  ref?: Ref<Element> | Signal<Element | undefined> | ((el: Element) => void);

  /**
   *
   */
  'q:slot'?: string;

  /**
   * URL against which relative QRLs should be resolved to.
   */
  'q:version'?: string;
  'q:container'?: '';
}

// Allows for Event Handlers to by typed as QwikEventMap[Key] or Event
// https://stackoverflow.com/questions/52667959/what-is-the-purpose-of-bivariancehack-in-typescript-types/52668133#52668133
export type BivariantEventHandler<T extends Event> = {
  bivarianceHack(event: T, element: Element): any;
}['bivarianceHack'];

/**
 * @public
 */
export type NativeEventHandler<T extends Event = Event> =
  | BivariantEventHandler<T>
  | QRL<BivariantEventHandler<T>>[];

/**
 * @public
 */
export type QrlEvent<Type extends Event = Event> = QRL<NativeEventHandler<Type>>;

export interface QwikCustomEvents {
  [key: `${'document:' | 'window:' | ''}on${string}$`]: NativeEventHandler<Event> | undefined;
}
export type QwikKnownEvents = {
  [K in keyof QwikEventMap as `${'document:' | 'window:' | ''}on${K}$`]?: NativeEventHandler<
    QwikEventMap[K]
  >;
};
/**
 * @public
 */
export interface QwikEvents extends QwikKnownEvents, QwikCustomEvents {
  'document:onLoad$'?: BivariantEventHandler<Event>;

  'document:onScroll$'?: BivariantEventHandler<Event>;

  'document:onVisible$'?: BivariantEventHandler<Event>;

  'document:onVisibilityChange$'?: BivariantEventHandler<Event>;
}

/**
 * @public
 */
export type JSXTagName = keyof HTMLElementTagNameMap | Omit<string, keyof HTMLElementTagNameMap>;

export interface ComponentCustomEvents {
  [key: `${'host'}on:${string}$`]: NativeEventHandler<Event>;
  [key: `${'window' | 'document'}:on${string}$`]: NativeEventHandler<Event> | undefined;
}
export type ComponentKnownEvents = {
  [K in keyof QwikEventMap as `${'host' | 'window' | 'document'}:on${K}$`]?: NativeEventHandler<
    QwikEventMap[K]
  >;
};

/**
 * @public
 */
export interface ComponentBaseProps {
  key?: string | number;
  'q:slot'?: string;
}

export interface QwikAttributes extends QwikProps, QwikEvents {}

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
  | JSXNode;

/**
 * @public
 */
export interface DOMAttributes<T> extends QwikProps, QwikEvents {
  children?: JSXChildren;
  key?: string | number;
}
