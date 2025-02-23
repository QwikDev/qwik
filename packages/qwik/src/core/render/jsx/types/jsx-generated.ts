import * as CSS from 'csstype';
import type { Signal } from '../../../state/signal';
import type { DOMAttributes, ClassList, QwikAttributes } from './jsx-qwik-attributes';
/** @public */
export type Booleanish = boolean | `${boolean}`;
/** @public */
export type Size = number | string;
/** @public */
export type Numberish = number | `${number}`;

/** @public */
export interface CSSProperties
  extends CSS.Properties<string | number>,
    CSS.PropertiesHyphen<string | number> {
  /**
   * The index signature was removed to enable closed typing for style using CSSType. You're able to
   * use type assertion or module augmentation to add properties or an index signature of your own.
   *
   * For examples and more information, visit:
   * https://github.com/frenic/csstype#what-should-i-do-when-i-get-type-errors
   */
  [v: `--${string}`]: string | number | undefined;
}

/**
 * TS defines these with the React syntax which is not compatible with Qwik. E.g. `ariaAtomic`
 * instead of `aria-atomic`.
 *
 * @public
 */
export interface AriaAttributes {
  /**
   * Identifies the currently active element when DOM focus is on a composite widget, textbox,
   * group, or application.
   */
  'aria-activedescendant'?: string | undefined;
  /**
   * Indicates whether assistive technologies will present all, or only parts of, the changed region
   * based on the change notifications defined by the aria-relevant attribute.
   */
  'aria-atomic'?: Booleanish | undefined;
  /**
   * Indicates whether inputting text could trigger display of one or more predictions of the user's
   * intended value for an input and specifies how predictions would be presented if they are made.
   */
  'aria-autocomplete'?: 'none' | 'inline' | 'list' | 'both' | undefined;
  /**
   * Indicates an element is being modified and that assistive technologies MAY want to wait until
   * the modifications are complete before exposing them to the user.
   */
  'aria-busy'?: Booleanish | undefined;
  /**
   * Indicates the current "checked" state of checkboxes, radio buttons, and other widgets.
   *
   * @see aria-pressed @see aria-selected.
   */
  'aria-checked'?: boolean | 'false' | 'mixed' | 'true' | undefined;
  /**
   * Defines the total number of columns in a table, grid, or treegrid.
   *
   * @see aria-colindex.
   */
  'aria-colcount'?: number | undefined;
  /**
   * Defines an element's column index or position with respect to the total number of columns
   * within a table, grid, or treegrid.
   *
   * @see aria-colcount @see aria-colspan.
   */
  'aria-colindex'?: number | undefined;
  /**
   * Defines the number of columns spanned by a cell or gridcell within a table, grid, or treegrid.
   *
   * @see aria-colindex @see aria-rowspan.
   */
  'aria-colspan'?: number | undefined;
  /**
   * Identifies the element (or elements) whose contents or presence are controlled by the current
   * element.
   *
   * @see aria-owns.
   */
  'aria-controls'?: string | undefined;
  /**
   * Indicates the element that represents the current item within a container or set of related
   * elements.
   */
  'aria-current'?:
    | boolean
    | 'false'
    | 'true'
    | 'page'
    | 'step'
    | 'location'
    | 'date'
    | 'time'
    | undefined;
  /**
   * Identifies the element (or elements) that describes the object.
   *
   * @see aria-labelledby
   */
  'aria-describedby'?: string | undefined;
  /**
   * Identifies the element that provides a detailed, extended description for the object.
   *
   * @see aria-describedby.
   */
  'aria-details'?: string | undefined;
  /**
   * Indicates that the element is perceivable but disabled, so it is not editable or otherwise
   * operable.
   *
   * @see aria-hidden @see aria-readonly.
   */
  'aria-disabled'?: Booleanish | undefined;
  /**
   * Indicates what functions can be performed when a dragged object is released on the drop target.
   *
   * @deprecated In ARIA 1.1
   */
  'aria-dropeffect'?: 'none' | 'copy' | 'execute' | 'link' | 'move' | 'popup' | undefined;
  /**
   * Identifies the element that provides an error message for the object.
   *
   * @see aria-invalid @see aria-describedby.
   */
  'aria-errormessage'?: string | undefined;
  /**
   * Indicates whether the element, or another grouping element it controls, is currently expanded
   * or collapsed.
   */
  'aria-expanded'?: Booleanish | undefined;
  /**
   * Identifies the next element (or elements) in an alternate reading order of content which, at
   * the user's discretion, allows assistive technology to override the general default of reading
   * in document source order.
   */
  'aria-flowto'?: string | undefined;
  /**
   * Indicates an element's "grabbed" state in a drag-and-drop operation.
   *
   * @deprecated In ARIA 1.1
   */
  'aria-grabbed'?: Booleanish | undefined;
  /**
   * Indicates the availability and type of interactive popup element, such as menu or dialog, that
   * can be triggered by an element.
   */
  'aria-haspopup'?:
    | boolean
    | 'false'
    | 'true'
    | 'menu'
    | 'listbox'
    | 'tree'
    | 'grid'
    | 'dialog'
    | undefined;
  /**
   * Indicates whether the element is exposed to an accessibility API.
   *
   * @see aria-disabled.
   */
  'aria-hidden'?: Booleanish | undefined;
  /**
   * Indicates the entered value does not conform to the format expected by the application.
   *
   * @see aria-errormessage.
   */
  'aria-invalid'?: boolean | 'false' | 'true' | 'grammar' | 'spelling' | undefined;
  /**
   * Indicates keyboard shortcuts that an author has implemented to activate or give focus to an
   * element.
   */
  'aria-keyshortcuts'?: string | undefined;
  /**
   * Defines a string value that labels the current element.
   *
   * @see aria-labelledby.
   */
  'aria-label'?: string | undefined;
  /**
   * Identifies the element (or elements) that labels the current element.
   *
   * @see aria-describedby.
   */
  'aria-labelledby'?: string | undefined;
  /** Defines the hierarchical level of an element within a structure. */
  'aria-level'?: number | undefined;
  /**
   * Indicates that an element will be updated, and describes the types of updates the user agents,
   * assistive technologies, and user can expect from the live region.
   */
  'aria-live'?: 'off' | 'assertive' | 'polite' | undefined;
  /** Indicates whether an element is modal when displayed. */
  'aria-modal'?: Booleanish | undefined;
  /** Indicates whether a text box accepts multiple lines of input or only a single line. */
  'aria-multiline'?: Booleanish | undefined;
  /** Indicates that the user may select more than one item from the current selectable descendants. */
  'aria-multiselectable'?: Booleanish | undefined;
  /** Indicates whether the element's orientation is horizontal, vertical, or unknown/ambiguous. */
  'aria-orientation'?: 'horizontal' | 'vertical' | undefined;
  /**
   * Identifies an element (or elements) in order to define a visual, functional, or contextual
   * parent/child relationship between DOM elements where the DOM hierarchy cannot be used to
   * represent the relationship.
   *
   * @see aria-controls.
   */
  'aria-owns'?: string | undefined;
  /**
   * Defines a short hint (a word or short phrase) intended to aid the user with data entry when the
   * control has no value. A hint could be a sample value or a brief description of the expected
   * format.
   */
  'aria-placeholder'?: string | undefined;
  /**
   * Defines an element's number or position in the current set of listitems or treeitems. Not
   * required if all elements in the set are present in the DOM.
   *
   * @see aria-setsize.
   */
  'aria-posinset'?: number | undefined;
  /**
   * Indicates the current "pressed" state of toggle buttons.
   *
   * @see aria-checked @see aria-selected.
   */
  'aria-pressed'?: boolean | 'false' | 'mixed' | 'true' | undefined;
  /**
   * Indicates that the element is not editable, but is otherwise operable.
   *
   * @see aria-disabled.
   */
  'aria-readonly'?: Booleanish | undefined;
  /**
   * Indicates what notifications the user agent will trigger when the accessibility tree within a
   * live region is modified.
   *
   * @see aria-atomic.
   */
  'aria-relevant'?:
    | 'additions'
    | 'additions removals'
    | 'additions text'
    | 'all'
    | 'removals'
    | 'removals additions'
    | 'removals text'
    | 'text'
    | 'text additions'
    | 'text removals'
    | undefined;
  /** Indicates that user input is required on the element before a form may be submitted. */
  'aria-required'?: Booleanish | undefined;
  /** Defines a human-readable, author-localized description for the role of an element. */
  'aria-roledescription'?: string | undefined;
  /**
   * Defines the total number of rows in a table, grid, or treegrid.
   *
   * @see aria-rowindex.
   */
  'aria-rowcount'?: number | undefined;
  /**
   * Defines an element's row index or position with respect to the total number of rows within a
   * table, grid, or treegrid.
   *
   * @see aria-rowcount @see aria-rowspan.
   */
  'aria-rowindex'?: number | undefined;
  /**
   * Defines the number of rows spanned by a cell or gridcell within a table, grid, or treegrid.
   *
   * @see aria-rowindex @see aria-colspan.
   */
  'aria-rowspan'?: number | undefined;
  /**
   * Indicates the current "selected" state of various widgets.
   *
   * @see aria-checked @see aria-pressed.
   */
  'aria-selected'?: Booleanish | undefined;
  /**
   * Defines the number of items in the current set of listitems or treeitems. Not required if all
   * elements in the set are present in the DOM.
   *
   * @see aria-posinset.
   */
  'aria-setsize'?: number | undefined;
  /** Indicates if items in a table or grid are sorted in ascending or descending order. */
  'aria-sort'?: 'none' | 'ascending' | 'descending' | 'other' | undefined;
  /** Defines the maximum allowed value for a range widget. */
  'aria-valuemax'?: number | undefined;
  /** Defines the minimum allowed value for a range widget. */
  'aria-valuemin'?: number | undefined;
  /**
   * Defines the current value for a range widget.
   *
   * @see aria-valuetext.
   */
  'aria-valuenow'?: number | undefined;
  /** Defines the human readable text alternative of aria-valuenow for a range widget. */
  'aria-valuetext'?: string | undefined;
}

/** @public */
export type AriaRole =
  | 'alert'
  | 'alertdialog'
  | 'application'
  | 'article'
  | 'banner'
  | 'button'
  | 'cell'
  | 'checkbox'
  | 'columnheader'
  | 'combobox'
  | 'complementary'
  | 'contentinfo'
  | 'definition'
  | 'dialog'
  | 'directory'
  | 'document'
  | 'feed'
  | 'figure'
  | 'form'
  | 'grid'
  | 'gridcell'
  | 'group'
  | 'heading'
  | 'img'
  | 'link'
  | 'list'
  | 'listbox'
  | 'listitem'
  | 'log'
  | 'main'
  | 'marquee'
  | 'math'
  | 'menu'
  | 'menubar'
  | 'menuitem'
  | 'menuitemcheckbox'
  | 'menuitemradio'
  | 'navigation'
  | 'none'
  | 'note'
  | 'option'
  | 'presentation'
  | 'progressbar'
  | 'radio'
  | 'radiogroup'
  | 'region'
  | 'row'
  | 'rowgroup'
  | 'rowheader'
  | 'scrollbar'
  | 'search'
  | 'searchbox'
  | 'separator'
  | 'slider'
  | 'spinbutton'
  | 'status'
  | 'switch'
  | 'tab'
  | 'table'
  | 'tablist'
  | 'tabpanel'
  | 'term'
  | 'textbox'
  | 'timer'
  | 'toolbar'
  | 'tooltip'
  | 'tree'
  | 'treegrid'
  | 'treeitem'
  | (string & {});

// All the keys that must be removed
type UnwantedKeys =
  // We have our own
  | keyof HTMLAttributesBase
  | keyof DOMAttributes<any>
  // We don't support these
  | keyof ARIAMixin
  // We should use onEventName$ instead
  | keyof GlobalEventHandlers
  // deprecated or overridden or can't filter out automatically
  | 'enterKeyHint'
  | 'innerText'
  | 'innerHTML'
  | 'outerHTML'
  | 'inputMode'
  | 'outerText'
  | 'nodeValue'
  | 'textContent';

interface HTMLAttributesBase extends AriaAttributes {
  /** @deprecated Use `class` instead */
  className?: ClassList | undefined;
  contentEditable?: 'true' | 'false' | 'inherit' | undefined;
  style?: CSSProperties | string | undefined;
  role?: AriaRole | undefined;

  about?: string | undefined;
  datatype?: string | undefined;
  inlist?: any;
  property?: string | undefined;
  resource?: string | undefined;
  typeof?: string | undefined;
  vocab?: string | undefined;

  autoCapitalize?: 'none' | 'off' | 'sentences' | 'on' | 'words' | 'characters' | undefined;
  autoCorrect?: string | undefined;
  autoFocus?: boolean | undefined;
  autoSave?: string | undefined;
  hidden?: boolean | 'hidden' | 'until-found' | undefined;
  itemProp?: string | undefined;
  itemScope?: boolean | undefined;
  itemType?: string | undefined;
  itemID?: string | undefined;
  itemRef?: string | undefined;
  results?: number | undefined;
  translate?: 'yes' | 'no' | undefined;
  security?: string | undefined;
  unselectable?: 'on' | 'off' | undefined;

  /**
   * Hints at the type of data that might be entered by the user while editing the element or its
   * contents
   *
   * @see https://html.spec.whatwg.org/multipage/interaction.html#input-modalities:-the-inputmode-attribute
   */
  inputMode?:
    | 'none'
    | 'text'
    | 'tel'
    | 'url'
    | 'email'
    | 'numeric'
    | 'decimal'
    | 'search'
    | undefined;
  /**
   * Specify that a standard HTML element should behave like a defined custom built-in element
   *
   * @see https://html.spec.whatwg.org/multipage/custom-elements.html#attr-is
   */
  is?: string | undefined;

  popover?: 'manual' | 'auto' | undefined;
}

/** @public */
export interface HTMLElementAttrs extends HTMLAttributesBase, FilterBase<HTMLElement> {}

/** @public */
export interface HTMLAttributes<E extends Element> extends HTMLElementAttrs, DOMAttributes<E> {}

type Prettify<T> = {} & {
  [K in keyof T]: T[K];
};

type IfEquals<X, Y, A, B> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? A : B;
type IsReadOnlyKey<T, K extends keyof T> = IfEquals<
  { [Q in K]: T[K] },
  { -readonly [Q in K]: T[K] },
  false,
  true
>;
type IsAcceptableDOMValue<T> = T extends boolean | number | string | null | undefined
  ? ((...args: any[]) => any) extends T
    ? false
    : true
  : false;

/** Only keep props that are specific to the element and make partial */
type Filtered<T, A = {}> = {
  [K in keyof Omit<FilterBase<T>, keyof HTMLAttributes<any> | keyof A>]?: T[K];
};
type FilterBase<T> = {
  [K in keyof T as K extends string
    ? // No uppercase keys
      K extends Uppercase<K>
      ? never
      : // No `any` values
        any extends T[K]
        ? never
        : // Only allow basic types
          false extends IsAcceptableDOMValue<T[K]>
          ? never
          : // No readonly values
            IsReadOnlyKey<T, K> extends true
            ? never
            : K extends UnwantedKeys
              ? never
              : // Ok this key is allowed
                K
    : never]?: T[K];
};
/**
 * Replace given element's props with custom types and return all props specific to the element. Use
 * this for known props that are incorrect or missing.
 *
 * Uses Prettify so we see the special props for each element in editor hover
 */
type Augmented<E, A = {}> = Prettify<Filtered<E, A> & A>;

type TableCellSpecialAttrs = {
  align?: 'left' | 'center' | 'right' | 'justify' | 'char' | undefined;
  height?: Size | undefined;
  width?: Size | undefined;
  valign?: 'top' | 'middle' | 'bottom' | 'baseline' | undefined;
};
type MediaSpecialAttrs = {
  crossOrigin?: HTMLCrossOriginAttribute;
};
type PopoverTargetAction = 'hide' | 'show' | 'toggle';

type SpecialAttrs = {
  a: {
    download?: any;
    target?: HTMLAttributeAnchorTarget | undefined;
    referrerPolicy?: HTMLAttributeReferrerPolicy | undefined;
  };
  area: {
    referrerPolicy?: HTMLAttributeReferrerPolicy | undefined;
    children?: undefined;
  };
  audio: MediaSpecialAttrs;
  base: {
    children?: undefined;
  };
  button: {
    form?: string | undefined;
    value?: string | ReadonlyArray<string> | number | undefined;
    popovertarget?: string | undefined;
    popovertargetaction?: PopoverTargetAction | undefined;
  };
  canvas: {
    height?: Size | undefined;
    width?: Size | undefined;
  };
  col: {
    width?: Size | undefined;
    children?: undefined;
  };
  data: {
    value?: string | ReadonlyArray<string> | number | undefined;
  };
  embed: {
    height?: Size | undefined;
    width?: Size | undefined;
    children?: undefined;
  };
  fieldset: {
    form?: string | undefined;
  };
  hr: {
    children?: undefined;
  };
  iframe: {
    allowTransparency?: boolean | undefined;
    /** @deprecated Deprecated */
    frameBorder?: number | string | undefined;
    height?: Size | undefined;
    loading?: 'eager' | 'lazy' | undefined;
    sandbox?: string | undefined;
    seamless?: boolean | undefined;
    width?: Size | undefined;
    children?: undefined;
  };
  img: {
    crossOrigin?: HTMLCrossOriginAttribute;
    /** Intrinsic height of the image in pixels. */
    height?: Numberish | undefined;
    referrerPolicy?: HTMLAttributeReferrerPolicy | undefined;
    /** Intrinsic width of the image in pixels. */
    width?: Numberish | undefined;
    children?: undefined;
  };
  input: {
    /**
     * For type: HTMLInputTypeAttribute, excluding 'button' | 'color' | 'file' | 'hidden' | 'image'|
     * 'range' | 'reset' | 'submit' | 'checkbox' | 'radio'
     */
    autoComplete?:
      | HTMLInputAutocompleteAttribute
      | Omit<HTMLInputAutocompleteAttribute, string>
      | undefined;
    /** For type: 'checkbox' | 'radio' */
    'bind:checked'?: Signal<boolean | undefined>;
    /**
     * For type: HTMLInputTypeAttribute, excluding 'button' | 'reset' | 'submit' | 'checkbox' |
     * 'radio'
     */
    'bind:value'?: Signal<string | undefined | number>;
    enterKeyHint?: 'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send' | undefined;
    height?: Size | undefined;
    max?: number | string | undefined;
    maxLength?: number | undefined;
    min?: number | string | undefined;
    minLength?: number | undefined;
    step?: number | string | undefined;
    type?: HTMLInputTypeAttribute | undefined;
    value?: string | ReadonlyArray<string> | number | undefined | null | FormDataEntryValue;
    width?: Size | undefined;
    children?: undefined;
    /** For type: 'button' */
    popovertarget?: string | undefined;
    popovertargetaction?: PopoverTargetAction | undefined;
  };
  label: {
    form?: string | undefined;
    for?: string | undefined;
    /** @deprecated Use `for` */
    htmlFor?: string | undefined;
  };
  li: {
    value?: string | ReadonlyArray<string> | number | undefined;
  };
  link: {
    crossOrigin?: HTMLCrossOriginAttribute;
    referrerPolicy?: HTMLAttributeReferrerPolicy | undefined;
    sizes?: string | undefined;
    type?: string | undefined;
    /** @deprecated Use `charset` instead */
    charSet?: string | undefined;
    charset?: string | undefined;
    children?: undefined;
  };
  meta: {
    /** @deprecated Use `charset` instead */
    charSet?: 'utf-8' | undefined;
    /** Qwik only supports utf-8 */
    charset?: 'utf-8' | undefined;
    children?: undefined;
  };
  meter: {
    form?: string | undefined;
    value?: string | ReadonlyArray<string> | number | undefined;
  };
  object: {
    classID?: string | undefined;
    form?: string | undefined;
    height?: Size | undefined;
    width?: Size | undefined;
    wmode?: string | undefined;
  };
  ol: {
    type?: '1' | 'a' | 'A' | 'i' | 'I' | undefined;
  };
  optgroup: {
    disabled?: boolean | undefined;
    // not sure if correct
    label?: string | undefined;
  };
  option: {
    value?: string | ReadonlyArray<string> | number | undefined;
    children?: string;
  };
  output: {
    form?: string | undefined;
    for?: string | undefined;
    /** @deprecated Use `for` instead */
    htmlFor?: string | undefined;
  };
  param: {
    value?: string | ReadonlyArray<string> | number | undefined;
    children?: undefined;
  };
  progress: {
    max?: number | string | undefined;
    value?: string | ReadonlyArray<string> | number | undefined;
  };
  script: {
    crossOrigin?: HTMLCrossOriginAttribute;
    referrerPolicy?: HTMLAttributeReferrerPolicy | undefined;
  };
  select: {
    form?: string | undefined;
    value?: string | ReadonlyArray<string> | number | undefined;
    'bind:value'?: Signal<string | undefined>;
  };
  source: {
    /** Allowed if the parent is a `picture` element */
    height?: Size | undefined;
    /** Allowed if the parent is a `picture` element */
    width?: Size | undefined;
    children?: undefined;
  };
  style: {
    // not sure if correct
    scoped?: boolean | undefined;
    children?: string;
  };
  table: {
    cellPadding?: number | string | undefined;
    cellSpacing?: number | string | undefined;
    width?: Size | undefined;
  };
  td: TableCellSpecialAttrs;
  th: TableCellSpecialAttrs;
  title: {
    children?: string;
  };
  textarea: {
    enterKeyHint?: 'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send' | undefined;
    form?: string | undefined;
    value?: string | ReadonlyArray<string> | number | undefined;
    'bind:value'?: Signal<string | undefined>;
    children?: string;
  };
  track: {
    children?: undefined;
  };
  video: MediaSpecialAttrs & {
    height?: Numberish | undefined;
    width?: Numberish | undefined;
    disablePictureInPicture?: boolean | undefined;
    disableRemotePlayback?: boolean | undefined;
  };
} & {
  [key: string]: {};
};

type Attrs<
  Name extends keyof HTMLElementTagNameMap,
  EL extends Element = HTMLElementTagNameMap[Name],
  AttrEl = HTMLElementTagNameMap[Name],
> = HTMLAttributes<EL> & Augmented<AttrEl, SpecialAttrs[Name]>;

/** @public */
export type HTMLAttributeAnchorTarget = '_self' | '_blank' | '_parent' | '_top' | (string & {});
/** @public */
export type HTMLAttributeReferrerPolicy = ReferrerPolicy;
/** @public */
export interface AnchorHTMLAttributes<T extends Element> extends Attrs<'a', T> {}
/** @public */
export interface AreaHTMLAttributes<T extends Element> extends Attrs<'area', T> {}
/** @public */
export interface MediaHTMLAttributes<T extends Element>
  extends HTMLAttributes<T>,
    Augmented<HTMLMediaElement, { crossOrigin?: HTMLCrossOriginAttribute }> {}
/** @public */
export interface AudioHTMLAttributes<T extends Element> extends Attrs<'audio', T> {}
/** @public */
export interface BaseHTMLAttributes<T extends Element> extends Attrs<'base', T> {}
/** @public */
export interface BlockquoteHTMLAttributes<T extends Element> extends Attrs<'blockquote', T> {}
/** @public */
export interface ButtonHTMLAttributes<T extends Element> extends Attrs<'button', T> {}
/** @public */
export interface CanvasHTMLAttributes<T extends Element> extends Attrs<'canvas', T> {}
/** @public */
export interface ColHTMLAttributes<T extends Element> extends Attrs<'col', T> {}
/** @public */
export interface ColgroupHTMLAttributes<T extends Element> extends Attrs<'colgroup', T> {}
/** @public */
export interface DataHTMLAttributes<T extends Element> extends Attrs<'data', T> {}
/** @public */
export interface DelHTMLAttributes<T extends Element> extends Attrs<'del', T> {}
/** @public */
export interface DetailsHTMLAttributes<T extends Element> extends Attrs<'details', T> {}
/** @public */
export interface DialogHTMLAttributes<T extends Element> extends Attrs<'dialog', T> {}
/** @public */
export interface EmbedHTMLAttributes<T extends Element> extends Attrs<'embed', T> {}
/** @public */
export interface FieldsetHTMLAttributes<T extends Element> extends Attrs<'fieldset', T> {}
/** @public */
export interface FormHTMLAttributes<T extends Element> extends Attrs<'form', T> {}
/** @public */
export interface HtmlHTMLAttributes<T extends Element> extends Attrs<'html', T> {}
/** @public */
export interface IframeHTMLAttributes<T extends Element> extends Attrs<'iframe', T> {}
/** @public */
export interface ImgHTMLAttributes<T extends Element> extends Attrs<'img', T> {}
/** @public */
export interface HrHTMLAttributes<T extends Element> extends Attrs<'hr', T> {}
/** @public */
export type HTMLCrossOriginAttribute = 'anonymous' | 'use-credentials' | '' | undefined;
/** @public */
export type HTMLInputTypeAttribute =
  | 'button'
  | 'checkbox'
  | 'color'
  | 'date'
  | 'datetime-local'
  | 'email'
  | 'file'
  | 'hidden'
  | 'image'
  | 'month'
  | 'number'
  | 'password'
  | 'radio'
  | 'range'
  | 'reset'
  | 'search'
  | 'submit'
  | 'tel'
  | 'text'
  | 'time'
  | 'url'
  | 'week'
  | (string & {});

/** @public */
export type HTMLInputAutocompleteAttribute =
  | 'on'
  | 'off'
  | 'billing'
  | 'shipping'
  | 'name'
  | 'honorific-prefix'
  | 'given-name'
  | 'additional-name'
  | 'family-name'
  | 'honorific-suffix'
  | 'nickname'
  | 'username'
  | 'new-password'
  | 'current-password'
  | 'one-time-code'
  | 'organization-title'
  | 'organization'
  | 'street-address'
  | 'address-line1'
  | 'address-line2'
  | 'address-line3'
  | 'address-level4'
  | 'address-level3'
  | 'address-level2'
  | 'address-level1'
  | 'country'
  | 'country-name'
  | 'postal-code'
  | 'cc-name'
  | 'cc-given-name'
  | 'cc-additional-name'
  | 'cc-family-name'
  | 'cc-number'
  | 'cc-exp'
  | 'cc-exp-month'
  | 'cc-exp-year'
  | 'cc-csc'
  | 'cc-type'
  | 'transaction-currency'
  | 'transaction-amount'
  | 'language'
  | 'bday'
  | 'bday-day'
  | 'bday-month'
  | 'bday-year'
  | 'sex'
  | 'url'
  | 'photo';

/** @public */
export type InputHTMLAttributes<T extends Element> = Attrs<'input', T, HTMLInputElement>;
/** @public */
export interface InsHTMLAttributes<T extends Element> extends Attrs<'ins', T> {}
/** @public @deprecated in html5 */
export interface KeygenHTMLAttributes<T extends Element> extends Attrs<'base', T> {}
/** @public */
export interface LabelHTMLAttributes<T extends Element> extends Attrs<'label', T> {}
/** @public */
export interface LiHTMLAttributes<T extends Element> extends Attrs<'li', T> {}
/** @public */
export interface LinkHTMLAttributes<T extends Element> extends Attrs<'link', T> {}
/** @public */
export interface MapHTMLAttributes<T extends Element> extends Attrs<'map', T> {}
/** @public */
export interface MenuHTMLAttributes<T extends Element> extends Attrs<'menu', T> {}
/** @public */
export interface MetaHTMLAttributes<T extends Element> extends Attrs<'meta', T> {}
/** @public */
export interface MeterHTMLAttributes<T extends Element> extends Attrs<'meter', T> {}
/** @public */
export interface ObjectHTMLAttributes<T extends Element> extends Attrs<'object', T> {}
/** @public */
export interface OlHTMLAttributes<T extends Element> extends Attrs<'ol', T> {}
/** @public */
export interface OptgroupHTMLAttributes<T extends Element> extends Attrs<'optgroup', T> {}
/** @public */
export interface OptionHTMLAttributes<T extends Element> extends Attrs<'option', T> {}
/** @public */
export interface OutputHTMLAttributes<T extends Element> extends Attrs<'output', T> {}
/** @public @deprecated Old DOM API */
export interface ParamHTMLAttributes<T extends Element>
  extends Attrs<'base', T, HTMLParamElement> {}
/** @public */
export interface ProgressHTMLAttributes<T extends Element> extends Attrs<'progress', T> {}
/** @public */
export interface QuoteHTMLAttributes<T extends Element> extends Attrs<'q', T> {}
/** @public */
export interface SlotHTMLAttributes<T extends Element> extends Attrs<'slot', T> {}
/** @public */
export interface ScriptHTMLAttributes<T extends Element> extends Attrs<'script', T> {}
/** @public */
export interface SelectHTMLAttributes<T extends Element> extends Attrs<'select', T> {}
/** @public */
export interface SourceHTMLAttributes<T extends Element> extends Attrs<'source', T> {}
/** @public */
export interface StyleHTMLAttributes<T extends Element> extends Attrs<'style', T> {}
/** @public */
export interface TableHTMLAttributes<T extends Element> extends Attrs<'table', T> {}
/** @public */
export interface TdHTMLAttributes<T extends Element> extends Attrs<'td', T> {}
/** @public */
export interface TextareaHTMLAttributes<T extends Element> extends Attrs<'textarea', T> {}
/** @public */
export interface ThHTMLAttributes<T extends Element> extends Attrs<'tr', T> {}
/** @public */
export interface TimeHTMLAttributes<T extends Element> extends Attrs<'time', T> {}
/** @public */
export interface TitleHTMLAttributes<T extends Element> extends Attrs<'title', T> {}
/** @public */
export interface TrackHTMLAttributes<T extends Element> extends Attrs<'track', T> {}
/** @public */
export interface VideoHTMLAttributes<T extends Element> extends Attrs<'video', T> {}

/**
 * @deprecated This is the type for a React Native WebView. It doesn't belong in Qwik (yet?) but
 *   we're keeping it for backwards compatibility.
 * @public
 */
export interface WebViewHTMLAttributes<T extends Element> extends HTMLAttributes<T> {
  allowFullScreen?: boolean | undefined;
  allowpopups?: boolean | undefined;
  autoFocus?: boolean | undefined;
  autosize?: boolean | undefined;
  blinkfeatures?: string | undefined;
  disableblinkfeatures?: string | undefined;
  disableguestresize?: boolean | undefined;
  disablewebsecurity?: boolean | undefined;
  guestinstance?: string | undefined;
  httpreferrer?: string | undefined;
  nodeintegration?: boolean | undefined;
  partition?: string | undefined;
  plugins?: boolean | undefined;
  preload?: string | undefined;
  src?: string | undefined;
  useragent?: string | undefined;
  webpreferences?: string | undefined;
}

/**
 * The TS types don't include the SVG attributes so we have to define them ourselves
 *
 * NOTE: These props are probably not complete
 *
 * @public
 */
export interface SVGAttributes<T extends Element = Element> extends AriaAttributes {
  color?: string | undefined;
  height?: Size | undefined;
  id?: string | undefined;
  lang?: string | undefined;
  max?: number | string | undefined;
  media?: string | undefined;
  method?: string | undefined;
  min?: number | string | undefined;
  name?: string | undefined;
  style?: CSSProperties | string | undefined;
  target?: string | undefined;
  type?: string | undefined;
  width?: Size | undefined;

  role?: string | undefined;
  tabindex?: number | undefined;
  crossOrigin?: HTMLCrossOriginAttribute;

  'accent-height'?: number | string | undefined;
  accumulate?: 'none' | 'sum' | undefined;
  additive?: 'replace' | 'sum' | undefined;
  'alignment-baseline'?:
    | 'auto'
    | 'baseline'
    | 'before-edge'
    | 'text-before-edge'
    | 'middle'
    | 'central'
    | 'after-edge'
    | 'text-after-edge'
    | 'ideographic'
    | 'alphabetic'
    | 'hanging'
    | 'mathematical'
    | 'inherit'
    | undefined;
  allowReorder?: 'no' | 'yes' | undefined;
  alphabetic?: number | string | undefined;
  amplitude?: number | string | undefined;
  'arabic-form'?: 'initial' | 'medial' | 'terminal' | 'isolated' | undefined;
  ascent?: number | string | undefined;
  attributeName?: string | undefined;
  attributeType?: string | undefined;
  autoReverse?: Booleanish | undefined;
  azimuth?: number | string | undefined;
  baseFrequency?: number | string | undefined;
  'baseline-shift'?: number | string | undefined;
  baseProfile?: number | string | undefined;
  bbox?: number | string | undefined;
  begin?: number | string | undefined;
  bias?: number | string | undefined;
  by?: number | string | undefined;
  calcMode?: number | string | undefined;
  'cap-height'?: number | string | undefined;
  clip?: number | string | undefined;
  'clip-path'?: string | undefined;
  clipPathUnits?: number | string | undefined;
  'clip-rule'?: number | string | undefined;
  'color-interpolation'?: number | string | undefined;
  'color-interpolation-filters'?: 'auto' | 's-rGB' | 'linear-rGB' | 'inherit' | undefined;
  'color-profile'?: number | string | undefined;
  'color-rendering'?: number | string | undefined;
  contentScriptType?: number | string | undefined;
  contentStyleType?: number | string | undefined;
  cursor?: number | string;
  cx?: number | string | undefined;
  cy?: number | string | undefined;
  d?: string | undefined;
  decelerate?: number | string | undefined;
  descent?: number | string | undefined;
  diffuseConstant?: number | string | undefined;
  direction?: number | string | undefined;
  display?: number | string | undefined;
  divisor?: number | string | undefined;
  'dominant-baseline'?: number | string | undefined;
  dur?: number | string | undefined;
  dx?: number | string | undefined;
  dy?: number | string | undefined;
  'edge-mode'?: number | string | undefined;
  elevation?: number | string | undefined;
  'enable-background'?: number | string | undefined;
  end?: number | string | undefined;
  exponent?: number | string | undefined;
  externalResourcesRequired?: number | string | undefined;
  fill?: string | undefined;
  'fill-opacity'?: number | string | undefined;
  'fill-rule'?: 'nonzero' | 'evenodd' | 'inherit' | undefined;
  filter?: string | undefined;
  filterRes?: number | string | undefined;
  filterUnits?: number | string | undefined;
  'flood-color'?: number | string | undefined;
  'flood-opacity'?: number | string | undefined;
  focusable?: number | string | undefined;
  'font-family'?: string | undefined;
  'font-size'?: number | string | undefined;
  'font-size-adjust'?: number | string | undefined;
  'font-stretch'?: number | string | undefined;
  'font-style'?: number | string | undefined;
  'font-variant'?: number | string | undefined;
  'font-weight'?: number | string | undefined;
  format?: number | string | undefined;
  fr?: number | string | undefined;
  from?: number | string | undefined;
  fx?: number | string | undefined;
  fy?: number | string | undefined;
  g1?: number | string | undefined;
  g2?: number | string | undefined;
  'glyph-name'?: number | string | undefined;
  'glyph-orientation-horizontal'?: number | string | undefined;
  'glyph-orientation-vertical'?: number | string | undefined;
  glyphRef?: number | string | undefined;
  gradientTransform?: string | undefined;
  gradientUnits?: string | undefined;
  hanging?: number | string | undefined;
  'horiz-adv-x'?: number | string | undefined;
  'horiz-origin-x'?: number | string | undefined;
  href?: string | undefined;
  ideographic?: number | string | undefined;
  'image-rendering'?: number | string | undefined;
  in2?: number | string | undefined;
  in?: string | undefined;
  intercept?: number | string | undefined;
  k1?: number | string | undefined;
  k2?: number | string | undefined;
  k3?: number | string | undefined;
  k4?: number | string | undefined;
  k?: number | string | undefined;
  kernelMatrix?: number | string | undefined;
  kernelUnitLength?: number | string | undefined;
  kerning?: number | string | undefined;
  keyPoints?: number | string | undefined;
  keySplines?: number | string | undefined;
  keyTimes?: number | string | undefined;
  lengthAdjust?: number | string | undefined;
  'letter-spacing'?: number | string | undefined;
  'lighting-color'?: number | string | undefined;
  limitingConeAngle?: number | string | undefined;
  local?: number | string | undefined;
  'marker-end'?: string | undefined;
  markerHeight?: number | string | undefined;
  'marker-mid'?: string | undefined;
  'marker-start'?: string | undefined;
  markerUnits?: number | string | undefined;
  markerWidth?: number | string | undefined;
  mask?: string | undefined;
  maskContentUnits?: number | string | undefined;
  maskUnits?: number | string | undefined;
  mathematical?: number | string | undefined;
  mode?: number | string | undefined;
  numOctaves?: number | string | undefined;
  offset?: number | string | undefined;
  opacity?: number | string | undefined;
  operator?: number | string | undefined;
  order?: number | string | undefined;
  orient?: number | string | undefined;
  orientation?: number | string | undefined;
  origin?: number | string | undefined;
  overflow?: number | string | undefined;
  'overline-position'?: number | string | undefined;
  'overline-thickness'?: number | string | undefined;
  'paint-order'?: number | string | undefined;
  panose1?: number | string | undefined;
  path?: string | undefined;
  pathLength?: number | string | undefined;
  patternContentUnits?: string | undefined;
  patternTransform?: number | string | undefined;
  patternUnits?: string | undefined;
  'pointer-events'?: number | string | undefined;
  points?: string | undefined;
  pointsAtX?: number | string | undefined;
  pointsAtY?: number | string | undefined;
  pointsAtZ?: number | string | undefined;
  preserveAlpha?: number | string | undefined;
  preserveAspectRatio?: string | undefined;
  primitiveUnits?: number | string | undefined;
  r?: number | string | undefined;
  radius?: number | string | undefined;
  refX?: number | string | undefined;
  refY?: number | string | undefined;
  'rendering-intent'?: number | string | undefined;
  repeatCount?: number | string | undefined;
  repeatDur?: number | string | undefined;
  requiredextensions?: number | string | undefined;
  requiredFeatures?: number | string | undefined;
  restart?: number | string | undefined;
  result?: string | undefined;
  rotate?: number | string | undefined;
  rx?: number | string | undefined;
  ry?: number | string | undefined;
  scale?: number | string | undefined;
  seed?: number | string | undefined;
  'shape-rendering'?: number | string | undefined;
  slope?: number | string | undefined;
  spacing?: number | string | undefined;
  specularConstant?: number | string | undefined;
  specularExponent?: number | string | undefined;
  speed?: number | string | undefined;
  spreadMethod?: string | undefined;
  startOffset?: number | string | undefined;
  stdDeviation?: number | string | undefined;
  stemh?: number | string | undefined;
  stemv?: number | string | undefined;
  stitchTiles?: number | string | undefined;
  'stop-color'?: string | undefined;
  'stop-opacity'?: number | string | undefined;
  'strikethrough-position'?: number | string | undefined;
  'strikethrough-thickness'?: number | string | undefined;
  string?: number | string | undefined;
  stroke?: string | undefined;
  'stroke-dasharray'?: string | number | undefined;
  'stroke-dashoffset'?: string | number | undefined;
  'stroke-linecap'?: 'butt' | 'round' | 'square' | 'inherit' | undefined;
  'stroke-linejoin'?: 'miter' | 'round' | 'bevel' | 'inherit' | undefined;
  'stroke-miterlimit'?: string | undefined;
  'stroke-opacity'?: number | string | undefined;
  'stroke-width'?: number | string | undefined;
  surfaceScale?: number | string | undefined;
  systemLanguage?: number | string | undefined;
  tableValues?: number | string | undefined;
  targetX?: number | string | undefined;
  targetY?: number | string | undefined;
  'text-anchor'?: string | undefined;
  'text-decoration'?: number | string | undefined;
  textLength?: number | string | undefined;
  'text-rendering'?: number | string | undefined;
  to?: number | string | undefined;
  transform?: string | undefined;
  u1?: number | string | undefined;
  u2?: number | string | undefined;
  'underline-position'?: number | string | undefined;
  'underline-thickness'?: number | string | undefined;
  unicode?: number | string | undefined;
  'unicode-bidi'?: number | string | undefined;
  'unicode-range'?: number | string | undefined;
  'units-per-em'?: number | string | undefined;
  'v-alphabetic'?: number | string | undefined;
  values?: string | undefined;
  'vector-effect'?: number | string | undefined;
  version?: string | undefined;
  'vert-adv-y'?: number | string | undefined;
  'vert-origin-x'?: number | string | undefined;
  'vert-origin-y'?: number | string | undefined;
  'v-hanging'?: number | string | undefined;
  'v-ideographic'?: number | string | undefined;
  viewBox?: string | undefined;
  viewTarget?: number | string | undefined;
  visibility?: number | string | undefined;
  'v-mathematical'?: number | string | undefined;
  widths?: number | string | undefined;
  'word-spacing'?: number | string | undefined;
  'writing-mode'?: number | string | undefined;
  x1?: number | string | undefined;
  x2?: number | string | undefined;
  x?: number | string | undefined;
  'x-channel-selector'?: string | undefined;
  'x-height'?: number | string | undefined;
  'xlink:actuate'?: string | undefined;
  'xlink:arcrole'?: string | undefined;
  'xlink:href'?: string | undefined;
  'xlink:role'?: string | undefined;
  'xlink:show'?: string | undefined;
  'xlink:title'?: string | undefined;
  'xlink:type'?: string | undefined;
  'xml:base'?: string | undefined;
  'xml:lang'?: string | undefined;
  'xml:space'?: string | undefined;
  xmlns?: string | undefined;
  'xmlns:xlink'?: string | undefined;
  y1?: number | string | undefined;
  y2?: number | string | undefined;
  y?: number | string | undefined;
  yChannelSelector?: string | undefined;
  z?: number | string | undefined;
  zoomAndPan?: string | undefined;
}
/** @public */
export interface SVGProps<T extends Element> extends SVGAttributes, QwikAttributes<T> {}
/** @internal */
export interface LenientSVGProps<T extends Element> extends SVGAttributes, DOMAttributes<T> {}
/** @public */
export interface IntrinsicElements extends IntrinsicHTMLElements, IntrinsicSVGElements {}

/**
 * These are the HTML tags with handlers allowing plain callbacks, to be used for the JSX interface
 *
 * @internal
 */
export type IntrinsicHTMLElements = {
  // Generating it this way shows the special props for each element in editor hover
  [key in keyof HTMLElementTagNameMap]: Augmented<HTMLElementTagNameMap[key], SpecialAttrs[key]> &
    HTMLAttributes<HTMLElementTagNameMap[key]>;
} & {
  /** For unknown tags we allow all props */
  [unknownTag: string]: { [prop: string]: any } & HTMLElementAttrs & HTMLAttributes<any>;
};
/**
 * These are the SVG tags with handlers allowing plain callbacks, to be used for the JSX interface
 *
 * @internal
 */
export type IntrinsicSVGElements = {
  [K in keyof Omit<SVGElementTagNameMap, keyof HTMLElementTagNameMap>]: LenientSVGProps<
    SVGElementTagNameMap[K]
  >;
};

/**
 * The DOM props without plain handlers, for use inside functions
 *
 * @public
 */
export type QwikHTMLElements = {
  [tag in keyof HTMLElementTagNameMap]: Augmented<HTMLElementTagNameMap[tag], SpecialAttrs[tag]> &
    HTMLElementAttrs &
    QwikAttributes<HTMLElementTagNameMap[tag]>;
};
/**
 * The SVG props without plain handlers, for use inside functions
 *
 * @public
 */
export type QwikSVGElements = {
  [K in keyof Omit<SVGElementTagNameMap, keyof HTMLElementTagNameMap>]: SVGProps<
    SVGElementTagNameMap[K]
  >;
};
