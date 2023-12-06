import type { QRL } from '../../../qrl/qrl.public';
import type { Signal } from '../../../state/signal';
import type { JSXNode } from './jsx-node';
import type { QwikSymbolEvent, QwikVisibleEvent } from './jsx-qwik-events';

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

export type PreventDefault<T = any> = {
  [K in keyof HTMLElementEventMap as `preventdefault:${K}`]?: boolean;
};

export type AllEventMaps = HTMLElementEventMap &
  DocumentEventMap &
  WindowEventHandlersEventMap & {
    qvisible: QwikVisibleEvent;
    qsymbol: QwikSymbolEvent;
  };
export type AllPascalEventMaps = PascalMap<AllEventMaps>;

export type QwikKeysEvents = Lowercase<keyof AllEventMaps>;

type LcEvent<T extends string, C extends string = Lowercase<T>> = C extends keyof AllEventMaps
  ? AllEventMaps[C]
  : Event;

export type EventFromName<T extends string> = LcEvent<T>;

export type BaseClassList =
  | string
  | undefined
  | null
  | false
  | Record<string, boolean | string | number | null | undefined>
  | BaseClassList[];

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
export type ClassList = BaseClassList | BaseClassList[];

export interface QwikProps<T extends Element> extends PreventDefault {
  class?: ClassList | Signal<ClassList> | undefined;
  dangerouslySetInnerHTML?: string | undefined;
  ref?: Ref<T> | undefined;

  /** Corresponding slot name used to project the element into. */
  'q:slot'?: string;
}

/**
 * Allows for Event Handlers to by typed as QwikEventMap[Key] or Event
 * https://stackoverflow.com/questions/52667959/what-is-the-purpose-of-bivariancehack-in-typescript-types/52668133#52668133
 *
 * It would be great if we could override the type of EventTarget to be EL, but that gives problems
 * with assigning a user-provided `QRL<(ev: Event)=>void>` because Event doesn't match the extended
 * `Event & {target?: EL}` type.
 */
export type BivariantEventHandler<T extends Event, EL> = {
  bivarianceHack(event: T, element: EL): any;
}['bivarianceHack'];

/** @public */
export type NativeEventHandler<T extends Event = Event, EL = Element> =
  | BivariantEventHandler<T, EL>
  | QRL<BivariantEventHandler<T, EL>>[];

/** @public */
export type QrlEvent<Type extends Event = Event, EL = Element> = QRL<
  BivariantEventHandler<Type, EL>
>;

export interface QwikCustomEvents<El> {
  [key: `${'document:' | 'window:' | ''}on${string}$`]:
    | SingleOrArray<NativeEventHandler<Event, El>>
    | SingleOrArray<Function>
    | SingleOrArray<undefined>
    | null;
}

type SingleOrArray<T> = T | (SingleOrArray<T> | undefined | null)[];

export type QwikKnownEvents<T> = {
  [K in keyof AllPascalEventMaps as `${'document:' | 'window:' | ''}on${K}$`]?: SingleOrArray<
    NativeEventHandler<AllPascalEventMaps[K], T>
  > | null;
};
/** @public */
export interface QwikEvents<T> extends QwikKnownEvents<T>, QwikCustomEvents<T> {}

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
export interface DOMAttributes<T extends Element, Children = JSXChildren>
  extends QwikProps<T>,
    QwikEvents<T> {
  children?: Children;
  key?: string | number | null | undefined;
}

type RefFnInterface<T> = {
  (el: T): void;
};

/**
 * A ref can be either a signal or a function. Note that the type of Signal is Element so that it
 * can accept more specialized elements too
 *
 * @public
 */
export type Ref<T extends Element = Element> = Signal<Element | undefined> | RefFnInterface<T>;
