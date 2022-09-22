/* eslint-disable */

import type { ValueOrSignal } from '../../../object/q-object';
import type { DOMAttributes } from './jsx-qwik-attributes';
interface HTMLWebViewElement extends HTMLElement {}
interface ClassAttributes<T> {}
export type Booleanish = 'true' | 'false';
export type VNumber = ValueOrSignal<number | undefined>;
export type VString = ValueOrSignal<string | undefined>;

/**
 * @public
 */
export interface AriaAttributes {
  /** Identifies the currently active element when DOM focus is on a composite widget, textbox, group, or application. */
  'aria-activedescendant'?: VString;
  /** Indicates whether assistive technologies will present all, or only parts of, the changed region based on the change notifications defined by the aria-relevant attribute. */
  'aria-atomic'?: ValueOrSignal<Booleanish | undefined>;
  /**
   * Indicates whether inputting text could trigger display of one or more predictions of the user's intended value for an input and specifies how predictions would be
   * presented if they are made.
   */
  'aria-autocomplete'?: 'none' | 'inline' | 'list' | 'both' | undefined;
  /** Indicates an element is being modified and that assistive technologies MAY want to wait until the modifications are complete before exposing them to the user. */
  'aria-busy'?: ValueOrSignal<Booleanish | undefined>;
  /**
   * Indicates the current "checked" state of checkboxes, radio buttons, and other widgets.
   * @see aria-pressed @see aria-selected.
   */
  'aria-checked'?: boolean | 'false' | 'mixed' | 'true' | undefined;
  /**
   * Defines the total number of columns in a table, grid, or treegrid.
   * @see aria-colindex.
   */
  'aria-colcount'?: VNumber;
  /**
   * Defines an element's column index or position with respect to the total number of columns within a table, grid, or treegrid.
   * @see aria-colcount @see aria-colspan.
   */
  'aria-colindex'?: VNumber;
  /**
   * Defines the number of columns spanned by a cell or gridcell within a table, grid, or treegrid.
   * @see aria-colindex @see aria-rowspan.
   */
  'aria-colspan'?: VNumber;
  /**
   * Identifies the element (or elements) whose contents or presence are controlled by the current element.
   * @see aria-owns.
   */
  'aria-controls'?: VString;
  /** Indicates the element that represents the current item within a container or set of related elements. */
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
   * @see aria-labelledby
   */
  'aria-describedby'?: VString;
  /**
   * Identifies the element that provides a detailed, extended description for the object.
   * @see aria-describedby.
   */
  'aria-details'?: VString;
  /**
   * Indicates that the element is perceivable but disabled, so it is not editable or otherwise operable.
   * @see aria-hidden @see aria-readonly.
   */
  'aria-disabled'?: ValueOrSignal<Booleanish | undefined>;
  /**
   * Indicates what functions can be performed when a dragged object is released on the drop target.
   * @deprecated in ARIA 1.1
   */
  'aria-dropeffect'?: ValueOrSignal<
    'none' | 'copy' | 'execute' | 'link' | 'move' | 'popup' | undefined
  >;
  /**
   * Identifies the element that provides an error message for the object.
   * @see aria-invalid @see aria-describedby.
   */
  'aria-errormessage'?: VString;
  /** Indicates whether the element, or another grouping element it controls, is currently expanded or collapsed. */
  'aria-expanded'?: ValueOrSignal<Booleanish | undefined>;
  /**
   * Identifies the next element (or elements) in an alternate reading order of content which, at the user's discretion,
   * allows assistive technology to override the general default of reading in document source order.
   */
  'aria-flowto'?: VString;
  /**
   * Indicates an element's "grabbed" state in a drag-and-drop operation.
   * @deprecated in ARIA 1.1
   */
  'aria-grabbed'?: ValueOrSignal<Booleanish | undefined>;
  /** Indicates the availability and type of interactive popup element, such as menu or dialog, that can be triggered by an element. */
  'aria-haspopup'?: ValueOrSignal<
    boolean | 'false' | 'true' | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog' | undefined
  >;
  /**
   * Indicates whether the element is exposed to an accessibility API.
   * @see aria-disabled.
   */
  'aria-hidden'?: ValueOrSignal<Booleanish | undefined>;
  /**
   * Indicates whether the element is exposed to an accessibility API.
   * @see aria-disabled.
   */
  ariaHidden?: ValueOrSignal<Booleanish | undefined>;
  /**
   * Indicates the entered value does not conform to the format expected by the application.
   * @see aria-errormessage.
   */
  'aria-invalid'?: ValueOrSignal<boolean | 'false' | 'true' | 'grammar' | 'spelling' | undefined>;
  /** Indicates keyboard shortcuts that an author has implemented to activate or give focus to an element. */
  'aria-keyshortcuts'?: VString;
  /**
   * Defines a string value that labels the current element.
   * @see aria-labelledby.
   */
  'aria-label'?: VString;
  /**
   * Identifies the element (or elements) that labels the current element.
   * @see aria-describedby.
   */
  'aria-labelledby'?: VString;
  /** Defines the hierarchical level of an element within a structure. */
  'aria-level'?: VNumber;
  /** Indicates that an element will be updated, and describes the types of updates the user agents, assistive technologies, and user can expect from the live region. */
  'aria-live'?: ValueOrSignal<'off' | 'assertive' | 'polite' | undefined>;
  /** Indicates whether an element is modal when displayed. */
  'aria-modal'?: ValueOrSignal<Booleanish | undefined>;
  /** Indicates whether a text box accepts multiple lines of input or only a single line. */
  'aria-multiline'?: ValueOrSignal<Booleanish | undefined>;
  /** Indicates that the user may select more than one item from the current selectable descendants. */
  'aria-multiselectable'?: ValueOrSignal<Booleanish | undefined>;
  /** Indicates whether the element's orientation is horizontal, vertical, or unknown/ambiguous. */
  'aria-orientation'?: 'horizontal' | 'vertical' | undefined;
  /**
   * Identifies an element (or elements) in order to define a visual, functional, or contextual parent/child relationship
   * between DOM elements where the DOM hierarchy cannot be used to represent the relationship.
   * @see aria-controls.
   */
  'aria-owns'?: VString;
  /**
   * Defines a short hint (a word or short phrase) intended to aid the user with data entry when the control has no value.
   * A hint could be a sample value or a brief description of the expected format.
   */
  'aria-placeholder'?: VString;
  /**
   * Defines an element's number or position in the current set of listitems or treeitems. Not required if all elements in the set are present in the DOM.
   * @see aria-setsize.
   */
  'aria-posinset'?: VNumber;
  /**
   * Indicates the current "pressed" state of toggle buttons.
   * @see aria-checked @see aria-selected.
   */
  'aria-pressed'?: ValueOrSignal<boolean | 'false' | 'mixed' | 'true' | undefined>;
  /**
   * Indicates that the element is not editable, but is otherwise operable.
   * @see aria-disabled.
   */
  'aria-readonly'?: ValueOrSignal<Booleanish | undefined>;
  /**
   * Indicates what notifications the user agent will trigger when the accessibility tree within a live region is modified.
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
  'aria-required'?: ValueOrSignal<Booleanish | undefined>;
  /** Defines a human-readable, author-localized description for the role of an element. */
  'aria-roledescription'?: VString;
  /**
   * Defines the total number of rows in a table, grid, or treegrid.
   * @see aria-rowindex.
   */
  'aria-rowcount'?: VNumber;
  /**
   * Defines an element's row index or position with respect to the total number of rows within a table, grid, or treegrid.
   * @see aria-rowcount @see aria-rowspan.
   */
  'aria-rowindex'?: VNumber;
  /**
   * Defines the number of rows spanned by a cell or gridcell within a table, grid, or treegrid.
   * @see aria-rowindex @see aria-colspan.
   */
  'aria-rowspan'?: VNumber;
  /**
   * Indicates the current "selected" state of various widgets.
   * @see aria-checked @see aria-pressed.
   */
  'aria-selected'?: ValueOrSignal<Booleanish | undefined>;
  /**
   * Defines the number of items in the current set of listitems or treeitems. Not required if all elements in the set are present in the DOM.
   * @see aria-posinset.
   */
  'aria-setsize'?: VNumber;
  /** Indicates if items in a table or grid are sorted in ascending or descending order. */
  'aria-sort'?: 'none' | 'ascending' | 'descending' | 'other' | undefined;
  /** Defines the maximum allowed value for a range widget. */
  'aria-valuemax'?: VNumber;
  /** Defines the minimum allowed value for a range widget. */
  'aria-valuemin'?: VNumber;
  /**
   * Defines the current value for a range widget.
   * @see aria-valuetext.
   */
  'aria-valuenow'?: VNumber;
  /** Defines the human readable text alternative of aria-valuenow for a range widget. */
  'aria-valuetext'?: VString;
}

/**
 * @public
 */
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

/**
 * @public
 */
export interface HTMLAttributes<T> extends AriaAttributes, DOMAttributes<T> {
  accessKey?: VString;
  className?: VString;
  contentEditable?: Booleanish | 'inherit' | undefined;
  contextMenu?: VString;
  dir?: 'ltr' | 'rtl' | 'auto' | undefined;
  draggable?: ValueOrSignal<Booleanish | undefined>;
  hidden?: ValueOrSignal<boolean | undefined>;
  id?: VString;
  lang?: VString;
  placeholder?: VString;
  slot?: VString;
  spellCheck?: ValueOrSignal<Booleanish | undefined>;
  style?: Record<string, ValueOrSignal<number | string | undefined>> | string | undefined;
  tabIndex?: VNumber;
  title?: VString;
  translate?: 'yes' | 'no' | undefined;

  radioGroup?: VString; // <command>, <menuitem>

  role?: ValueOrSignal<AriaRole | undefined>;

  about?: VString;
  datatype?: VString;
  inlist?: any;
  prefix?: VString;
  property?: VString;
  resource?: VString;
  typeof?: VString;
  vocab?: VString;

  autoCapitalize?: VString;
  autoCorrect?: VString;
  autoSave?: VString;
  color?: VString;
  itemProp?: VString;
  itemScope?: ValueOrSignal<boolean | undefined>;
  itemType?: VString;
  itemID?: VString;
  itemRef?: VString;
  results?: VNumber;
  security?: VString;
  unselectable?: 'on' | 'off' | undefined;

  /**
   * Hints at the type of data that might be entered by the user while editing the element or its contents
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
   * @see https://html.spec.whatwg.org/multipage/custom-elements.html#attr-is
   */
  is?: VString;
}
export type HTMLAttributeAnchorTarget = '_self' | '_blank' | '_parent' | '_top' | (string & {});
export type HTMLAttributeReferrerPolicy =
  | ''
  | 'no-referrer'
  | 'no-referrer-when-downgrade'
  | 'origin'
  | 'origin-when-cross-origin'
  | 'same-origin'
  | 'strict-origin'
  | 'strict-origin-when-cross-origin'
  | 'unsafe-url';
export interface AnchorHTMLAttributes<T> extends HTMLAttributes<T> {
  download?: any;
  href?: VString;
  hrefLang?: VString;
  media?: VString;
  ping?: VString;
  rel?: VString;
  target?: HTMLAttributeAnchorTarget | undefined;
  type?: VString;
  referrerPolicy?: HTMLAttributeReferrerPolicy | undefined;
}
export interface AreaHTMLAttributes<T> extends HTMLAttributes<T> {
  alt?: VString;
  coords?: VString;
  download?: any;
  href?: VString;
  hrefLang?: VString;
  media?: VString;
  referrerPolicy?: HTMLAttributeReferrerPolicy | undefined;
  rel?: VString;
  shape?: VString;
  target?: VString;
}
export interface MediaHTMLAttributes<T> extends HTMLAttributes<T> {
  autoPlay?: ValueOrSignal<boolean | undefined>;
  controls?: ValueOrSignal<boolean | undefined>;
  controlsList?: VString;
  crossOrigin?: HTMLCrossOriginAttribute;
  loop?: ValueOrSignal<boolean | undefined>;
  mediaGroup?: VString;
  muted?: ValueOrSignal<boolean | undefined>;
  playsInline?: ValueOrSignal<boolean | undefined>;
  preload?: VString;
  src?: VString;
}
export interface AudioHTMLAttributes<T> extends MediaHTMLAttributes<T> {}
export interface BaseHTMLAttributes<T> extends HTMLAttributes<T> {
  href?: VString;
  target?: VString;
}
export interface BlockquoteHTMLAttributes<T> extends HTMLAttributes<T> {
  cite?: VString;
}
export interface ButtonHTMLAttributes<T> extends HTMLAttributes<T> {
  autoFocus?: ValueOrSignal<boolean | undefined>;
  disabled?: ValueOrSignal<boolean | undefined>;
  form?: VString;
  formAction?: VString;
  formEncType?: VString;
  formMethod?: VString;
  formNoValidate?: ValueOrSignal<boolean | undefined>;
  formTarget?: VString;
  name?: VString;
  type?: 'submit' | 'reset' | 'button' | undefined;
  value?: string | ReadonlyArray<string> | number | undefined;
}
export interface CanvasHTMLAttributes<T> extends HTMLAttributes<T> {
  height?: ValueOrSignal<number | string | undefined>;
  width?: ValueOrSignal<number | string | undefined>;
}
export interface ColHTMLAttributes<T> extends HTMLAttributes<T> {
  span?: VNumber;
  width?: ValueOrSignal<number | string | undefined>;
}
export interface ColgroupHTMLAttributes<T> extends HTMLAttributes<T> {
  span?: VNumber;
}
export interface DataHTMLAttributes<T> extends HTMLAttributes<T> {
  value?: string | ReadonlyArray<string> | number | undefined;
}
export interface DelHTMLAttributes<T> extends HTMLAttributes<T> {
  cite?: VString;
  dateTime?: VString;
}

export interface DetailsHTMLAttributes<T> extends HTMLAttributes<T> {
  open?: ValueOrSignal<boolean | undefined>;
}
export interface DialogHTMLAttributes<T> extends HTMLAttributes<T> {
  open?: ValueOrSignal<boolean | undefined>;
}
export interface EmbedHTMLAttributes<T> extends HTMLAttributes<T> {
  height?: ValueOrSignal<number | string | undefined>;
  src?: VString;
  type?: VString;
  width?: ValueOrSignal<number | string | undefined>;
}
export interface FieldsetHTMLAttributes<T> extends HTMLAttributes<T> {
  disabled?: ValueOrSignal<boolean | undefined>;
  form?: VString;
  name?: VString;
}
export interface FormHTMLAttributes<T> extends HTMLAttributes<T> {
  acceptCharset?: VString;
  action?: VString;
  autoComplete?: 'on' | 'off' | Omit<'on' | 'off', string> | undefined;
  encType?: VString;
  method?: VString;
  name?: VString;
  noValidate?: ValueOrSignal<boolean | undefined>;
  target?: VString;
}
export interface HtmlHTMLAttributes<T> extends HTMLAttributes<T> {
  manifest?: VString;
}
export interface IframeHTMLAttributes<T> extends HTMLAttributes<T> {
  allow?: VString;
  allowFullScreen?: ValueOrSignal<boolean | undefined>;
  allowTransparency?: ValueOrSignal<boolean | undefined>;
  /** @deprecated Deprecated */
  frameBorder?: ValueOrSignal<number | string | undefined>;
  height?: ValueOrSignal<number | string | undefined>;
  loading?: 'eager' | 'lazy' | undefined;
  /** @deprecated Deprecated */
  marginHeight?: VNumber;
  /** @deprecated Deprecated */
  marginWidth?: VNumber;
  name?: VString;
  referrerPolicy?: HTMLAttributeReferrerPolicy | undefined;
  sandbox?: VString;
  /** @deprecated Deprecated */
  scrolling?: VString;
  seamless?: ValueOrSignal<boolean | undefined>;
  src?: VString;
  srcDoc?: VString;
  width?: ValueOrSignal<number | string | undefined>;
}
export interface ImgHTMLAttributes<T> extends HTMLAttributes<T> {
  alt?: VString;
  crossOrigin?: HTMLCrossOriginAttribute;
  decoding?: 'async' | 'auto' | 'sync' | undefined;
  height?: ValueOrSignal<number | string | undefined>;
  loading?: 'eager' | 'lazy' | undefined;
  referrerPolicy?: HTMLAttributeReferrerPolicy | undefined;
  sizes?: VString;
  src?: VString;
  srcSet?: VString;
  useMap?: VString;
  width?: ValueOrSignal<number | string | undefined>;
}

export type HTMLCrossOriginAttribute = 'anonymous' | 'use-credentials' | '' | undefined;

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

export interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
  accept?: VString;
  alt?: VString;
  autoComplete?:
    | HTMLInputAutocompleteAttribute
    | Omit<HTMLInputAutocompleteAttribute, string>
    | undefined;
  autoFocus?: ValueOrSignal<boolean | undefined>;
  capture?: boolean | 'user' | 'environment' | undefined; // https://www.w3.org/TR/html-media-capture/#the-capture-attribute
  checked?: ValueOrSignal<boolean | undefined>;
  crossOrigin?: HTMLCrossOriginAttribute;
  disabled?: ValueOrSignal<boolean | undefined>;
  enterKeyHint?: 'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send' | undefined;
  form?: VString;
  formAction?: VString;
  formEncType?: VString;
  formMethod?: VString;
  formNoValidate?: ValueOrSignal<boolean | undefined>;
  formTarget?: VString;
  height?: ValueOrSignal<number | string | undefined>;
  list?: VString;
  max?: ValueOrSignal<number | string | undefined>;
  maxLength?: VNumber;
  min?: ValueOrSignal<number | string | undefined>;
  minLength?: VNumber;
  multiple?: ValueOrSignal<boolean | undefined>;
  name?: VString;
  pattern?: VString;
  placeholder?: VString;
  readOnly?: ValueOrSignal<boolean | undefined>;
  required?: ValueOrSignal<boolean | undefined>;
  size?: VNumber;
  src?: VString;
  step?: ValueOrSignal<number | string | undefined>;
  type?: HTMLInputTypeAttribute | undefined;
  value?: string | ReadonlyArray<string> | number | undefined;
  width?: ValueOrSignal<number | string | undefined>;
}
export interface InsHTMLAttributes<T> extends HTMLAttributes<T> {
  cite?: VString;
  dateTime?: VString;
}
export interface KeygenHTMLAttributes<T> extends HTMLAttributes<T> {
  autoFocus?: ValueOrSignal<boolean | undefined>;
  challenge?: VString;
  disabled?: ValueOrSignal<boolean | undefined>;
  form?: VString;
  keyType?: VString;
  keyParams?: VString;
  name?: VString;
}
export interface LabelHTMLAttributes<T> extends HTMLAttributes<T> {
  form?: VString;
  htmlFor?: VString;
}
export interface LiHTMLAttributes<T> extends HTMLAttributes<T> {
  value?: string | ReadonlyArray<string> | number | undefined;
}
export interface LinkHTMLAttributes<T> extends HTMLAttributes<T> {
  as?: VString;
  crossOrigin?: HTMLCrossOriginAttribute;
  href?: VString;
  hrefLang?: VString;
  integrity?: VString;
  media?: VString;
  imageSrcSet?: VString;
  imageSizes?: VString;
  referrerPolicy?: HTMLAttributeReferrerPolicy | undefined;
  rel?: VString;
  sizes?: VString;
  type?: VString;
  charSet?: VString;
}
export interface MapHTMLAttributes<T> extends HTMLAttributes<T> {
  name?: VString;
}
export interface MenuHTMLAttributes<T> extends HTMLAttributes<T> {
  type?: VString;
}
export interface MetaHTMLAttributes<T> extends HTMLAttributes<T> {
  charSet?: VString;
  content?: VString;
  httpEquiv?: VString;
  name?: VString;
  media?: VString;
}
export interface MeterHTMLAttributes<T> extends HTMLAttributes<T> {
  form?: VString;
  high?: VNumber;
  low?: VNumber;
  max?: ValueOrSignal<number | string | undefined>;
  min?: ValueOrSignal<number | string | undefined>;
  optimum?: VNumber;
  value?: string | ReadonlyArray<string> | number | undefined;
}
export interface ObjectHTMLAttributes<T> extends HTMLAttributes<T> {
  classID?: VString;
  data?: VString;
  form?: VString;
  height?: ValueOrSignal<number | string | undefined>;
  name?: VString;
  type?: VString;
  useMap?: VString;
  width?: ValueOrSignal<number | string | undefined>;
  wmode?: VString;
}
export interface OlHTMLAttributes<T> extends HTMLAttributes<T> {
  reversed?: ValueOrSignal<boolean | undefined>;
  start?: VNumber;
  type?: '1' | 'a' | 'A' | 'i' | 'I' | undefined;
}
export interface OptgroupHTMLAttributes<T> extends HTMLAttributes<T> {
  disabled?: ValueOrSignal<boolean | undefined>;
  label?: VString;
}
export interface OptionHTMLAttributes<T> extends HTMLAttributes<T> {
  disabled?: ValueOrSignal<boolean | undefined>;
  label?: VString;
  selected?: ValueOrSignal<boolean | undefined>;
  value?: string | ReadonlyArray<string> | number | undefined;
}
export interface OutputHTMLAttributes<T> extends HTMLAttributes<T> {
  form?: VString;
  htmlFor?: VString;
  name?: VString;
}
export interface ParamHTMLAttributes<T> extends HTMLAttributes<T> {
  name?: VString;
  value?: string | ReadonlyArray<string> | number | undefined;
}
export interface ProgressHTMLAttributes<T> extends HTMLAttributes<T> {
  max?: ValueOrSignal<number | string | undefined>;
  value?: string | ReadonlyArray<string> | number | undefined;
}
export interface QuoteHTMLAttributes<T> extends HTMLAttributes<T> {
  cite?: VString;
}
export interface SlotHTMLAttributes<T> extends HTMLAttributes<T> {
  name?: VString;
}
export interface ScriptHTMLAttributes<T> extends HTMLAttributes<T> {
  async?: ValueOrSignal<boolean | undefined>;
  /** @deprecated Deprecated */
  charSet?: VString;
  crossOrigin?: HTMLCrossOriginAttribute;
  defer?: ValueOrSignal<boolean | undefined>;
  integrity?: VString;
  noModule?: ValueOrSignal<boolean | undefined>;
  nonce?: VString;
  referrerPolicy?: HTMLAttributeReferrerPolicy | undefined;
  src?: VString;
  type?: VString;
}
export interface SelectHTMLAttributes<T> extends HTMLAttributes<T> {
  autoComplete?:
    | HTMLInputAutocompleteAttribute
    | Omit<HTMLInputAutocompleteAttribute, string>
    | undefined;
  autoFocus?: ValueOrSignal<boolean | undefined>;
  disabled?: ValueOrSignal<boolean | undefined>;
  form?: VString;
  multiple?: ValueOrSignal<boolean | undefined>;
  name?: VString;
  required?: ValueOrSignal<boolean | undefined>;
  size?: VNumber;
  value?: string | ReadonlyArray<string> | number | undefined;
}
export interface SourceHTMLAttributes<T> extends HTMLAttributes<T> {
  height?: ValueOrSignal<number | string | undefined>;
  media?: VString;
  sizes?: VString;
  src?: VString;
  srcSet?: VString;
  type?: VString;
  width?: ValueOrSignal<number | string | undefined>;
}
export interface StyleHTMLAttributes<T> extends HTMLAttributes<T> {
  media?: VString;
  nonce?: VString;
  scoped?: ValueOrSignal<boolean | undefined>;
  type?: VString;
}
export interface TableHTMLAttributes<T> extends HTMLAttributes<T> {
  cellPadding?: ValueOrSignal<number | string | undefined>;
  cellSpacing?: ValueOrSignal<number | string | undefined>;
  summary?: VString;
  width?: ValueOrSignal<number | string | undefined>;
}
export interface TdHTMLAttributes<T> extends HTMLAttributes<T> {
  align?: 'left' | 'center' | 'right' | 'justify' | 'char' | undefined;
  colSpan?: VNumber;
  headers?: VString;
  rowSpan?: VNumber;
  scope?: VString;
  abbr?: VString;
  height?: ValueOrSignal<number | string | undefined>;
  width?: ValueOrSignal<number | string | undefined>;
  valign?: 'top' | 'middle' | 'bottom' | 'baseline' | undefined;
}
export interface TextareaHTMLAttributes<T> extends HTMLAttributes<T> {
  autoComplete?:
    | HTMLInputAutocompleteAttribute
    | Omit<HTMLInputAutocompleteAttribute, string>
    | undefined;
  autoFocus?: ValueOrSignal<boolean | undefined>;
  cols?: VNumber;
  dirName?: VString;
  disabled?: ValueOrSignal<boolean | undefined>;
  form?: VString;
  maxLength?: VNumber;
  minLength?: VNumber;
  name?: VString;
  placeholder?: VString;
  readOnly?: ValueOrSignal<boolean | undefined>;
  required?: ValueOrSignal<boolean | undefined>;
  rows?: VNumber;
  value?: string | ReadonlyArray<string> | number | undefined;
  wrap?: VString;
}
export interface ThHTMLAttributes<T> extends HTMLAttributes<T> {
  align?: 'left' | 'center' | 'right' | 'justify' | 'char' | undefined;
  colSpan?: VNumber;
  headers?: VString;
  rowSpan?: VNumber;
  scope?: VString;
  abbr?: VString;
}
export interface TimeHTMLAttributes<T> extends HTMLAttributes<T> {
  dateTime?: VString;
}
export interface TrackHTMLAttributes<T> extends HTMLAttributes<T> {
  default?: ValueOrSignal<boolean | undefined>;
  kind?: VString;
  label?: VString;
  src?: VString;
  srcLang?: VString;
}
export interface VideoHTMLAttributes<T> extends MediaHTMLAttributes<T> {
  height?: ValueOrSignal<number | string | undefined>;
  playsInline?: ValueOrSignal<boolean | undefined>;
  poster?: VString;
  width?: ValueOrSignal<number | string | undefined>;
  disablePictureInPicture?: ValueOrSignal<boolean | undefined>;
  disableRemotePlayback?: ValueOrSignal<boolean | undefined>;
}
export interface WebViewHTMLAttributes<T> extends HTMLAttributes<T> {
  allowFullScreen?: ValueOrSignal<boolean | undefined>;
  allowpopups?: ValueOrSignal<boolean | undefined>;
  autoFocus?: ValueOrSignal<boolean | undefined>;
  autosize?: ValueOrSignal<boolean | undefined>;
  blinkfeatures?: VString;
  disableblinkfeatures?: VString;
  disableguestresize?: ValueOrSignal<boolean | undefined>;
  disablewebsecurity?: ValueOrSignal<boolean | undefined>;
  guestinstance?: VString;
  httpreferrer?: VString;
  nodeintegration?: ValueOrSignal<boolean | undefined>;
  partition?: VString;
  plugins?: ValueOrSignal<boolean | undefined>;
  preload?: VString;
  src?: VString;
  useragent?: VString;
  webpreferences?: VString;
}
export interface SVGAttributes<T> extends AriaAttributes, DOMAttributes<T> {
  className?: VString;
  color?: VString;
  height?: ValueOrSignal<number | string | undefined>;
  id?: VString;
  lang?: VString;
  max?: ValueOrSignal<number | string | undefined>;
  media?: VString;
  method?: VString;
  min?: ValueOrSignal<number | string | undefined>;
  name?: VString;
  style?: Record<string, number | string> | string | undefined;
  target?: VString;
  type?: VString;
  width?: ValueOrSignal<number | string | undefined>;

  role?: ValueOrSignal<AriaRole | undefined>;
  tabindex?: VNumber;
  crossOrigin?: HTMLCrossOriginAttribute;

  'accent-height'?: ValueOrSignal<number | string | undefined>;
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
  alphabetic?: ValueOrSignal<number | string | undefined>;
  amplitude?: ValueOrSignal<number | string | undefined>;
  'arabic-form'?: 'initial' | 'medial' | 'terminal' | 'isolated' | undefined;
  ascent?: ValueOrSignal<number | string | undefined>;
  attributeName?: VString;
  attributeType?: VString;
  autoReverse?: ValueOrSignal<Booleanish | undefined>;
  azimuth?: ValueOrSignal<number | string | undefined>;
  baseFrequency?: ValueOrSignal<number | string | undefined>;
  'baseline-shift'?: ValueOrSignal<number | string | undefined>;
  baseProfile?: ValueOrSignal<number | string | undefined>;
  bbox?: ValueOrSignal<number | string | undefined>;
  begin?: ValueOrSignal<number | string | undefined>;
  bias?: ValueOrSignal<number | string | undefined>;
  by?: ValueOrSignal<number | string | undefined>;
  calcMode?: ValueOrSignal<number | string | undefined>;
  'cap-height'?: ValueOrSignal<number | string | undefined>;
  clip?: ValueOrSignal<number | string | undefined>;
  'clip-path'?: VString;
  clipPathUnits?: ValueOrSignal<number | string | undefined>;
  'clip-rule'?: ValueOrSignal<number | string | undefined>;
  'color-interpolation'?: ValueOrSignal<number | string | undefined>;
  'color-interpolation-filters'?: 'auto' | 's-rGB' | 'linear-rGB' | 'inherit' | undefined;
  'color-profile'?: ValueOrSignal<number | string | undefined>;
  'color-rendering'?: ValueOrSignal<number | string | undefined>;
  contentScriptType?: ValueOrSignal<number | string | undefined>;
  contentStyleType?: ValueOrSignal<number | string | undefined>;
  cursor?: number | string;
  cx?: ValueOrSignal<number | string | undefined>;
  cy?: ValueOrSignal<number | string | undefined>;
  d?: VString;
  decelerate?: ValueOrSignal<number | string | undefined>;
  descent?: ValueOrSignal<number | string | undefined>;
  diffuseConstant?: ValueOrSignal<number | string | undefined>;
  direction?: ValueOrSignal<number | string | undefined>;
  display?: ValueOrSignal<number | string | undefined>;
  divisor?: ValueOrSignal<number | string | undefined>;
  'dominant-baseline'?: ValueOrSignal<number | string | undefined>;
  dur?: ValueOrSignal<number | string | undefined>;
  dx?: ValueOrSignal<number | string | undefined>;
  dy?: ValueOrSignal<number | string | undefined>;
  'edge-mode'?: ValueOrSignal<number | string | undefined>;
  elevation?: ValueOrSignal<number | string | undefined>;
  'enable-background'?: ValueOrSignal<number | string | undefined>;
  end?: ValueOrSignal<number | string | undefined>;
  exponent?: ValueOrSignal<number | string | undefined>;
  externalResourcesRequired?: ValueOrSignal<number | string | undefined>;
  fill?: VString;
  'fill-opacity'?: ValueOrSignal<number | string | undefined>;
  'fill-rule'?: 'nonzero' | 'evenodd' | 'inherit' | undefined;
  filter?: VString;
  filterRes?: ValueOrSignal<number | string | undefined>;
  filterUnits?: ValueOrSignal<number | string | undefined>;
  'flood-color'?: ValueOrSignal<number | string | undefined>;
  'flood-opacity'?: ValueOrSignal<number | string | undefined>;
  focusable?: ValueOrSignal<number | string | undefined>;
  'font-family'?: VString;
  'font-size'?: ValueOrSignal<number | string | undefined>;
  'font-size-adjust'?: ValueOrSignal<number | string | undefined>;
  'font-stretch'?: ValueOrSignal<number | string | undefined>;
  'font-style'?: ValueOrSignal<number | string | undefined>;
  'font-variant'?: ValueOrSignal<number | string | undefined>;
  'font-weight'?: ValueOrSignal<number | string | undefined>;
  format?: ValueOrSignal<number | string | undefined>;
  fr?: ValueOrSignal<number | string | undefined>;
  from?: ValueOrSignal<number | string | undefined>;
  fx?: ValueOrSignal<number | string | undefined>;
  fy?: ValueOrSignal<number | string | undefined>;
  g1?: ValueOrSignal<number | string | undefined>;
  g2?: ValueOrSignal<number | string | undefined>;
  'glyph-name'?: ValueOrSignal<number | string | undefined>;
  'glyph-orientation-horizontal'?: ValueOrSignal<number | string | undefined>;
  'glyph-orientation-vertical'?: ValueOrSignal<number | string | undefined>;
  glyphRef?: ValueOrSignal<number | string | undefined>;
  gradientTransform?: VString;
  gradientUnits?: VString;
  hanging?: ValueOrSignal<number | string | undefined>;
  'horiz-adv-x'?: ValueOrSignal<number | string | undefined>;
  'horiz-origin-x'?: ValueOrSignal<number | string | undefined>;
  href?: VString;
  ideographic?: ValueOrSignal<number | string | undefined>;
  'image-rendering'?: ValueOrSignal<number | string | undefined>;
  in2?: ValueOrSignal<number | string | undefined>;
  in?: VString;
  intercept?: ValueOrSignal<number | string | undefined>;
  k1?: ValueOrSignal<number | string | undefined>;
  k2?: ValueOrSignal<number | string | undefined>;
  k3?: ValueOrSignal<number | string | undefined>;
  k4?: ValueOrSignal<number | string | undefined>;
  k?: ValueOrSignal<number | string | undefined>;
  kernelMatrix?: ValueOrSignal<number | string | undefined>;
  kernelUnitLength?: ValueOrSignal<number | string | undefined>;
  kerning?: ValueOrSignal<number | string | undefined>;
  keyPoints?: ValueOrSignal<number | string | undefined>;
  keySplines?: ValueOrSignal<number | string | undefined>;
  keyTimes?: ValueOrSignal<number | string | undefined>;
  lengthAdjust?: ValueOrSignal<number | string | undefined>;
  'letter-spacing'?: ValueOrSignal<number | string | undefined>;
  'lighting-color'?: ValueOrSignal<number | string | undefined>;
  limitingConeAngle?: ValueOrSignal<number | string | undefined>;
  local?: ValueOrSignal<number | string | undefined>;
  'marker-end'?: VString;
  markerHeight?: ValueOrSignal<number | string | undefined>;
  'marker-mid'?: VString;
  'marker-start'?: VString;
  markerUnits?: ValueOrSignal<number | string | undefined>;
  markerWidth?: ValueOrSignal<number | string | undefined>;
  mask?: VString;
  maskContentUnits?: ValueOrSignal<number | string | undefined>;
  maskUnits?: ValueOrSignal<number | string | undefined>;
  mathematical?: ValueOrSignal<number | string | undefined>;
  mode?: ValueOrSignal<number | string | undefined>;
  numOctaves?: ValueOrSignal<number | string | undefined>;
  offset?: ValueOrSignal<number | string | undefined>;
  opacity?: ValueOrSignal<number | string | undefined>;
  operator?: ValueOrSignal<number | string | undefined>;
  order?: ValueOrSignal<number | string | undefined>;
  orient?: ValueOrSignal<number | string | undefined>;
  orientation?: ValueOrSignal<number | string | undefined>;
  origin?: ValueOrSignal<number | string | undefined>;
  overflow?: ValueOrSignal<number | string | undefined>;
  'overline-position'?: ValueOrSignal<number | string | undefined>;
  'overline-thickness'?: ValueOrSignal<number | string | undefined>;
  'paint-order'?: ValueOrSignal<number | string | undefined>;
  panose1?: ValueOrSignal<number | string | undefined>;
  path?: VString;
  pathLength?: ValueOrSignal<number | string | undefined>;
  patternContentUnits?: VString;
  patternTransform?: ValueOrSignal<number | string | undefined>;
  patternUnits?: VString;
  'pointer-events'?: ValueOrSignal<number | string | undefined>;
  points?: VString;
  pointsAtX?: ValueOrSignal<number | string | undefined>;
  pointsAtY?: ValueOrSignal<number | string | undefined>;
  pointsAtZ?: ValueOrSignal<number | string | undefined>;
  preserveAlpha?: ValueOrSignal<number | string | undefined>;
  preserveAspectRatio?: VString;
  primitiveUnits?: ValueOrSignal<number | string | undefined>;
  r?: ValueOrSignal<number | string | undefined>;
  radius?: ValueOrSignal<number | string | undefined>;
  refX?: ValueOrSignal<number | string | undefined>;
  refY?: ValueOrSignal<number | string | undefined>;
  'rendering-intent'?: ValueOrSignal<number | string | undefined>;
  repeatCount?: ValueOrSignal<number | string | undefined>;
  repeatDur?: ValueOrSignal<number | string | undefined>;
  requiredextensions?: ValueOrSignal<number | string | undefined>;
  requiredFeatures?: ValueOrSignal<number | string | undefined>;
  restart?: ValueOrSignal<number | string | undefined>;
  result?: VString;
  rotate?: ValueOrSignal<number | string | undefined>;
  rx?: ValueOrSignal<number | string | undefined>;
  ry?: ValueOrSignal<number | string | undefined>;
  scale?: ValueOrSignal<number | string | undefined>;
  seed?: ValueOrSignal<number | string | undefined>;
  'shape-rendering'?: ValueOrSignal<number | string | undefined>;
  slope?: ValueOrSignal<number | string | undefined>;
  spacing?: ValueOrSignal<number | string | undefined>;
  specularConstant?: ValueOrSignal<number | string | undefined>;
  specularExponent?: ValueOrSignal<number | string | undefined>;
  speed?: ValueOrSignal<number | string | undefined>;
  spreadMethod?: VString;
  startOffset?: ValueOrSignal<number | string | undefined>;
  stdDeviation?: ValueOrSignal<number | string | undefined>;
  stemh?: ValueOrSignal<number | string | undefined>;
  stemv?: ValueOrSignal<number | string | undefined>;
  stitchTiles?: ValueOrSignal<number | string | undefined>;
  'stop-color'?: VString;
  'stop-opacity'?: ValueOrSignal<number | string | undefined>;
  'strikethrough-position'?: ValueOrSignal<number | string | undefined>;
  'strikethrough-thickness'?: ValueOrSignal<number | string | undefined>;
  string?: ValueOrSignal<number | string | undefined>;
  stroke?: VString;
  'stroke-dasharray'?: ValueOrSignal<number | string | undefined>;
  'stroke-dashoffset'?: ValueOrSignal<number | string | undefined>;
  'stroke-linecap'?: 'butt' | 'round' | 'square' | 'inherit' | undefined;
  'stroke-linejoin'?: 'miter' | 'round' | 'bevel' | 'inherit' | undefined;
  'stroke-miterlimit'?: VString;
  'stroke-opacity'?: ValueOrSignal<number | string | undefined>;
  'stroke-width'?: ValueOrSignal<number | string | undefined>;
  surfaceScale?: ValueOrSignal<number | string | undefined>;
  systemLanguage?: ValueOrSignal<number | string | undefined>;
  tableValues?: ValueOrSignal<number | string | undefined>;
  targetX?: ValueOrSignal<number | string | undefined>;
  targetY?: ValueOrSignal<number | string | undefined>;
  'text-anchor'?: VString;
  'text-decoration'?: ValueOrSignal<number | string | undefined>;
  textLength?: ValueOrSignal<number | string | undefined>;
  'text-rendering'?: ValueOrSignal<number | string | undefined>;
  to?: ValueOrSignal<number | string | undefined>;
  transform?: VString;
  u1?: ValueOrSignal<number | string | undefined>;
  u2?: ValueOrSignal<number | string | undefined>;
  'underline-position'?: ValueOrSignal<number | string | undefined>;
  'underline-thickness'?: ValueOrSignal<number | string | undefined>;
  unicode?: ValueOrSignal<number | string | undefined>;
  'unicode-bidi'?: ValueOrSignal<number | string | undefined>;
  'unicode-range'?: ValueOrSignal<number | string | undefined>;
  'units-per-em'?: ValueOrSignal<number | string | undefined>;
  'v-alphabetic'?: ValueOrSignal<number | string | undefined>;
  values?: VString;
  'vector-effect'?: ValueOrSignal<number | string | undefined>;
  version?: VString;
  'vert-adv-y'?: ValueOrSignal<number | string | undefined>;
  'vert-origin-x'?: ValueOrSignal<number | string | undefined>;
  'vert-origin-y'?: ValueOrSignal<number | string | undefined>;
  'v-hanging'?: ValueOrSignal<number | string | undefined>;
  'v-ideographic'?: ValueOrSignal<number | string | undefined>;
  viewBox?: VString;
  viewTarget?: ValueOrSignal<number | string | undefined>;
  visibility?: ValueOrSignal<number | string | undefined>;
  'v-mathematical'?: ValueOrSignal<number | string | undefined>;
  widths?: ValueOrSignal<number | string | undefined>;
  'word-spacing'?: ValueOrSignal<number | string | undefined>;
  'writing-mode'?: ValueOrSignal<number | string | undefined>;
  x1?: ValueOrSignal<number | string | undefined>;
  x2?: ValueOrSignal<number | string | undefined>;
  x?: ValueOrSignal<number | string | undefined>;
  'x-channel-selector'?: VString;
  'x-height'?: ValueOrSignal<number | string | undefined>;
  xlinkActuate?: VString;
  xlinkArcrole?: VString;
  xlinkHref?: VString;
  xlinkRole?: VString;
  xlinkShow?: VString;
  xlinkTitle?: VString;
  xlinkType?: VString;
  xmlBase?: VString;
  xmlLang?: VString;
  xmlns?: VString;
  xmlSpace?: VString;
  y1?: ValueOrSignal<number | string | undefined>;
  y2?: ValueOrSignal<number | string | undefined>;
  y?: ValueOrSignal<number | string | undefined>;
  yChannelSelector?: VString;
  z?: ValueOrSignal<number | string | undefined>;
  zoomAndPan?: VString;
}
export interface SVGProps<T> extends SVGAttributes<T>, ClassAttributes<T> {}
export interface IntrinsicElements {
  a: AnchorHTMLAttributes<HTMLAnchorElement>;
  abbr: HTMLAttributes<HTMLElement>;
  address: HTMLAttributes<HTMLElement>;
  area: AreaHTMLAttributes<HTMLAreaElement>;
  article: HTMLAttributes<HTMLElement>;
  aside: HTMLAttributes<HTMLElement>;
  audio: AudioHTMLAttributes<HTMLAudioElement>;
  b: HTMLAttributes<HTMLElement>;
  base: BaseHTMLAttributes<HTMLBaseElement>;
  bdi: HTMLAttributes<HTMLElement>;
  bdo: HTMLAttributes<HTMLElement>;
  big: HTMLAttributes<HTMLElement>;
  blockquote: BlockquoteHTMLAttributes<HTMLElement>;
  body: HTMLAttributes<HTMLBodyElement>;
  br: HTMLAttributes<HTMLBRElement>;
  button: ButtonHTMLAttributes<HTMLButtonElement>;
  canvas: CanvasHTMLAttributes<HTMLCanvasElement>;
  caption: HTMLAttributes<HTMLElement>;
  cite: HTMLAttributes<HTMLElement>;
  code: HTMLAttributes<HTMLElement>;
  col: ColHTMLAttributes<HTMLTableColElement>;
  colgroup: ColgroupHTMLAttributes<HTMLTableColElement>;
  data: DataHTMLAttributes<HTMLDataElement>;
  datalist: HTMLAttributes<HTMLDataListElement>;
  dd: HTMLAttributes<HTMLElement>;
  del: DelHTMLAttributes<HTMLElement>;
  details: DetailsHTMLAttributes<HTMLElement>;
  dfn: HTMLAttributes<HTMLElement>;
  dialog: DialogHTMLAttributes<HTMLDialogElement>;
  div: HTMLAttributes<HTMLDivElement>;
  dl: HTMLAttributes<HTMLDListElement>;
  dt: HTMLAttributes<HTMLElement>;
  em: HTMLAttributes<HTMLElement>;
  embed: EmbedHTMLAttributes<HTMLEmbedElement>;
  fieldset: FieldsetHTMLAttributes<HTMLFieldSetElement>;
  figcaption: HTMLAttributes<HTMLElement>;
  figure: HTMLAttributes<HTMLElement>;
  footer: HTMLAttributes<HTMLElement>;
  form: FormHTMLAttributes<HTMLFormElement>;
  h1: HTMLAttributes<HTMLHeadingElement>;
  h2: HTMLAttributes<HTMLHeadingElement>;
  h3: HTMLAttributes<HTMLHeadingElement>;
  h4: HTMLAttributes<HTMLHeadingElement>;
  h5: HTMLAttributes<HTMLHeadingElement>;
  h6: HTMLAttributes<HTMLHeadingElement>;
  head: HTMLAttributes<HTMLHeadElement>;
  header: HTMLAttributes<HTMLElement>;
  hgroup: HTMLAttributes<HTMLElement>;
  hr: HTMLAttributes<HTMLHRElement>;
  html: HtmlHTMLAttributes<HTMLHtmlElement>;
  i: HTMLAttributes<HTMLElement>;
  iframe: IframeHTMLAttributes<HTMLIFrameElement>;
  img: ImgHTMLAttributes<HTMLImageElement>;
  input: InputHTMLAttributes<HTMLInputElement>;
  ins: InsHTMLAttributes<HTMLModElement>;
  kbd: HTMLAttributes<HTMLElement>;
  keygen: KeygenHTMLAttributes<HTMLElement>;
  label: LabelHTMLAttributes<HTMLLabelElement>;
  legend: HTMLAttributes<HTMLLegendElement>;
  li: LiHTMLAttributes<HTMLLIElement>;
  link: LinkHTMLAttributes<HTMLLinkElement>;
  main: HTMLAttributes<HTMLElement>;
  map: MapHTMLAttributes<HTMLMapElement>;
  mark: HTMLAttributes<HTMLElement>;
  menu: MenuHTMLAttributes<HTMLElement>;
  menuitem: HTMLAttributes<HTMLElement>;
  meta: MetaHTMLAttributes<HTMLMetaElement>;
  meter: MeterHTMLAttributes<HTMLElement>;
  nav: HTMLAttributes<HTMLElement>;
  noindex: HTMLAttributes<HTMLElement>;
  noscript: HTMLAttributes<HTMLElement>;
  object: ObjectHTMLAttributes<HTMLObjectElement>;
  ol: OlHTMLAttributes<HTMLOListElement>;
  optgroup: OptgroupHTMLAttributes<HTMLOptGroupElement>;
  option: OptionHTMLAttributes<HTMLOptionElement>;
  output: OutputHTMLAttributes<HTMLElement>;
  p: HTMLAttributes<HTMLParagraphElement>;
  param: ParamHTMLAttributes<HTMLParamElement>;
  picture: HTMLAttributes<HTMLElement>;
  pre: HTMLAttributes<HTMLPreElement>;
  progress: ProgressHTMLAttributes<HTMLProgressElement>;
  q: QuoteHTMLAttributes<HTMLQuoteElement>;
  rp: HTMLAttributes<HTMLElement>;
  rt: HTMLAttributes<HTMLElement>;
  ruby: HTMLAttributes<HTMLElement>;
  s: HTMLAttributes<HTMLElement>;
  samp: HTMLAttributes<HTMLElement>;
  slot: SlotHTMLAttributes<HTMLSlotElement>;
  script: ScriptHTMLAttributes<HTMLScriptElement>;
  section: HTMLAttributes<HTMLElement>;
  select: SelectHTMLAttributes<HTMLSelectElement>;
  small: HTMLAttributes<HTMLElement>;
  source: SourceHTMLAttributes<HTMLSourceElement>;
  span: HTMLAttributes<HTMLSpanElement>;
  strong: HTMLAttributes<HTMLElement>;
  style: StyleHTMLAttributes<HTMLStyleElement>;
  sub: HTMLAttributes<HTMLElement>;
  summary: HTMLAttributes<HTMLElement>;
  sup: HTMLAttributes<HTMLElement>;
  table: TableHTMLAttributes<HTMLTableElement>;
  template: HTMLAttributes<HTMLTemplateElement>;
  tbody: HTMLAttributes<HTMLTableSectionElement>;
  td: TdHTMLAttributes<HTMLTableDataCellElement>;
  textarea: TextareaHTMLAttributes<HTMLTextAreaElement>;
  tfoot: HTMLAttributes<HTMLTableSectionElement>;
  th: ThHTMLAttributes<HTMLTableHeaderCellElement>;
  thead: HTMLAttributes<HTMLTableSectionElement>;
  time: TimeHTMLAttributes<HTMLElement>;
  title: HTMLAttributes<HTMLTitleElement>;
  tr: HTMLAttributes<HTMLTableRowElement>;
  track: TrackHTMLAttributes<HTMLTrackElement>;
  u: HTMLAttributes<HTMLElement>;
  ul: HTMLAttributes<HTMLUListElement>;
  video: VideoHTMLAttributes<HTMLVideoElement>;
  wbr: HTMLAttributes<HTMLElement>;
  webview: WebViewHTMLAttributes<HTMLWebViewElement>;
  svg: SVGProps<SVGSVGElement>;
  animate: SVGProps<SVGElement>;
  animateMotion: SVGProps<SVGElement>;
  animateTransform: SVGProps<SVGElement>;
  circle: SVGProps<SVGCircleElement>;
  clipPath: SVGProps<SVGClipPathElement>;
  defs: SVGProps<SVGDefsElement>;
  desc: SVGProps<SVGDescElement>;
  ellipse: SVGProps<SVGEllipseElement>;
  feBlend: SVGProps<SVGFEBlendElement>;
  feColorMatrix: SVGProps<SVGFEColorMatrixElement>;
  feComponentTransfer: SVGProps<SVGFEComponentTransferElement>;
  feComposite: SVGProps<SVGFECompositeElement>;
  feConvolveMatrix: SVGProps<SVGFEConvolveMatrixElement>;
  feDiffuseLighting: SVGProps<SVGFEDiffuseLightingElement>;
  feDisplacementMap: SVGProps<SVGFEDisplacementMapElement>;
  feDistantLight: SVGProps<SVGFEDistantLightElement>;
  feDropShadow: SVGProps<SVGFEDropShadowElement>;
  feFlood: SVGProps<SVGFEFloodElement>;
  feFuncA: SVGProps<SVGFEFuncAElement>;
  feFuncB: SVGProps<SVGFEFuncBElement>;
  feFuncG: SVGProps<SVGFEFuncGElement>;
  feFuncR: SVGProps<SVGFEFuncRElement>;
  feGaussianBlur: SVGProps<SVGFEGaussianBlurElement>;
  feImage: SVGProps<SVGFEImageElement>;
  feMerge: SVGProps<SVGFEMergeElement>;
  feMergeNode: SVGProps<SVGFEMergeNodeElement>;
  feMorphology: SVGProps<SVGFEMorphologyElement>;
  feOffset: SVGProps<SVGFEOffsetElement>;
  fePointLight: SVGProps<SVGFEPointLightElement>;
  feSpecularLighting: SVGProps<SVGFESpecularLightingElement>;
  feSpotLight: SVGProps<SVGFESpotLightElement>;
  feTile: SVGProps<SVGFETileElement>;
  feTurbulence: SVGProps<SVGFETurbulenceElement>;
  filter: SVGProps<SVGFilterElement>;
  foreignObject: SVGProps<SVGForeignObjectElement>;
  g: SVGProps<SVGGElement>;
  image: SVGProps<SVGImageElement>;
  line: SVGProps<SVGLineElement>;
  linearGradient: SVGProps<SVGLinearGradientElement>;
  marker: SVGProps<SVGMarkerElement>;
  mask: SVGProps<SVGMaskElement>;
  metadata: SVGProps<SVGMetadataElement>;
  mpath: SVGProps<SVGElement>;
  path: SVGProps<SVGPathElement>;
  pattern: SVGProps<SVGPatternElement>;
  polygon: SVGProps<SVGPolygonElement>;
  polyline: SVGProps<SVGPolylineElement>;
  radialGradient: SVGProps<SVGRadialGradientElement>;
  rect: SVGProps<SVGRectElement>;
  stop: SVGProps<SVGStopElement>;
  switch: SVGProps<SVGSwitchElement>;
  symbol: SVGProps<SVGSymbolElement>;
  text: SVGProps<SVGTextElement>;
  textPath: SVGProps<SVGTextPathElement>;
  tspan: SVGProps<SVGTSpanElement>;
  use: SVGProps<SVGUseElement>;
  view: SVGProps<SVGViewElement>;
}
