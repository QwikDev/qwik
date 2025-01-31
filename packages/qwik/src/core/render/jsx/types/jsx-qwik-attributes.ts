import type { QRL } from '../../../qrl/qrl.public';
import type { Signal } from '../../../state/signal';
import type { JSXNode } from './jsx-node';
import type {
  QwikIdleEvent,
  QwikInitEvent,
  QwikSymbolEvent,
  QwikViewTransitionEvent,
  QwikVisibleEvent,
} from './jsx-qwik-events';

/**
 * Capitalized multi-word names of some known events so we have nicer qwik attributes. For example,
 * instead of `oncompositionEnd$` we can use `onCompositionEnd$`. Note that any capitalization
 * works, so `oncompositionend$` is also valid. This is just for DX.
 *
 * Add any multi-word event names to this list. Single word events are automatically converted.
 */
type PascalCaseNames =
  | 'AnimationEnd'
  | 'AnimationIteration'
  | 'AnimationStart'
  | 'AuxClick'
  | 'BeforeToggle'
  | 'CanPlay'
  | 'CanPlayThrough'
  | 'CompositionEnd'
  | 'CompositionStart'
  | 'CompositionUpdate'
  | 'ContextMenu'
  | 'DblClick'
  | 'DragEnd'
  | 'DragEnter'
  | 'DragExit'
  | 'DragLeave'
  | 'DragOver'
  | 'DragStart'
  | 'DurationChange'
  | 'FocusIn'
  | 'FocusOut'
  | 'FullscreenChange'
  | 'FullscreenError'
  | 'GotPointerCapture'
  | 'KeyDown'
  | 'KeyPress'
  | 'KeyUp'
  | 'LoadedData'
  | 'LoadedMetadata'
  | 'LoadEnd'
  | 'LoadStart'
  | 'LostPointerCapture'
  | 'MouseDown'
  | 'MouseEnter'
  | 'MouseLeave'
  | 'MouseMove'
  | 'MouseOut'
  | 'MouseOver'
  | 'MouseUp'
  | 'PointerCancel'
  | 'PointerDown'
  | 'PointerEnter'
  | 'PointerLeave'
  | 'PointerMove'
  | 'PointerOut'
  | 'PointerOver'
  | 'PointerUp'
  | 'QIdle'
  | 'QInit'
  | 'QSymbol'
  | 'QVisible'
  | 'RateChange'
  | 'RateChange'
  | 'SecurityPolicyViolation'
  | 'SelectionChange'
  | 'SelectStart'
  | 'TimeUpdate'
  | 'TouchCancel'
  | 'TouchEnd'
  | 'TouchMove'
  | 'TouchStart'
  | 'TransitionCancel'
  | 'TransitionEnd'
  | 'TransitionRun'
  | 'TransitionStart'
  | 'VisibilityChange'
  | 'VolumeChange';

type LcEventNameMap = {
  [name in PascalCaseNames as Lowercase<name>]: name;
};

/**
 * Convert an event map to PascalCase. For example, `HTMLElementEventMap` contains lowercase keys,
 * so this will capitalize them, and use the `LcEventNameMap` for multi-word events names.
 */
type PascalMap<M> = {
  [K in Extract<keyof M, string> as K extends keyof LcEventNameMap
    ? LcEventNameMap[K]
    : Capitalize<K>]: M[K];
};

type PreventDefault = {
  [K in keyof HTMLElementEventMap as `preventdefault:${K}`]?: boolean;
};

type StopPropagation = {
  [K in keyof HTMLElementEventMap as `stoppropagation:${K}`]?: boolean;
};

type AllEventMapRaw = HTMLElementEventMap &
  DocumentEventMap &
  WindowEventHandlersEventMap & {
    qidle: QwikIdleEvent;
    qinit: QwikInitEvent;
    qsymbol: QwikSymbolEvent;
    qvisible: QwikVisibleEvent;
    qviewTransition: QwikViewTransitionEvent;
  };

/** This corrects the TS definition for ToggleEvent @public */
export interface CorrectedToggleEvent extends Event {
  readonly newState: 'open' | 'closed';
  readonly prevState: 'open' | 'closed';
}
// Corrections to the TS types
type EventCorrectionMap = {
  auxclick: PointerEvent;
  beforetoggle: CorrectedToggleEvent;
  click: PointerEvent;
  dblclick: PointerEvent;
  input: InputEvent;
  toggle: CorrectedToggleEvent;
};

type AllEventsMap = Omit<AllEventMapRaw, keyof EventCorrectionMap> & EventCorrectionMap;
type AllPascalEventMaps = PascalMap<AllEventsMap>;

export type AllEventKeys = keyof AllEventsMap;

type LcEvent<T extends string, C extends string = Lowercase<T>> = C extends keyof AllEventsMap
  ? AllEventsMap[C]
  : Event;

export type EventFromName<T extends string> = LcEvent<T>;

/**
 * A class list can be a string, a boolean, an array, or an object.
 *
 * If it's an array, each item is a class list and they are all added.
 *
 * If it's an object, then the keys are class name strings, and the values are booleans that
 * determine if the class name string should be added or not.
 *
 * @public
 */
export type ClassList =
  | string
  | undefined
  | null
  | false
  | Record<string, boolean | string | number | null | undefined>
  | ClassList[];

/**
 * A DOM event handler
 *
 * @public
 */
export type EventHandler<EV = Event, EL = Element> = {
  // https://stackoverflow.com/questions/52667959/what-is-the-purpose-of-bivariancehack-in-typescript-types/52668133#52668133
  bivarianceHack(event: EV, element: EL): any;
}['bivarianceHack'];

/**
 * An event handler for Qwik events, can be a handler QRL or an array of handler QRLs.
 *
 * @beta
 */
export type QRLEventHandlerMulti<EV extends Event, EL> =
  | QRL<EventHandler<EV, EL>>
  | undefined
  | null
  | QRLEventHandlerMulti<EV, EL>[]
  | EventHandler<EV, EL>;

type QwikCustomEvents<EL> = {
  /**
   * We don't add custom events here because often people will add props to DOM props that look like
   * custom events but are not
   */
};
type QwikCustomEventsPlain<EL> = {
  /** The handler */
  [key: `${'document:' | 'window:' | ''}on${string}$`]:
    | QRLEventHandlerMulti<Event, EL>
    | EventHandler<Event, EL>;
};

type QwikKnownEvents<EL> = {
  [K in keyof AllPascalEventMaps as `${
    | 'document:'
    | 'window:'
    | ''}on${K}$`]?: QRLEventHandlerMulti<AllPascalEventMaps[K], EL>;
};
type QwikKnownEventsPlain<EL> = {
  [K in keyof AllPascalEventMaps as `${'document:' | 'window:' | ''}on${K}$`]?:
    | QRLEventHandlerMulti<AllPascalEventMaps[K], EL>
    | EventHandler<AllPascalEventMaps[K], EL>;
};

/** @public */
export type QwikEvents<EL, Plain extends boolean = true> = Plain extends true
  ? QwikKnownEventsPlain<EL> & QwikCustomEventsPlain<EL>
  : QwikKnownEvents<EL> & QwikCustomEvents<EL>;

/** @public */
export type JSXTagName = keyof HTMLElementTagNameMap | Omit<string, keyof HTMLElementTagNameMap>;

/** @public */
export interface ComponentBaseProps {
  key?: string | number | null | undefined;
  'q:slot'?: string;
}

/** @public */
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

/** @public */
export interface QwikIntrinsicAttributes {
  key?: string | number | null | undefined;
  children?: JSXChildren;

  /** Corresponding slot name used to project the element into. */
  'q:slot'?: string;
  'q:shadowRoot'?: boolean;
  fetchPriority?: 'auto' | 'high' | 'low';
}

/**
 * A ref can be either a signal or a function. Note that the type of Signal is Element so that it
 * can accept more specialized elements too
 *
 * @public
 */
export type Ref<EL extends Element = Element> = Signal<Element | undefined> | RefFnInterface<EL>;
type RefFnInterface<EL> = {
  (el: EL): void;
};
interface RefAttr<EL extends Element> {
  ref?: Ref<EL> | undefined;
}
interface DOMAttributesBase<EL extends Element>
  extends QwikIntrinsicAttributes,
    PreventDefault,
    StopPropagation,
    RefAttr<EL> {
  dangerouslySetInnerHTML?: string | undefined;
}

/** The Qwik-specific attributes that DOM elements accept @public */
export interface DOMAttributes<EL extends Element> extends DOMAttributesBase<EL>, QwikEvents<EL> {
  class?: ClassList | Signal<ClassList> | undefined;
}

/** The Qwik DOM attributes without plain handlers, for use as function parameters @public */
export interface QwikAttributes<EL extends Element>
  extends DOMAttributesBase<EL>,
    QwikEvents<EL, false> {
  class?: ClassList | undefined;
}
