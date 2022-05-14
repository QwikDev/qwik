/* eslint-disable */

import type { Ref } from '../../../use/use-store.public';
import type { QRL } from '../../../import/qrl.public';
import type { JSXNode } from './jsx-node';

export interface QwikProps {
  class?: string | { [className: string]: boolean };
  innerHTML?: string;
  dangerouslySetInnerHTML?: string;
  ref?: Ref<Element>;

  /**
   *
   */
  'q:slot'?: string;

  /**
   * URL against which relative QRLs should be resolved to.
   */
  'q:obj'?: string;
  'q:host'?: string;
  'q:version'?: string;
  'q:container'?: '';
  [key: `preventDefault:${string}`]: boolean;
}

/**
 * @public
 */
export type EventHandler<Type = Event> = (event: Type, element: Element) => any;

/**
 * @public
 */
export type QrlEvent<Type = Event> = QRL<EventHandler<Type>>;

/**
 * @public
 */
export interface QwikEvents {
  // Clipboard Events
  onCopy$?: (event: ClipboardEvent, el: Element) => void;
  onCopyCapture$?: (event: ClipboardEvent, el: Element) => void;
  onCut$?: (event: ClipboardEvent, el: Element) => void;
  onCutCapture$?: (event: ClipboardEvent, el: Element) => void;
  onPaste$?: (event: ClipboardEvent, el: Element) => void;
  onPasteCapture$?: (event: ClipboardEvent, el: Element) => void;
  onCompositionEnd$?: (event: CompositionEvent, el: Element) => void;
  onCompositionEndCapture$?: (event: CompositionEvent, el: Element) => void;
  onCompositionStart$?: (event: CompositionEvent, el: Element) => void;
  onCompositionStartCapture$?: (event: CompositionEvent, el: Element) => void;
  onCompositionUpdate$?: (event: CompositionEvent, el: Element) => void;
  onCompositionUpdateCapture$?: (event: CompositionEvent, el: Element) => void;
  onFocus$?: (event: FocusEvent, el: Element) => void;
  onFocusCapture$?: (event: FocusEvent, el: Element) => void;
  onFocusin$?: (event: FocusEvent, el: Element) => void;
  onFocusinCapture$?: (event: FocusEvent, el: Element) => void;
  onFocusout$?: (event: FocusEvent, el: Element) => void;
  onFocusoutCapture$?: (event: FocusEvent, el: Element) => void;
  onBlur$?: (event: FocusEvent, el: Element) => void;
  onBlurCapture$?: (event: FocusEvent, el: Element) => void;
  onChange$?: (event: Event, el: Element) => void;
  onChangeCapture$?: (event: Event, el: Element) => void;
  onInput$?: (event: Event, el: Element) => void;
  onInputCapture$?: (event: Event, el: Element) => void;
  onReset$?: (event: Event, el: Element) => void;
  onResetCapture$?: (event: Event, el: Element) => void;
  onSubmit$?: (event: Event, el: Element) => void;
  onSubmitCapture$?: (event: Event, el: Element) => void;
  onInvalid$?: (event: Event, el: Element) => void;
  onInvalidCapture$?: (event: Event, el: Element) => void;
  onLoad$?: (event: Event, el: Element) => void;
  onLoadCapture$?: (event: Event, el: Element) => void;
  onError$?: (event: Event, el: Element) => void; // also a Media Event
  onErrorCapture$?: (event: Event, el: Element) => void; // also a Media Event
  onKeyDown$?: (event: KeyboardEvent, el: Element) => void;
  onKeyDownCapture$?: (event: KeyboardEvent, el: Element) => void;
  onKeyPress$?: (event: KeyboardEvent, el: Element) => void;
  onKeyPressCapture$?: (event: KeyboardEvent, el: Element) => void;
  onKeyUp$?: (event: KeyboardEvent, el: Element) => void;
  onKeyUpCapture$?: (event: KeyboardEvent, el: Element) => void;
  onAuxClick$?: (event: MouseEvent, el: Element) => void;
  onClick$?: (event: MouseEvent, el: Element) => void;
  onClickCapture$?: (event: MouseEvent, el: Element) => void;
  onContextMenu$?: (event: MouseEvent, el: Element) => void;
  onContextMenuCapture$?: (event: MouseEvent, el: Element) => void;
  onDblClick$?: (event: MouseEvent, el: Element) => void;
  onDblClickCapture$?: (event: MouseEvent, el: Element) => void;
  onDrag$?: (event: DragEvent, el: Element) => void;
  onDragCapture$?: (event: DragEvent, el: Element) => void;
  onDragEnd$?: (event: DragEvent, el: Element) => void;
  onDragEndCapture$?: (event: DragEvent, el: Element) => void;
  onDragEnter$?: (event: DragEvent, el: Element) => void;
  onDragEnterCapture$?: (event: DragEvent, el: Element) => void;
  onDragExit$?: (event: DragEvent, el: Element) => void;
  onDragExitCapture$?: (event: DragEvent, el: Element) => void;
  onDragLeave$?: (event: DragEvent, el: Element) => void;
  onDragLeaveCapture$?: (event: DragEvent, el: Element) => void;
  onDragOver$?: (event: DragEvent, el: Element) => void;
  onDragOverCapture$?: (event: DragEvent, el: Element) => void;
  onDragStart$?: (event: DragEvent, el: Element) => void;
  onDragStartCapture$?: (event: DragEvent, el: Element) => void;
  onDrop$?: (event: DragEvent, el: Element) => void;
  onDropCapture$?: (event: DragEvent, el: Element) => void;
  onMouseDown$?: (event: MouseEvent, el: Element) => void;
  onMouseDownCapture$?: (event: MouseEvent, el: Element) => void;
  onMouseEnter$?: (event: MouseEvent, el: Element) => void;
  onMouseLeave$?: (event: MouseEvent, el: Element) => void;
  onMouseMove$?: (event: MouseEvent, el: Element) => void;
  onMouseMoveCapture$?: (event: MouseEvent, el: Element) => void;
  onMouseOut$?: (event: MouseEvent, el: Element) => void;
  onMouseOutCapture$?: (event: MouseEvent, el: Element) => void;
  onMouseOver$?: (event: MouseEvent, el: Element) => void;
  onMouseOverCapture$?: (event: MouseEvent, el: Element) => void;
  onMouseUp$?: (event: MouseEvent, el: Element) => void;
  onMouseUpCapture$?: (event: MouseEvent, el: Element) => void;
  onTouchCancel$?: (event: TouchEvent, el: Element) => void;
  onTouchCancelCapture$?: (event: TouchEvent, el: Element) => void;
  onTouchEnd$?: (event: TouchEvent, el: Element) => void;
  onTouchEndCapture$?: (event: TouchEvent, el: Element) => void;
  onTouchMove$?: (event: TouchEvent, el: Element) => void;
  onTouchMoveCapture$?: (event: TouchEvent, el: Element) => void;
  onTouchStart$?: (event: TouchEvent, el: Element) => void;
  onTouchStartCapture$?: (event: TouchEvent, el: Element) => void;
  onPointerDown$?: (event: PointerEvent, el: Element) => void;
  onPointerDownCapture$?: (event: PointerEvent, el: Element) => void;
  onPointerMove$?: (event: PointerEvent, el: Element) => void;
  onPointerMoveCapture$?: (event: PointerEvent, el: Element) => void;
  onPointerUp$?: (event: PointerEvent, el: Element) => void;
  onPointerUpCapture$?: (event: PointerEvent, el: Element) => void;
  onPointerCancel$?: (event: PointerEvent, el: Element) => void;
  onPointerCancelCapture$?: (event: PointerEvent, el: Element) => void;
  onPointerEnter$?: (event: PointerEvent, el: Element) => void;
  onPointerEnterCapture$?: (event: PointerEvent, el: Element) => void;
  onPointerLeave$?: (event: PointerEvent, el: Element) => void;
  onPointerLeaveCapture$?: (event: PointerEvent, el: Element) => void;
  onPointerOver$?: (event: PointerEvent, el: Element) => void;
  onPointerOverCapture$?: (event: PointerEvent, el: Element) => void;
  onPointerOut$?: (event: PointerEvent, el: Element) => void;
  onPointerOutCapture$?: (event: PointerEvent, el: Element) => void;
  onGotPointerCapture$?: (event: PointerEvent, el: Element) => void;
  onGotPointerCaptureCapture$?: (event: PointerEvent, el: Element) => void;
  onLostPointerCapture$?: (event: PointerEvent, el: Element) => void;
  onLostPointerCaptureCapture$?: (event: PointerEvent, el: Element) => void;
  onScroll$?: (event: UIEvent, el: Element) => void;
  onScrollCapture$?: (event: UIEvent, el: Element) => void;
  onWheel$?: (event: WheelEvent, el: Element) => void;
  onWheelCapture$?: (event: WheelEvent, el: Element) => void;
  onAnimationStart$?: (event: AnimationEvent, el: Element) => void;
  onAnimationStartCapture$?: (event: AnimationEvent, el: Element) => void;
  onAnimationEnd$?: (event: AnimationEvent, el: Element) => void;
  onAnimationEndCapture$?: (event: AnimationEvent, el: Element) => void;
  onAnimationIteration$?: (event: AnimationEvent, el: Element) => void;
  onAnimationIterationCapture$?: (event: AnimationEvent, el: Element) => void;
  onTransitionEnd$?: (event: TransitionEvent, el: Element) => void;
  onTransitionEndCapture$?: (event: TransitionEvent, el: Element) => void;

  'document:onLoad$'?: (event: Event, el: Element) => any;
  'document:onLoadQrl'?: QRL<(event: Event, el: Element) => any>;

  'document:onScroll$'?: (event: Event, el: Element) => any;
  'document:onScrollQrl'?: QRL<(event: Event, el: Element) => any>;

  'document:onVisible$'?: (event: Event, el: Element) => any;
  'document:onVisible'?: QRL<(event: Event, el: Element) => any>;

  'document:onVisibilityChange$'?: (event: Event, el: Element) => any;
  'document:onVisibilityChangeQrl'?: QRL<(event: Event, el: Element) => any>;

  [key: `on${string}$`]: EventHandler<any> | undefined;
  [key: `on${string}Qrl`]: QrlEvent<any> | QrlEvent<any>[] | undefined;

  [key: `document:on${string}$`]: EventHandler<any> | undefined;
  [key: `document:on${string}Qrl`]: QrlEvent<any> | QrlEvent<any>[] | undefined;

  [key: `window:on${string}$`]: EventHandler<any> | undefined;
  [key: `window:on${string}Qrl`]: QrlEvent<any> | QrlEvent<any>[] | undefined;
}

interface CSSProperties {
  [key: string]: string | number;
}

/**
 * @public
 */
export interface ComponentBaseProps {
  class?: string | { [className: string]: boolean };
  className?: string | undefined;
  style?: CSSProperties | string | undefined;
  key?: string | number;
  id?: string | undefined;
  ref?: Ref<Element>;

  'q:slot'?: string;

  [key: `host:${string}`]: any;

  [key: `host:on${string}$`]: EventHandler;
  [key: `host:on${string}Qrl`]: QrlEvent | QrlEvent[];

  [key: `document:on${string}$`]: EventHandler | undefined;
  [key: `document:on${string}Qrl`]: QrlEvent | QrlEvent[] | undefined;

  [key: `window:on${string}$`]: EventHandler | undefined;
  [key: `window:on${string}Qrl`]: QrlEvent | QrlEvent[] | undefined;

  children?: JSXChildren;
}
export interface QwikAttributes extends QwikProps, QwikEvents {}

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
  | JSXNode<any>;

/**
 * @public
 */
export interface DOMAttributes<T> extends QwikProps, QwikEvents {
  children?: JSXChildren;
  key?: string | number;
}
