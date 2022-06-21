/* eslint-disable */

import type { DOMAttributes } from './jsx-qwik-attributes';
interface CSSProperties {
  [key: string]: string | number;
}
interface HTMLWebViewElement extends HTMLElement {}
interface ClassAttributes<T> {}
export type Booleanish = 'true' | 'false';

/**
 * @public
 */
export interface AriaAttributes {
  /** Identifies the currently active element when DOM focus is on a composite widget, textbox, group, or application. */
  'aria-activedescendant'?: string | undefined;
  /** Indicates whether assistive technologies will present all, or only parts of, the changed region based on the change notifications defined by the aria-relevant attribute. */
  'aria-atomic'?: Booleanish | undefined;
  /**
   * Indicates whether inputting text could trigger display of one or more predictions of the user's intended value for an input and specifies how predictions would be
   * presented if they are made.
   */
  'aria-autocomplete'?: 'none' | 'inline' | 'list' | 'both' | undefined;
  /** Indicates an element is being modified and that assistive technologies MAY want to wait until the modifications are complete before exposing them to the user. */
  'aria-busy'?: Booleanish | undefined;
  /**
   * Indicates the current "checked" state of checkboxes, radio buttons, and other widgets.
   * @see aria-pressed @see aria-selected.
   */
  'aria-checked'?: boolean | 'false' | 'mixed' | 'true' | undefined;
  /**
   * Defines the total number of columns in a table, grid, or treegrid.
   * @see aria-colindex.
   */
  'aria-colcount'?: number | undefined;
  /**
   * Defines an element's column index or position with respect to the total number of columns within a table, grid, or treegrid.
   * @see aria-colcount @see aria-colspan.
   */
  'aria-colindex'?: number | undefined;
  /**
   * Defines the number of columns spanned by a cell or gridcell within a table, grid, or treegrid.
   * @see aria-colindex @see aria-rowspan.
   */
  'aria-colspan'?: number | undefined;
  /**
   * Identifies the element (or elements) whose contents or presence are controlled by the current element.
   * @see aria-owns.
   */
  'aria-controls'?: string | undefined;
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
  'aria-describedby'?: string | undefined;
  /**
   * Identifies the element that provides a detailed, extended description for the object.
   * @see aria-describedby.
   */
  'aria-details'?: string | undefined;
  /**
   * Indicates that the element is perceivable but disabled, so it is not editable or otherwise operable.
   * @see aria-hidden @see aria-readonly.
   */
  'aria-disabled'?: Booleanish | undefined;
  /**
   * Indicates what functions can be performed when a dragged object is released on the drop target.
   * @deprecated in ARIA 1.1
   */
  'aria-dropeffect'?: 'none' | 'copy' | 'execute' | 'link' | 'move' | 'popup' | undefined;
  /**
   * Identifies the element that provides an error message for the object.
   * @see aria-invalid @see aria-describedby.
   */
  'aria-errormessage'?: string | undefined;
  /** Indicates whether the element, or another grouping element it controls, is currently expanded or collapsed. */
  'aria-expanded'?: Booleanish | undefined;
  /**
   * Identifies the next element (or elements) in an alternate reading order of content which, at the user's discretion,
   * allows assistive technology to override the general default of reading in document source order.
   */
  'aria-flowto'?: string | undefined;
  /**
   * Indicates an element's "grabbed" state in a drag-and-drop operation.
   * @deprecated in ARIA 1.1
   */
  'aria-grabbed'?: Booleanish | undefined;
  /** Indicates the availability and type of interactive popup element, such as menu or dialog, that can be triggered by an element. */
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
   * @see aria-disabled.
   */
  'aria-hidden'?: Booleanish | undefined;
  /**
   * Indicates the entered value does not conform to the format expected by the application.
   * @see aria-errormessage.
   */
  'aria-invalid'?: boolean | 'false' | 'true' | 'grammar' | 'spelling' | undefined;
  /** Indicates keyboard shortcuts that an author has implemented to activate or give focus to an element. */
  'aria-keyshortcuts'?: string | undefined;
  /**
   * Defines a string value that labels the current element.
   * @see aria-labelledby.
   */
  'aria-label'?: string | undefined;
  /**
   * Identifies the element (or elements) that labels the current element.
   * @see aria-describedby.
   */
  'aria-labelledby'?: string | undefined;
  /** Defines the hierarchical level of an element within a structure. */
  'aria-level'?: number | undefined;
  /** Indicates that an element will be updated, and describes the types of updates the user agents, assistive technologies, and user can expect from the live region. */
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
   * Identifies an element (or elements) in order to define a visual, functional, or contextual parent/child relationship
   * between DOM elements where the DOM hierarchy cannot be used to represent the relationship.
   * @see aria-controls.
   */
  'aria-owns'?: string | undefined;
  /**
   * Defines a short hint (a word or short phrase) intended to aid the user with data entry when the control has no value.
   * A hint could be a sample value or a brief description of the expected format.
   */
  'aria-placeholder'?: string | undefined;
  /**
   * Defines an element's number or position in the current set of listitems or treeitems. Not required if all elements in the set are present in the DOM.
   * @see aria-setsize.
   */
  'aria-posinset'?: number | undefined;
  /**
   * Indicates the current "pressed" state of toggle buttons.
   * @see aria-checked @see aria-selected.
   */
  'aria-pressed'?: boolean | 'false' | 'mixed' | 'true' | undefined;
  /**
   * Indicates that the element is not editable, but is otherwise operable.
   * @see aria-disabled.
   */
  'aria-readonly'?: Booleanish | undefined;
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
  'aria-required'?: Booleanish | undefined;
  /** Defines a human-readable, author-localized description for the role of an element. */
  'aria-roledescription'?: string | undefined;
  /**
   * Defines the total number of rows in a table, grid, or treegrid.
   * @see aria-rowindex.
   */
  'aria-rowcount'?: number | undefined;
  /**
   * Defines an element's row index or position with respect to the total number of rows within a table, grid, or treegrid.
   * @see aria-rowcount @see aria-rowspan.
   */
  'aria-rowindex'?: number | undefined;
  /**
   * Defines the number of rows spanned by a cell or gridcell within a table, grid, or treegrid.
   * @see aria-rowindex @see aria-colspan.
   */
  'aria-rowspan'?: number | undefined;
  /**
   * Indicates the current "selected" state of various widgets.
   * @see aria-checked @see aria-pressed.
   */
  'aria-selected'?: Booleanish | undefined;
  /**
   * Defines the number of items in the current set of listitems or treeitems. Not required if all elements in the set are present in the DOM.
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
   * @see aria-valuetext.
   */
  'aria-valuenow'?: number | undefined;
  /** Defines the human readable text alternative of aria-valuenow for a range widget. */
  'aria-valuetext'?: string | undefined;
}
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
  accessKey?: string | undefined;
  className?: string | undefined;
  contentEditable?: Booleanish | 'inherit' | undefined;
  contextMenu?: string | undefined;
  dir?: string | undefined;
  draggable?: Booleanish | undefined;
  hidden?: boolean | undefined;
  id?: string | undefined;
  lang?: string | undefined;
  placeholder?: string | undefined;
  slot?: string | undefined;
  spellCheck?: Booleanish | undefined;
  style?: CSSProperties | string | undefined;
  tabIndex?: number | undefined;
  title?: string | undefined;
  translate?: 'yes' | 'no' | undefined;

  radioGroup?: string | undefined; // <command>, <menuitem>

  role?: AriaRole | undefined;

  about?: string | undefined;
  datatype?: string | undefined;
  inlist?: any;
  prefix?: string | undefined;
  property?: string | undefined;
  resource?: string | undefined;
  typeof?: string | undefined;
  vocab?: string | undefined;

  autoCapitalize?: string | undefined;
  autoCorrect?: string | undefined;
  autoSave?: string | undefined;
  color?: string | undefined;
  itemProp?: string | undefined;
  itemScope?: boolean | undefined;
  itemType?: string | undefined;
  itemID?: string | undefined;
  itemRef?: string | undefined;
  results?: number | undefined;
  security?: string | undefined;
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
  is?: string | undefined;
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
  href?: string | undefined;
  hrefLang?: string | undefined;
  media?: string | undefined;
  ping?: string | undefined;
  rel?: string | undefined;
  target?: HTMLAttributeAnchorTarget | undefined;
  type?: string | undefined;
  referrerPolicy?: HTMLAttributeReferrerPolicy | undefined;
}
export interface AreaHTMLAttributes<T> extends HTMLAttributes<T> {
  alt?: string | undefined;
  coords?: string | undefined;
  download?: any;
  href?: string | undefined;
  hrefLang?: string | undefined;
  media?: string | undefined;
  referrerPolicy?: HTMLAttributeReferrerPolicy | undefined;
  rel?: string | undefined;
  shape?: string | undefined;
  target?: string | undefined;
}
export interface MediaHTMLAttributes<T> extends HTMLAttributes<T> {
  autoPlay?: boolean | undefined;
  controls?: boolean | undefined;
  controlsList?: string | undefined;
  crossOrigin?: string | undefined;
  loop?: boolean | undefined;
  mediaGroup?: string | undefined;
  muted?: boolean | undefined;
  playsInline?: boolean | undefined;
  preload?: string | undefined;
  src?: string | undefined;
}
export interface AudioHTMLAttributes<T> extends MediaHTMLAttributes<T> {}
export interface BaseHTMLAttributes<T> extends HTMLAttributes<T> {
  href?: string | undefined;
  target?: string | undefined;
}
export interface BlockquoteHTMLAttributes<T> extends HTMLAttributes<T> {
  cite?: string | undefined;
}
export interface ButtonHTMLAttributes<T> extends HTMLAttributes<T> {
  autoFocus?: boolean | undefined;
  disabled?: boolean | undefined;
  form?: string | undefined;
  formAction?: string | undefined;
  formEncType?: string | undefined;
  formMethod?: string | undefined;
  formNoValidate?: boolean | undefined;
  formTarget?: string | undefined;
  name?: string | undefined;
  type?: 'submit' | 'reset' | 'button' | undefined;
  value?: string | ReadonlyArray<string> | number | undefined;
}
export interface CanvasHTMLAttributes<T> extends HTMLAttributes<T> {
  height?: number | string | undefined;
  width?: number | string | undefined;
}
export interface ColHTMLAttributes<T> extends HTMLAttributes<T> {
  span?: number | undefined;
  width?: number | string | undefined;
}
export interface ColgroupHTMLAttributes<T> extends HTMLAttributes<T> {
  span?: number | undefined;
}
export interface DataHTMLAttributes<T> extends HTMLAttributes<T> {
  value?: string | ReadonlyArray<string> | number | undefined;
}
export interface DelHTMLAttributes<T> extends HTMLAttributes<T> {
  cite?: string | undefined;
  dateTime?: string | undefined;
}

export interface DetailsHTMLAttributes<T> extends HTMLAttributes<T> {
  open?: boolean | undefined;
}
export interface DialogHTMLAttributes<T> extends HTMLAttributes<T> {
  open?: boolean | undefined;
}
export interface EmbedHTMLAttributes<T> extends HTMLAttributes<T> {
  height?: number | string | undefined;
  src?: string | undefined;
  type?: string | undefined;
  width?: number | string | undefined;
}
export interface FieldsetHTMLAttributes<T> extends HTMLAttributes<T> {
  disabled?: boolean | undefined;
  form?: string | undefined;
  name?: string | undefined;
}
export interface FormHTMLAttributes<T> extends HTMLAttributes<T> {
  acceptCharset?: string | undefined;
  action?: string | undefined;
  autoComplete?: string | undefined;
  encType?: string | undefined;
  method?: string | undefined;
  name?: string | undefined;
  noValidate?: boolean | undefined;
  target?: string | undefined;
}
export interface HtmlHTMLAttributes<T> extends HTMLAttributes<T> {
  manifest?: string | undefined;
}
export interface IframeHTMLAttributes<T> extends HTMLAttributes<T> {
  allow?: string | undefined;
  allowFullScreen?: boolean | undefined;
  allowTransparency?: boolean | undefined;
  /** @deprecated Deprecated */
  frameBorder?: number | string | undefined;
  height?: number | string | undefined;
  loading?: 'eager' | 'lazy' | undefined;
  /** @deprecated Deprecated */
  marginHeight?: number | undefined;
  /** @deprecated Deprecated */
  marginWidth?: number | undefined;
  name?: string | undefined;
  referrerPolicy?: HTMLAttributeReferrerPolicy | undefined;
  sandbox?: string | undefined;
  /** @deprecated Deprecated */
  scrolling?: string | undefined;
  seamless?: boolean | undefined;
  src?: string | undefined;
  srcDoc?: string | undefined;
  width?: number | string | undefined;
}
export interface ImgHTMLAttributes<T> extends HTMLAttributes<T> {
  alt?: string | undefined;
  crossOrigin?: 'anonymous' | 'use-credentials' | '' | undefined;
  decoding?: 'async' | 'auto' | 'sync' | undefined;
  height?: number | string | undefined;
  loading?: 'eager' | 'lazy' | undefined;
  referrerPolicy?: HTMLAttributeReferrerPolicy | undefined;
  sizes?: string | undefined;
  src?: string | undefined;
  srcSet?: string | undefined;
  useMap?: string | undefined;
  width?: number | string | undefined;
}
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

export interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
  accept?: string | undefined;
  alt?: string | undefined;
  autoComplete?: string | undefined;
  autoFocus?: boolean | undefined;
  capture?: boolean | 'user' | 'environment' | undefined; // https://www.w3.org/TR/html-media-capture/#the-capture-attribute
  checked?: boolean | undefined;
  crossOrigin?: string | undefined;
  disabled?: boolean | undefined;
  enterKeyHint?: 'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send' | undefined;
  form?: string | undefined;
  formAction?: string | undefined;
  formEncType?: string | undefined;
  formMethod?: string | undefined;
  formNoValidate?: boolean | undefined;
  formTarget?: string | undefined;
  height?: number | string | undefined;
  list?: string | undefined;
  max?: number | string | undefined;
  maxLength?: number | undefined;
  min?: number | string | undefined;
  minLength?: number | undefined;
  multiple?: boolean | undefined;
  name?: string | undefined;
  pattern?: string | undefined;
  placeholder?: string | undefined;
  readOnly?: boolean | undefined;
  required?: boolean | undefined;
  size?: number | undefined;
  src?: string | undefined;
  step?: number | string | undefined;
  type?: HTMLInputTypeAttribute | undefined;
  value?: string | ReadonlyArray<string> | number | undefined;
  width?: number | string | undefined;
}
export interface InsHTMLAttributes<T> extends HTMLAttributes<T> {
  cite?: string | undefined;
  dateTime?: string | undefined;
}
export interface KeygenHTMLAttributes<T> extends HTMLAttributes<T> {
  autoFocus?: boolean | undefined;
  challenge?: string | undefined;
  disabled?: boolean | undefined;
  form?: string | undefined;
  keyType?: string | undefined;
  keyParams?: string | undefined;
  name?: string | undefined;
}
export interface LabelHTMLAttributes<T> extends HTMLAttributes<T> {
  form?: string | undefined;
  htmlFor?: string | undefined;
}
export interface LiHTMLAttributes<T> extends HTMLAttributes<T> {
  value?: string | ReadonlyArray<string> | number | undefined;
}
export interface LinkHTMLAttributes<T> extends HTMLAttributes<T> {
  as?: string | undefined;
  crossOrigin?: string | undefined;
  href?: string | undefined;
  hrefLang?: string | undefined;
  integrity?: string | undefined;
  media?: string | undefined;
  imageSrcSet?: string | undefined;
  referrerPolicy?: HTMLAttributeReferrerPolicy | undefined;
  rel?: string | undefined;
  sizes?: string | undefined;
  type?: string | undefined;
  charSet?: string | undefined;
}
export interface MapHTMLAttributes<T> extends HTMLAttributes<T> {
  name?: string | undefined;
}
export interface MenuHTMLAttributes<T> extends HTMLAttributes<T> {
  type?: string | undefined;
}
export interface MetaHTMLAttributes<T> extends HTMLAttributes<T> {
  charSet?: string | undefined;
  content?: string | undefined;
  httpEquiv?: string | undefined;
  name?: string | undefined;
  media?: string | undefined;
}
export interface MeterHTMLAttributes<T> extends HTMLAttributes<T> {
  form?: string | undefined;
  high?: number | undefined;
  low?: number | undefined;
  max?: number | string | undefined;
  min?: number | string | undefined;
  optimum?: number | undefined;
  value?: string | ReadonlyArray<string> | number | undefined;
}
export interface ObjectHTMLAttributes<T> extends HTMLAttributes<T> {
  classID?: string | undefined;
  data?: string | undefined;
  form?: string | undefined;
  height?: number | string | undefined;
  name?: string | undefined;
  type?: string | undefined;
  useMap?: string | undefined;
  width?: number | string | undefined;
  wmode?: string | undefined;
}
export interface OlHTMLAttributes<T> extends HTMLAttributes<T> {
  reversed?: boolean | undefined;
  start?: number | undefined;
  type?: '1' | 'a' | 'A' | 'i' | 'I' | undefined;
}
export interface OptgroupHTMLAttributes<T> extends HTMLAttributes<T> {
  disabled?: boolean | undefined;
  label?: string | undefined;
}
export interface OptionHTMLAttributes<T> extends HTMLAttributes<T> {
  disabled?: boolean | undefined;
  label?: string | undefined;
  selected?: boolean | undefined;
  value?: string | ReadonlyArray<string> | number | undefined;
}
export interface OutputHTMLAttributes<T> extends HTMLAttributes<T> {
  form?: string | undefined;
  htmlFor?: string | undefined;
  name?: string | undefined;
}
export interface ParamHTMLAttributes<T> extends HTMLAttributes<T> {
  name?: string | undefined;
  value?: string | ReadonlyArray<string> | number | undefined;
}
export interface ProgressHTMLAttributes<T> extends HTMLAttributes<T> {
  max?: number | string | undefined;
  value?: string | ReadonlyArray<string> | number | undefined;
}
export interface QuoteHTMLAttributes<T> extends HTMLAttributes<T> {
  cite?: string | undefined;
}
export interface SlotHTMLAttributes<T> extends HTMLAttributes<T> {
  name?: string | undefined;
}
export interface ScriptHTMLAttributes<T> extends HTMLAttributes<T> {
  async?: boolean | undefined;
  /** @deprecated Deprecated */
  charSet?: string | undefined;
  crossOrigin?: string | undefined;
  defer?: boolean | undefined;
  integrity?: string | undefined;
  noModule?: boolean | undefined;
  nonce?: string | undefined;
  referrerPolicy?: HTMLAttributeReferrerPolicy | undefined;
  src?: string | undefined;
  type?: string | undefined;
}
export interface SelectHTMLAttributes<T> extends HTMLAttributes<T> {
  autoComplete?: string | undefined;
  autoFocus?: boolean | undefined;
  disabled?: boolean | undefined;
  form?: string | undefined;
  multiple?: boolean | undefined;
  name?: string | undefined;
  required?: boolean | undefined;
  size?: number | undefined;
  value?: string | ReadonlyArray<string> | number | undefined;
}
export interface SourceHTMLAttributes<T> extends HTMLAttributes<T> {
  height?: number | string | undefined;
  media?: string | undefined;
  sizes?: string | undefined;
  src?: string | undefined;
  srcSet?: string | undefined;
  type?: string | undefined;
  width?: number | string | undefined;
}
export interface StyleHTMLAttributes<T> extends HTMLAttributes<T> {
  media?: string | undefined;
  nonce?: string | undefined;
  scoped?: boolean | undefined;
  type?: string | undefined;
}
export interface TableHTMLAttributes<T> extends HTMLAttributes<T> {
  cellPadding?: number | string | undefined;
  cellSpacing?: number | string | undefined;
  summary?: string | undefined;
  width?: number | string | undefined;
}
export interface TdHTMLAttributes<T> extends HTMLAttributes<T> {
  align?: 'left' | 'center' | 'right' | 'justify' | 'char' | undefined;
  colSpan?: number | undefined;
  headers?: string | undefined;
  rowSpan?: number | undefined;
  scope?: string | undefined;
  abbr?: string | undefined;
  height?: number | string | undefined;
  width?: number | string | undefined;
  valign?: 'top' | 'middle' | 'bottom' | 'baseline' | undefined;
}
export interface TextareaHTMLAttributes<T> extends HTMLAttributes<T> {
  autoComplete?: string | undefined;
  autoFocus?: boolean | undefined;
  cols?: number | undefined;
  dirName?: string | undefined;
  disabled?: boolean | undefined;
  form?: string | undefined;
  maxLength?: number | undefined;
  minLength?: number | undefined;
  name?: string | undefined;
  placeholder?: string | undefined;
  readOnly?: boolean | undefined;
  required?: boolean | undefined;
  rows?: number | undefined;
  value?: string | ReadonlyArray<string> | number | undefined;
  wrap?: string | undefined;
}
export interface ThHTMLAttributes<T> extends HTMLAttributes<T> {
  align?: 'left' | 'center' | 'right' | 'justify' | 'char' | undefined;
  colSpan?: number | undefined;
  headers?: string | undefined;
  rowSpan?: number | undefined;
  scope?: string | undefined;
  abbr?: string | undefined;
}
export interface TimeHTMLAttributes<T> extends HTMLAttributes<T> {
  dateTime?: string | undefined;
}
export interface TrackHTMLAttributes<T> extends HTMLAttributes<T> {
  default?: boolean | undefined;
  kind?: string | undefined;
  label?: string | undefined;
  src?: string | undefined;
  srcLang?: string | undefined;
}
export interface VideoHTMLAttributes<T> extends MediaHTMLAttributes<T> {
  height?: number | string | undefined;
  playsInline?: boolean | undefined;
  poster?: string | undefined;
  width?: number | string | undefined;
  disablePictureInPicture?: boolean | undefined;
  disableRemotePlayback?: boolean | undefined;
}
export interface WebViewHTMLAttributes<T> extends HTMLAttributes<T> {
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
export interface SVGAttributes<T> extends AriaAttributes, DOMAttributes<T> {
  class?: string | { [className: string]: boolean } | undefined;
  className?: string;
  color?: string | undefined;
  height?: number | string | undefined;
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
  width?: number | string | undefined;

  role?: string | undefined;
  tabindex?: number | undefined;
  crossOrigin?: 'anonymous' | 'use-credentials' | '' | undefined;

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
  xlinkActuate?: string | undefined;
  xlinkArcrole?: string | undefined;
  xlinkHref?: string | undefined;
  xlinkRole?: string | undefined;
  xlinkShow?: string | undefined;
  xlinkTitle?: string | undefined;
  xlinkType?: string | undefined;
  xmlBase?: string | undefined;
  xmlLang?: string | undefined;
  xmlns?: string | undefined;
  xmlSpace?: string | undefined;
  y1?: number | string | undefined;
  y2?: number | string | undefined;
  y?: number | string | undefined;
  yChannelSelector?: string | undefined;
  z?: number | string | undefined;
  zoomAndPan?: string | undefined;
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
