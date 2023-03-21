---
title: \@builder.io/qwik API Reference
---

# **API** @builder.io/qwik

## $ variable

Qwik Optimizer marker function.

Use `$(...)` to tell Qwik Optimizer to extract the expression in `$(...)` into a lazy-loadable resource referenced by `QRL`<!-- -->.

**Signature:**

```typescript
$: <T>(expression: T) => QRL<T>;
```

## \_jsxC variable

**Signature:**

```typescript
_jsxC: <T extends string | FunctionComponent<any>>(
  type: T,
  mutableProps:
    | (T extends FunctionComponent<infer PROPS> ? PROPS : Record<string, any>)
    | null,
  flags: number,
  key: string | number | null,
  dev?: JsxDevOpts
) => JSXNode<T>;
```

## \_jsxQ variable

**Signature:**

```typescript
_jsxQ: <T extends string | FunctionComponent<any>>(
  type: T,
  mutableProps:
    | (T extends FunctionComponent<infer PROPS> ? PROPS : Record<string, any>)
    | null,
  immutableProps: Record<string, any> | null,
  children: any | null,
  flags: number,
  key: string | number | null,
  dev?: DevJSX
) => JSXNode<T>;
```

## AriaAttributes."aria-activedescendant" property

Identifies the currently active element when DOM focus is on a composite widget, textbox, group, or application.

**Signature:**

```typescript
'aria-activedescendant'?: string | undefined;
```

## AriaAttributes."aria-atomic" property

Indicates whether assistive technologies will present all, or only parts of, the changed region based on the change notifications defined by the aria-relevant attribute.

**Signature:**

```typescript
'aria-atomic'?: Booleanish | undefined;
```

## AriaAttributes."aria-autocomplete" property

Indicates whether inputting text could trigger display of one or more predictions of the user's intended value for an input and specifies how predictions would be presented if they are made.

**Signature:**

```typescript
'aria-autocomplete'?: 'none' | 'inline' | 'list' | 'both' | undefined;
```

## AriaAttributes."aria-busy" property

Indicates an element is being modified and that assistive technologies MAY want to wait until the modifications are complete before exposing them to the user.

**Signature:**

```typescript
'aria-busy'?: Booleanish | undefined;
```

## AriaAttributes."aria-checked" property

Indicates the current "checked" state of checkboxes, radio buttons, and other widgets.

**Signature:**

```typescript
'aria-checked'?: boolean | 'false' | 'mixed' | 'true' | undefined;
```

## AriaAttributes."aria-colcount" property

Defines the total number of columns in a table, grid, or treegrid.

**Signature:**

```typescript
'aria-colcount'?: number | undefined;
```

## AriaAttributes."aria-colindex" property

Defines an element's column index or position with respect to the total number of columns within a table, grid, or treegrid.

**Signature:**

```typescript
'aria-colindex'?: number | undefined;
```

## AriaAttributes."aria-colspan" property

Defines the number of columns spanned by a cell or gridcell within a table, grid, or treegrid.

**Signature:**

```typescript
'aria-colspan'?: number | undefined;
```

## AriaAttributes."aria-controls" property

Identifies the element (or elements) whose contents or presence are controlled by the current element.

**Signature:**

```typescript
'aria-controls'?: string | undefined;
```

## AriaAttributes."aria-current" property

Indicates the element that represents the current item within a container or set of related elements.

**Signature:**

```typescript
'aria-current'?: boolean | 'false' | 'true' | 'page' | 'step' | 'location' | 'date' | 'time' | undefined;
```

## AriaAttributes."aria-describedby" property

Identifies the element (or elements) that describes the object.

**Signature:**

```typescript
'aria-describedby'?: string | undefined;
```

## AriaAttributes."aria-details" property

Identifies the element that provides a detailed, extended description for the object.

**Signature:**

```typescript
'aria-details'?: string | undefined;
```

## AriaAttributes."aria-disabled" property

Indicates that the element is perceivable but disabled, so it is not editable or otherwise operable.

**Signature:**

```typescript
'aria-disabled'?: Booleanish | undefined;
```

## AriaAttributes."aria-dropeffect" property

> Warning: This API is now obsolete.
>
> in ARIA 1.1

Indicates what functions can be performed when a dragged object is released on the drop target.

**Signature:**

```typescript
'aria-dropeffect'?: 'none' | 'copy' | 'execute' | 'link' | 'move' | 'popup' | undefined;
```

## AriaAttributes."aria-errormessage" property

Identifies the element that provides an error message for the object.

**Signature:**

```typescript
'aria-errormessage'?: string | undefined;
```

## AriaAttributes."aria-expanded" property

Indicates whether the element, or another grouping element it controls, is currently expanded or collapsed.

**Signature:**

```typescript
'aria-expanded'?: Booleanish | undefined;
```

## AriaAttributes."aria-flowto" property

Identifies the next element (or elements) in an alternate reading order of content which, at the user's discretion, allows assistive technology to override the general default of reading in document source order.

**Signature:**

```typescript
'aria-flowto'?: string | undefined;
```

## AriaAttributes."aria-grabbed" property

> Warning: This API is now obsolete.
>
> in ARIA 1.1

Indicates an element's "grabbed" state in a drag-and-drop operation.

**Signature:**

```typescript
'aria-grabbed'?: Booleanish | undefined;
```

## AriaAttributes."aria-haspopup" property

Indicates the availability and type of interactive popup element, such as menu or dialog, that can be triggered by an element.

**Signature:**

```typescript
'aria-haspopup'?: boolean | 'false' | 'true' | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog' | undefined;
```

## AriaAttributes."aria-hidden" property

Indicates whether the element is exposed to an accessibility API.

**Signature:**

```typescript
'aria-hidden'?: Booleanish | undefined;
```

## AriaAttributes."aria-invalid" property

Indicates the entered value does not conform to the format expected by the application.

**Signature:**

```typescript
'aria-invalid'?: boolean | 'false' | 'true' | 'grammar' | 'spelling' | undefined;
```

## AriaAttributes."aria-keyshortcuts" property

Indicates keyboard shortcuts that an author has implemented to activate or give focus to an element.

**Signature:**

```typescript
'aria-keyshortcuts'?: string | undefined;
```

## AriaAttributes."aria-label" property

Defines a string value that labels the current element.

**Signature:**

```typescript
'aria-label'?: string | undefined;
```

## AriaAttributes."aria-labelledby" property

Identifies the element (or elements) that labels the current element.

**Signature:**

```typescript
'aria-labelledby'?: string | undefined;
```

## AriaAttributes."aria-level" property

Defines the hierarchical level of an element within a structure.

**Signature:**

```typescript
'aria-level'?: number | undefined;
```

## AriaAttributes."aria-live" property

Indicates that an element will be updated, and describes the types of updates the user agents, assistive technologies, and user can expect from the live region.

**Signature:**

```typescript
'aria-live'?: 'off' | 'assertive' | 'polite' | undefined;
```

## AriaAttributes."aria-modal" property

Indicates whether an element is modal when displayed.

**Signature:**

```typescript
'aria-modal'?: Booleanish | undefined;
```

## AriaAttributes."aria-multiline" property

Indicates whether a text box accepts multiple lines of input or only a single line.

**Signature:**

```typescript
'aria-multiline'?: Booleanish | undefined;
```

## AriaAttributes."aria-multiselectable" property

Indicates that the user may select more than one item from the current selectable descendants.

**Signature:**

```typescript
'aria-multiselectable'?: Booleanish | undefined;
```

## AriaAttributes."aria-orientation" property

Indicates whether the element's orientation is horizontal, vertical, or unknown/ambiguous.

**Signature:**

```typescript
'aria-orientation'?: 'horizontal' | 'vertical' | undefined;
```

## AriaAttributes."aria-owns" property

Identifies an element (or elements) in order to define a visual, functional, or contextual parent/child relationship between DOM elements where the DOM hierarchy cannot be used to represent the relationship.

**Signature:**

```typescript
'aria-owns'?: string | undefined;
```

## AriaAttributes."aria-placeholder" property

Defines a short hint (a word or short phrase) intended to aid the user with data entry when the control has no value. A hint could be a sample value or a brief description of the expected format.

**Signature:**

```typescript
'aria-placeholder'?: string | undefined;
```

## AriaAttributes."aria-posinset" property

Defines an element's number or position in the current set of listitems or treeitems. Not required if all elements in the set are present in the DOM.

**Signature:**

```typescript
'aria-posinset'?: number | undefined;
```

## AriaAttributes."aria-pressed" property

Indicates the current "pressed" state of toggle buttons.

**Signature:**

```typescript
'aria-pressed'?: boolean | 'false' | 'mixed' | 'true' | undefined;
```

## AriaAttributes."aria-readonly" property

Indicates that the element is not editable, but is otherwise operable.

**Signature:**

```typescript
'aria-readonly'?: Booleanish | undefined;
```

## AriaAttributes."aria-relevant" property

Indicates what notifications the user agent will trigger when the accessibility tree within a live region is modified.

**Signature:**

```typescript
'aria-relevant'?: 'additions' | 'additions removals' | 'additions text' | 'all' | 'removals' | 'removals additions' | 'removals text' | 'text' | 'text additions' | 'text removals' | undefined;
```

## AriaAttributes."aria-required" property

Indicates that user input is required on the element before a form may be submitted.

**Signature:**

```typescript
'aria-required'?: Booleanish | undefined;
```

## AriaAttributes."aria-roledescription" property

Defines a human-readable, author-localized description for the role of an element.

**Signature:**

```typescript
'aria-roledescription'?: string | undefined;
```

## AriaAttributes."aria-rowcount" property

Defines the total number of rows in a table, grid, or treegrid.

**Signature:**

```typescript
'aria-rowcount'?: number | undefined;
```

## AriaAttributes."aria-rowindex" property

Defines an element's row index or position with respect to the total number of rows within a table, grid, or treegrid.

**Signature:**

```typescript
'aria-rowindex'?: number | undefined;
```

## AriaAttributes."aria-rowspan" property

Defines the number of rows spanned by a cell or gridcell within a table, grid, or treegrid.

**Signature:**

```typescript
'aria-rowspan'?: number | undefined;
```

## AriaAttributes."aria-selected" property

Indicates the current "selected" state of various widgets.

**Signature:**

```typescript
'aria-selected'?: Booleanish | undefined;
```

## AriaAttributes."aria-setsize" property

Defines the number of items in the current set of listitems or treeitems. Not required if all elements in the set are present in the DOM.

**Signature:**

```typescript
'aria-setsize'?: number | undefined;
```

## AriaAttributes."aria-sort" property

Indicates if items in a table or grid are sorted in ascending or descending order.

**Signature:**

```typescript
'aria-sort'?: 'none' | 'ascending' | 'descending' | 'other' | undefined;
```

## AriaAttributes."aria-valuemax" property

Defines the maximum allowed value for a range widget.

**Signature:**

```typescript
'aria-valuemax'?: number | undefined;
```

## AriaAttributes."aria-valuemin" property

Defines the minimum allowed value for a range widget.

**Signature:**

```typescript
'aria-valuemin'?: number | undefined;
```

## AriaAttributes."aria-valuenow" property

Defines the current value for a range widget.

**Signature:**

```typescript
'aria-valuenow'?: number | undefined;
```

## AriaAttributes."aria-valuetext" property

Defines the human readable text alternative of aria-valuenow for a range widget.

**Signature:**

```typescript
'aria-valuetext'?: string | undefined;
```

## AriaAttributes interface

**Signature:**

```typescript
export interface AriaAttributes
```

## Properties

| Property                                                                     | Modifiers | Type                                                                                                                                                                                    | Description                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ["aria-activedescendant"?](./qwik.ariaattributes._aria-activedescendant_.md) |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Identifies the currently active element when DOM focus is on a composite widget, textbox, group, or application.                                                                                                     |
| ["aria-atomic"?](./qwik.ariaattributes._aria-atomic_.md)                     |           | Booleanish \| undefined                                                                                                                                                                 | _(Optional)_ Indicates whether assistive technologies will present all, or only parts of, the changed region based on the change notifications defined by the aria-relevant attribute.                                            |
| ["aria-autocomplete"?](./qwik.ariaattributes._aria-autocomplete_.md)         |           | 'none' \| 'inline' \| 'list' \| 'both' \| undefined                                                                                                                                     | _(Optional)_ Indicates whether inputting text could trigger display of one or more predictions of the user's intended value for an input and specifies how predictions would be presented if they are made.                       |
| ["aria-busy"?](./qwik.ariaattributes._aria-busy_.md)                         |           | Booleanish \| undefined                                                                                                                                                                 | _(Optional)_ Indicates an element is being modified and that assistive technologies MAY want to wait until the modifications are complete before exposing them to the user.                                                       |
| ["aria-checked"?](./qwik.ariaattributes._aria-checked_.md)                   |           | boolean \| 'false' \| 'mixed' \| 'true' \| undefined                                                                                                                                    | _(Optional)_ Indicates the current "checked" state of checkboxes, radio buttons, and other widgets.                                                                                                                               |
| ["aria-colcount"?](./qwik.ariaattributes._aria-colcount_.md)                 |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines the total number of columns in a table, grid, or treegrid.                                                                                                                                                   |
| ["aria-colindex"?](./qwik.ariaattributes._aria-colindex_.md)                 |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines an element's column index or position with respect to the total number of columns within a table, grid, or treegrid.                                                                                         |
| ["aria-colspan"?](./qwik.ariaattributes._aria-colspan_.md)                   |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines the number of columns spanned by a cell or gridcell within a table, grid, or treegrid.                                                                                                                       |
| ["aria-controls"?](./qwik.ariaattributes._aria-controls_.md)                 |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Identifies the element (or elements) whose contents or presence are controlled by the current element.                                                                                                               |
| ["aria-current"?](./qwik.ariaattributes._aria-current_.md)                   |           | boolean \| 'false' \| 'true' \| 'page' \| 'step' \| 'location' \| 'date' \| 'time' \| undefined                                                                                         | _(Optional)_ Indicates the element that represents the current item within a container or set of related elements.                                                                                                                |
| ["aria-describedby"?](./qwik.ariaattributes._aria-describedby_.md)           |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Identifies the element (or elements) that describes the object.                                                                                                                                                      |
| ["aria-details"?](./qwik.ariaattributes._aria-details_.md)                   |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Identifies the element that provides a detailed, extended description for the object.                                                                                                                                |
| ["aria-disabled"?](./qwik.ariaattributes._aria-disabled_.md)                 |           | Booleanish \| undefined                                                                                                                                                                 | _(Optional)_ Indicates that the element is perceivable but disabled, so it is not editable or otherwise operable.                                                                                                                 |
| ["aria-dropeffect"?](./qwik.ariaattributes._aria-dropeffect_.md)             |           | 'none' \| 'copy' \| 'execute' \| 'link' \| 'move' \| 'popup' \| undefined                                                                                                               | _(Optional)_ Indicates what functions can be performed when a dragged object is released on the drop target.                                                                                                                      |
| ["aria-errormessage"?](./qwik.ariaattributes._aria-errormessage_.md)         |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Identifies the element that provides an error message for the object.                                                                                                                                                |
| ["aria-expanded"?](./qwik.ariaattributes._aria-expanded_.md)                 |           | Booleanish \| undefined                                                                                                                                                                 | _(Optional)_ Indicates whether the element, or another grouping element it controls, is currently expanded or collapsed.                                                                                                          |
| ["aria-flowto"?](./qwik.ariaattributes._aria-flowto_.md)                     |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Identifies the next element (or elements) in an alternate reading order of content which, at the user's discretion, allows assistive technology to override the general default of reading in document source order. |
| ["aria-grabbed"?](./qwik.ariaattributes._aria-grabbed_.md)                   |           | Booleanish \| undefined                                                                                                                                                                 | _(Optional)_ Indicates an element's "grabbed" state in a drag-and-drop operation.                                                                                                                                                 |
| ["aria-haspopup"?](./qwik.ariaattributes._aria-haspopup_.md)                 |           | boolean \| 'false' \| 'true' \| 'menu' \| 'listbox' \| 'tree' \| 'grid' \| 'dialog' \| undefined                                                                                        | _(Optional)_ Indicates the availability and type of interactive popup element, such as menu or dialog, that can be triggered by an element.                                                                                       |
| ["aria-hidden"?](./qwik.ariaattributes._aria-hidden_.md)                     |           | Booleanish \| undefined                                                                                                                                                                 | _(Optional)_ Indicates whether the element is exposed to an accessibility API.                                                                                                                                                    |
| ["aria-invalid"?](./qwik.ariaattributes._aria-invalid_.md)                   |           | boolean \| 'false' \| 'true' \| 'grammar' \| 'spelling' \| undefined                                                                                                                    | _(Optional)_ Indicates the entered value does not conform to the format expected by the application.                                                                                                                              |
| ["aria-keyshortcuts"?](./qwik.ariaattributes._aria-keyshortcuts_.md)         |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Indicates keyboard shortcuts that an author has implemented to activate or give focus to an element.                                                                                                                 |
| ["aria-label"?](./qwik.ariaattributes._aria-label_.md)                       |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Defines a string value that labels the current element.                                                                                                                                                              |
| ["aria-labelledby"?](./qwik.ariaattributes._aria-labelledby_.md)             |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Identifies the element (or elements) that labels the current element.                                                                                                                                                |
| ["aria-level"?](./qwik.ariaattributes._aria-level_.md)                       |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines the hierarchical level of an element within a structure.                                                                                                                                                     |
| ["aria-live"?](./qwik.ariaattributes._aria-live_.md)                         |           | 'off' \| 'assertive' \| 'polite' \| undefined                                                                                                                                           | _(Optional)_ Indicates that an element will be updated, and describes the types of updates the user agents, assistive technologies, and user can expect from the live region.                                                     |
| ["aria-modal"?](./qwik.ariaattributes._aria-modal_.md)                       |           | Booleanish \| undefined                                                                                                                                                                 | _(Optional)_ Indicates whether an element is modal when displayed.                                                                                                                                                                |
| ["aria-multiline"?](./qwik.ariaattributes._aria-multiline_.md)               |           | Booleanish \| undefined                                                                                                                                                                 | _(Optional)_ Indicates whether a text box accepts multiple lines of input or only a single line.                                                                                                                                  |
| ["aria-multiselectable"?](./qwik.ariaattributes._aria-multiselectable_.md)   |           | Booleanish \| undefined                                                                                                                                                                 | _(Optional)_ Indicates that the user may select more than one item from the current selectable descendants.                                                                                                                       |
| ["aria-orientation"?](./qwik.ariaattributes._aria-orientation_.md)           |           | 'horizontal' \| 'vertical' \| undefined                                                                                                                                                 | _(Optional)_ Indicates whether the element's orientation is horizontal, vertical, or unknown/ambiguous.                                                                                                                           |
| ["aria-owns"?](./qwik.ariaattributes._aria-owns_.md)                         |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Identifies an element (or elements) in order to define a visual, functional, or contextual parent/child relationship between DOM elements where the DOM hierarchy cannot be used to represent the relationship.      |
| ["aria-placeholder"?](./qwik.ariaattributes._aria-placeholder_.md)           |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Defines a short hint (a word or short phrase) intended to aid the user with data entry when the control has no value. A hint could be a sample value or a brief description of the expected format.                  |
| ["aria-posinset"?](./qwik.ariaattributes._aria-posinset_.md)                 |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines an element's number or position in the current set of listitems or treeitems. Not required if all elements in the set are present in the DOM.                                                                |
| ["aria-pressed"?](./qwik.ariaattributes._aria-pressed_.md)                   |           | boolean \| 'false' \| 'mixed' \| 'true' \| undefined                                                                                                                                    | _(Optional)_ Indicates the current "pressed" state of toggle buttons.                                                                                                                                                             |
| ["aria-readonly"?](./qwik.ariaattributes._aria-readonly_.md)                 |           | Booleanish \| undefined                                                                                                                                                                 | _(Optional)_ Indicates that the element is not editable, but is otherwise operable.                                                                                                                                               |
| ["aria-relevant"?](./qwik.ariaattributes._aria-relevant_.md)                 |           | 'additions' \| 'additions removals' \| 'additions text' \| 'all' \| 'removals' \| 'removals additions' \| 'removals text' \| 'text' \| 'text additions' \| 'text removals' \| undefined | _(Optional)_ Indicates what notifications the user agent will trigger when the accessibility tree within a live region is modified.                                                                                               |
| ["aria-required"?](./qwik.ariaattributes._aria-required_.md)                 |           | Booleanish \| undefined                                                                                                                                                                 | _(Optional)_ Indicates that user input is required on the element before a form may be submitted.                                                                                                                                 |
| ["aria-roledescription"?](./qwik.ariaattributes._aria-roledescription_.md)   |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Defines a human-readable, author-localized description for the role of an element.                                                                                                                                   |
| ["aria-rowcount"?](./qwik.ariaattributes._aria-rowcount_.md)                 |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines the total number of rows in a table, grid, or treegrid.                                                                                                                                                      |
| ["aria-rowindex"?](./qwik.ariaattributes._aria-rowindex_.md)                 |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines an element's row index or position with respect to the total number of rows within a table, grid, or treegrid.                                                                                               |
| ["aria-rowspan"?](./qwik.ariaattributes._aria-rowspan_.md)                   |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines the number of rows spanned by a cell or gridcell within a table, grid, or treegrid.                                                                                                                          |
| ["aria-selected"?](./qwik.ariaattributes._aria-selected_.md)                 |           | Booleanish \| undefined                                                                                                                                                                 | _(Optional)_ Indicates the current "selected" state of various widgets.                                                                                                                                                           |
| ["aria-setsize"?](./qwik.ariaattributes._aria-setsize_.md)                   |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines the number of items in the current set of listitems or treeitems. Not required if all elements in the set are present in the DOM.                                                                            |
| ["aria-sort"?](./qwik.ariaattributes._aria-sort_.md)                         |           | 'none' \| 'ascending' \| 'descending' \| 'other' \| undefined                                                                                                                           | _(Optional)_ Indicates if items in a table or grid are sorted in ascending or descending order.                                                                                                                                   |
| ["aria-valuemax"?](./qwik.ariaattributes._aria-valuemax_.md)                 |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines the maximum allowed value for a range widget.                                                                                                                                                                |
| ["aria-valuemin"?](./qwik.ariaattributes._aria-valuemin_.md)                 |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines the minimum allowed value for a range widget.                                                                                                                                                                |
| ["aria-valuenow"?](./qwik.ariaattributes._aria-valuenow_.md)                 |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines the current value for a range widget.                                                                                                                                                                        |
| ["aria-valuetext"?](./qwik.ariaattributes._aria-valuetext_.md)               |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Defines the human readable text alternative of aria-valuenow for a range widget.                                                                                                                                     |

## AriaRole type

**Signature:**

```typescript
export type AriaRole =
  | "alert"
  | "alertdialog"
  | "application"
  | "article"
  | "banner"
  | "button"
  | "cell"
  | "checkbox"
  | "columnheader"
  | "combobox"
  | "complementary"
  | "contentinfo"
  | "definition"
  | "dialog"
  | "directory"
  | "document"
  | "feed"
  | "figure"
  | "form"
  | "grid"
  | "gridcell"
  | "group"
  | "heading"
  | "img"
  | "link"
  | "list"
  | "listbox"
  | "listitem"
  | "log"
  | "main"
  | "marquee"
  | "math"
  | "menu"
  | "menubar"
  | "menuitem"
  | "menuitemcheckbox"
  | "menuitemradio"
  | "navigation"
  | "none"
  | "note"
  | "option"
  | "presentation"
  | "progressbar"
  | "radio"
  | "radiogroup"
  | "region"
  | "row"
  | "rowgroup"
  | "rowheader"
  | "scrollbar"
  | "search"
  | "searchbox"
  | "separator"
  | "slider"
  | "spinbutton"
  | "status"
  | "switch"
  | "tab"
  | "table"
  | "tablist"
  | "tabpanel"
  | "term"
  | "textbox"
  | "timer"
  | "toolbar"
  | "tooltip"
  | "tree"
  | "treegrid"
  | "treeitem"
  | (string & {});
```

## Component type

Type representing the Qwik component.

`Component` is the type returned by invoking `component$`<!-- -->.

```
interface MyComponentProps {
  someProp: string;
}
const MyComponent: Component<MyComponentProps> = component$((props: MyComponentProps) => {
  return <span>{props.someProp}</span>;
});
```

**Signature:**

```typescript
export type Component<PROPS extends {}> = FunctionComponent<PublicProps<PROPS>>;
```

**References:** [FunctionComponent](./qwik.functioncomponent.md)<!-- -->, [PublicProps](./qwik.publicprops.md)

## component$ variable

Declare a Qwik component that can be used to create UI.

Use `component$` to declare a Qwik component. A Qwik component is a special kind of component that allows the Qwik framework to lazy load and execute the component independently of other Qwik components as well as lazy load the component's life-cycle hooks and event handlers.

Side note: You can also declare regular (standard JSX) components that will have standard synchronous behavior.

Qwik component is a facade that describes how the component should be used without forcing the implementation of the component to be eagerly loaded. A minimum Qwik definition consists of:

\#\#\# Example

An example showing how to create a counter component:

```tsx
export interface CounterProps {
  initialValue?: number;
  step?: number;
}
export const Counter = component$((props: CounterProps) => {
  const state = useStore({ count: props.initialValue || 0 });
  return (
    <div>
      <span>{state.count}</span>
      <button onClick$={() => (state.count += props.step || 1)}>+</button>
    </div>
  );
});
```

- `component$` is how a component gets declared. - `{ value?: number; step?: number }` declares the public (props) interface of the component. - `{ count: number }` declares the private (state) interface of the component.

The above can then be used like so:

```tsx
export const OtherComponent = component$(() => {
  return <Counter initialValue={100} />;
});
```

See also: `component`<!-- -->, `useCleanup`<!-- -->, `onResume`<!-- -->, `onPause`<!-- -->, `useOn`<!-- -->, `useOnDocument`<!-- -->, `useOnWindow`<!-- -->, `useStyles`

**Signature:**

```typescript
component$: <PROPS extends {}>(onMount: OnRenderFn<PROPS>) => Component<PROPS>;
```

## ComponentBaseProps."q:slot" property

**Signature:**

```typescript
'q:slot'?: string;
```

## ComponentBaseProps.key property

**Signature:**

```typescript
key?: string | number | null | undefined;
```

## ComponentBaseProps interface

**Signature:**

```typescript
export interface ComponentBaseProps
```

## Properties

| Property                                           | Modifiers | Type                                  | Description  |
| -------------------------------------------------- | --------- | ------------------------------------- | ------------ |
| ["q:slot"?](./qwik.componentbaseprops._q_slot_.md) |           | string                                | _(Optional)_ |
| [key?](./qwik.componentbaseprops.key.md)           |           | string \| number \| null \| undefined | _(Optional)_ |

## componentQrl variable

Declare a Qwik component that can be used to create UI.

Use `component$` to declare a Qwik component. A Qwik component is a special kind of component that allows the Qwik framework to lazy load and execute the component independently of other Qwik components as well as lazy load the component's life-cycle hooks and event handlers.

Side note: You can also declare regular (standard JSX) components that will have standard synchronous behavior.

Qwik component is a facade that describes how the component should be used without forcing the implementation of the component to be eagerly loaded. A minimum Qwik definition consists of:

\#\#\# Example

An example showing how to create a counter component:

```tsx
export interface CounterProps {
  initialValue?: number;
  step?: number;
}
export const Counter = component$((props: CounterProps) => {
  const state = useStore({ count: props.initialValue || 0 });
  return (
    <div>
      <span>{state.count}</span>
      <button onClick$={() => (state.count += props.step || 1)}>+</button>
    </div>
  );
});
```

- `component$` is how a component gets declared. - `{ value?: number; step?: number }` declares the public (props) interface of the component. - `{ count: number }` declares the private (state) interface of the component.

The above can then be used like so:

```tsx
export const OtherComponent = component$(() => {
  return <Counter initialValue={100} />;
});
```

See also: `component`<!-- -->, `useCleanup`<!-- -->, `onResume`<!-- -->, `onPause`<!-- -->, `useOn`<!-- -->, `useOnDocument`<!-- -->, `useOnWindow`<!-- -->, `useStyles`

**Signature:**

```typescript
componentQrl: <PROPS extends {}>(componentQrl: QRL<OnRenderFn<PROPS>>) =>
  Component<PROPS>;
```

## Context interface

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

> Warning: This API is now obsolete.
>
> Please use `ContextId` instead.

**Signature:**

```typescript
export interface Context<STATE extends object> extends ContextId<STATE>
```

**Extends:** [ContextId](./qwik.contextid.md)<!-- -->&lt;STATE&gt;

## ContextId.\_\_brand_context_type\_\_ property

Design-time property to store type information for the context.

**Signature:**

```typescript
readonly __brand_context_type__: STATE;
```

## ContextId.id property

A unique ID for the context.

**Signature:**

```typescript
readonly id: string;
```

## ContextId interface

ContextId is a typesafe ID for your context.

Context is a way to pass stores to the child components without prop-drilling.

Use `createContextId()` to create a `ContextId`<!-- -->. `ContextId` is just a serializable identifier for the context. It is not the context value itself. See `useContextProvider()` and `useContext()` for the values. Qwik needs a serializable ID for the context so that the it can track context providers and consumers in a way that survives resumability.

\#\#\# Example

```tsx
// Declare the Context type.
interface TodosStore {
  items: string[];
}
// Create a Context ID (no data is saved here.)
// You will use this ID to both create and retrieve the Context.
export const TodosContext = createContextId<TodosStore>("Todos");

// Example of providing context to child components.
export const App = component$(() => {
  useContextProvider(
    TodosContext,
    useStore<TodosStore>({
      items: ["Learn Qwik", "Build Qwik app", "Profit"],
    })
  );

  return <Items />;
});

// Example of retrieving the context provided by a parent component.
export const Items = component$(() => {
  const todos = useContext(TodosContext);
  return (
    <ul>
      {todos.items.map((item) => (
        <li>{item}</li>
      ))}
    </ul>
  );
});
```

**Signature:**

```typescript
export interface ContextId<STATE>
```

## Properties

| Property                                                                 | Modifiers             | Type   | Description                                                     |
| ------------------------------------------------------------------------ | --------------------- | ------ | --------------------------------------------------------------- |
| [\_\_brand_context_type\_\_](./qwik.contextid.__brand_context_type__.md) | <code>readonly</code> | STATE  | Design-time property to store type information for the context. |
| [id](./qwik.contextid.id.md)                                             | <code>readonly</code> | string | A unique ID for the context.                                    |

## createContext variable

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

> Warning: This API is now obsolete.
>
> Please use `createContextId` instead.

**Signature:**

```typescript
createContext: <STATE extends object>(name: string) => ContextId<STATE>;
```

## createContextId variable

Create a context ID to be used in your application. The name should be written with no spaces.

Context is a way to pass stores to the child components without prop-drilling.

Use `createContextId()` to create a `ContextId`<!-- -->. `ContextId` is just a serializable identifier for the context. It is not the context value itself. See `useContextProvider()` and `useContext()` for the values. Qwik needs a serializable ID for the context so that the it can track context providers and consumers in a way that survives resumability.

\#\#\# Example

```tsx
// Declare the Context type.
interface TodosStore {
  items: string[];
}
// Create a Context ID (no data is saved here.)
// You will use this ID to both create and retrieve the Context.
export const TodosContext = createContextId<TodosStore>("Todos");

// Example of providing context to child components.
export const App = component$(() => {
  useContextProvider(
    TodosContext,
    useStore<TodosStore>({
      items: ["Learn Qwik", "Build Qwik app", "Profit"],
    })
  );

  return <Items />;
});

// Example of retrieving the context provided by a parent component.
export const Items = component$(() => {
  const todos = useContext(TodosContext);
  return (
    <ul>
      {todos.items.map((item) => (
        <li>{item}</li>
      ))}
    </ul>
  );
});
```

**Signature:**

```typescript
createContextId: <STATE = unknown>(name: string) => ContextId<STATE>;
```

## DOMAttributes.children property

**Signature:**

```typescript
children?: JSXChildren;
```

## DOMAttributes.key property

**Signature:**

```typescript
key?: string | number | null | undefined;
```

## DOMAttributes interface

**Signature:**

```typescript
export interface DOMAttributes<T> extends QwikProps<T>, QwikEvents<T>
```

**Extends:** QwikProps&lt;T&gt;, QwikEvents&lt;T&gt;

## Properties

| Property                                      | Modifiers | Type                                  | Description  |
| --------------------------------------------- | --------- | ------------------------------------- | ------------ |
| [children?](./qwik.domattributes.children.md) |           | [JSXChildren](./qwik.jsxchildren.md)  | _(Optional)_ |
| [key?](./qwik.domattributes.key.md)           |           | string \| number \| null \| undefined | _(Optional)_ |

## EagernessOptions type

**Signature:**

```typescript
export type EagernessOptions = "visible" | "load" | "idle";
```

## Fragment variable

**Signature:**

```typescript
Fragment: FunctionComponent<{
  children?: any;
  key?: string | number | null;
}>;
```

## FunctionComponent interface

**Signature:**

```typescript
export interface FunctionComponent<P = Record<string, any>>
```

## h.h() function

**Signature:**

```typescript
function h(type: any): JSXNode<any>;
```

## Parameters

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| type      | any  |             |

**Returns:**

[JSXNode](./qwik.jsxnode.md)<!-- -->&lt;any&gt;

## h.h() function

**Signature:**

```typescript
function h(type: Node, data: any): JSXNode<any>;
```

## Parameters

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| type      | Node |             |
| data      | any  |             |

**Returns:**

[JSXNode](./qwik.jsxnode.md)<!-- -->&lt;any&gt;

## h.h() function

**Signature:**

```typescript
function h(type: any, text: string): JSXNode<any>;
```

## Parameters

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| type      | any    |             |
| text      | string |             |

**Returns:**

[JSXNode](./qwik.jsxnode.md)<!-- -->&lt;any&gt;

## h.h() function

**Signature:**

```typescript
function h(type: any, children: Array<any>): JSXNode<any>;
```

## Parameters

| Parameter | Type             | Description |
| --------- | ---------------- | ----------- |
| type      | any              |             |
| children  | Array&lt;any&gt; |             |

**Returns:**

[JSXNode](./qwik.jsxnode.md)<!-- -->&lt;any&gt;

## h.h() function

**Signature:**

```typescript
function h(type: any, data: any, text: string): JSXNode<any>;
```

## Parameters

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| type      | any    |             |
| data      | any    |             |
| text      | string |             |

**Returns:**

[JSXNode](./qwik.jsxnode.md)<!-- -->&lt;any&gt;

## h.h() function

**Signature:**

```typescript
function h(
  type: any,
  data: any,
  children: Array<JSXNode<any> | undefined | null>
): JSXNode<any>;
```

## Parameters

| Parameter | Type                                                                              | Description |
| --------- | --------------------------------------------------------------------------------- | ----------- |
| type      | any                                                                               |             |
| data      | any                                                                               |             |
| children  | Array&lt;[JSXNode](./qwik.jsxnode.md)<!-- -->&lt;any&gt; \| undefined \| null&gt; |             |

**Returns:**

[JSXNode](./qwik.jsxnode.md)<!-- -->&lt;any&gt;

## h.h() function

**Signature:**

```typescript
function h(sel: any, data: any | null, children: JSXNode<any>): JSXNode<any>;
```

## Parameters

| Parameter | Type                                            | Description |
| --------- | ----------------------------------------------- | ----------- |
| sel       | any                                             |             |
| data      | any \| null                                     |             |
| children  | [JSXNode](./qwik.jsxnode.md)<!-- -->&lt;any&gt; |             |

**Returns:**

[JSXNode](./qwik.jsxnode.md)<!-- -->&lt;any&gt;

## h.JSX.Element interface

**Signature:**

```typescript
interface Element extends QwikJSX.Element
```

**Extends:** [QwikJSX.Element](./qwik.qwikjsx.element.md)

## h.JSX.ElementChildrenAttribute.children property

**Signature:**

```typescript
children?: any;
```

## h.JSX.ElementChildrenAttribute interface

**Signature:**

```typescript
interface ElementChildrenAttribute
```

## Properties

| Property                                                       | Modifiers | Type | Description  |
| -------------------------------------------------------------- | --------- | ---- | ------------ |
| [children?](./qwik.h.jsx.elementchildrenattribute.children.md) |           | any  | _(Optional)_ |

## h.JSX.IntrinsicAttributes interface

**Signature:**

```typescript
interface IntrinsicAttributes extends QwikJSX.IntrinsicAttributes
```

**Extends:** [QwikJSX.IntrinsicAttributes](./qwik.qwikjsx.intrinsicattributes.md)

## h.JSX.IntrinsicElements interface

**Signature:**

```typescript
interface IntrinsicElements extends QwikJSX.IntrinsicElements
```

**Extends:** [QwikJSX.IntrinsicElements](./qwik.qwikjsx.intrinsicelements.md)

## h.JSX namespace

**Signature:**

```typescript
namespace JSX
```

## Interfaces

| Interface                                                            | Description |
| -------------------------------------------------------------------- | ----------- |
| [Element](./qwik.h.jsx.element.md)                                   |             |
| [ElementChildrenAttribute](./qwik.h.jsx.elementchildrenattribute.md) |             |
| [IntrinsicAttributes](./qwik.h.jsx.intrinsicattributes.md)           |             |
| [IntrinsicElements](./qwik.h.jsx.intrinsicelements.md)               |             |

## h namespace

**Signature:**

```typescript
export declare namespace h
```

## Functions

| Function                                   | Description |
| ------------------------------------------ | ----------- |
| [h(type)](./qwik.h.h.md)                   |             |
| [h(type, data)](./qwik.h.h_1.md)           |             |
| [h(type, text)](./qwik.h.h_2.md)           |             |
| [h(type, children)](./qwik.h.h_3.md)       |             |
| [h(type, data, text)](./qwik.h.h_4.md)     |             |
| [h(type, data, children)](./qwik.h.h_5.md) |             |
| [h(sel, data, children)](./qwik.h.h_6.md)  |             |

## Namespaces

| Namespace              | Description |
| ---------------------- | ----------- |
| [JSX](./qwik.h.jsx.md) |             |

## HTMLAttributes.about property

**Signature:**

```typescript
about?: string | undefined;
```

## HTMLAttributes.accessKey property

**Signature:**

```typescript
accessKey?: string | undefined;
```

## HTMLAttributes.autoCapitalize property

**Signature:**

```typescript
autoCapitalize?: string | undefined;
```

## HTMLAttributes.autoCorrect property

**Signature:**

```typescript
autoCorrect?: string | undefined;
```

## HTMLAttributes.autoSave property

**Signature:**

```typescript
autoSave?: string | undefined;
```

## HTMLAttributes.className property

> Warning: This API is now obsolete.
>
> - Use `class` instead

**Signature:**

```typescript
className?: string | undefined;
```

## HTMLAttributes.color property

**Signature:**

```typescript
color?: string | undefined;
```

## HTMLAttributes.contentEditable property

**Signature:**

```typescript
contentEditable?: 'true' | 'false' | 'inherit' | undefined;
```

## HTMLAttributes.contextMenu property

**Signature:**

```typescript
contextMenu?: string | undefined;
```

## HTMLAttributes.datatype property

**Signature:**

```typescript
datatype?: string | undefined;
```

## HTMLAttributes.dir property

**Signature:**

```typescript
dir?: 'ltr' | 'rtl' | 'auto' | undefined;
```

## HTMLAttributes.draggable property

**Signature:**

```typescript
draggable?: boolean | undefined;
```

## HTMLAttributes.hidden property

**Signature:**

```typescript
hidden?: boolean | undefined;
```

## HTMLAttributes.id property

**Signature:**

```typescript
id?: string | undefined;
```

## HTMLAttributes.inlist property

**Signature:**

```typescript
inlist?: any;
```

## HTMLAttributes.inputMode property

Hints at the type of data that might be entered by the user while editing the element or its contents

**Signature:**

```typescript
inputMode?: 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search' | undefined;
```

## HTMLAttributes.is property

Specify that a standard HTML element should behave like a defined custom built-in element

**Signature:**

```typescript
is?: string | undefined;
```

## HTMLAttributes.itemID property

**Signature:**

```typescript
itemID?: string | undefined;
```

## HTMLAttributes.itemProp property

**Signature:**

```typescript
itemProp?: string | undefined;
```

## HTMLAttributes.itemRef property

**Signature:**

```typescript
itemRef?: string | undefined;
```

## HTMLAttributes.itemScope property

**Signature:**

```typescript
itemScope?: boolean | undefined;
```

## HTMLAttributes.itemType property

**Signature:**

```typescript
itemType?: string | undefined;
```

## HTMLAttributes.lang property

**Signature:**

```typescript
lang?: string | undefined;
```

## HTMLAttributes interface

**Signature:**

```typescript
export interface HTMLAttributes<T> extends AriaAttributes, DOMAttributes<T>
```

**Extends:** [AriaAttributes](./qwik.ariaattributes.md)<!-- -->, [DOMAttributes](./qwik.domattributes.md)<!-- -->&lt;T&gt;

## Properties

| Property                                                     | Modifiers | Type                                                                                             | Description                                                                                                        |
| ------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| [about?](./qwik.htmlattributes.about.md)                     |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [accessKey?](./qwik.htmlattributes.accesskey.md)             |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [autoCapitalize?](./qwik.htmlattributes.autocapitalize.md)   |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [autoCorrect?](./qwik.htmlattributes.autocorrect.md)         |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [autoSave?](./qwik.htmlattributes.autosave.md)               |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [className?](./qwik.htmlattributes.classname.md)             |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [color?](./qwik.htmlattributes.color.md)                     |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [contentEditable?](./qwik.htmlattributes.contenteditable.md) |           | 'true' \| 'false' \| 'inherit' \| undefined                                                      | _(Optional)_                                                                                                       |
| [contextMenu?](./qwik.htmlattributes.contextmenu.md)         |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [datatype?](./qwik.htmlattributes.datatype.md)               |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [dir?](./qwik.htmlattributes.dir.md)                         |           | 'ltr' \| 'rtl' \| 'auto' \| undefined                                                            | _(Optional)_                                                                                                       |
| [draggable?](./qwik.htmlattributes.draggable.md)             |           | boolean \| undefined                                                                             | _(Optional)_                                                                                                       |
| [hidden?](./qwik.htmlattributes.hidden.md)                   |           | boolean \| undefined                                                                             | _(Optional)_                                                                                                       |
| [id?](./qwik.htmlattributes.id.md)                           |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [inlist?](./qwik.htmlattributes.inlist.md)                   |           | any                                                                                              | _(Optional)_                                                                                                       |
| [inputMode?](./qwik.htmlattributes.inputmode.md)             |           | 'none' \| 'text' \| 'tel' \| 'url' \| 'email' \| 'numeric' \| 'decimal' \| 'search' \| undefined | _(Optional)_ Hints at the type of data that might be entered by the user while editing the element or its contents |
| [is?](./qwik.htmlattributes.is.md)                           |           | string \| undefined                                                                              | _(Optional)_ Specify that a standard HTML element should behave like a defined custom built-in element             |
| [itemID?](./qwik.htmlattributes.itemid.md)                   |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [itemProp?](./qwik.htmlattributes.itemprop.md)               |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [itemRef?](./qwik.htmlattributes.itemref.md)                 |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [itemScope?](./qwik.htmlattributes.itemscope.md)             |           | boolean \| undefined                                                                             | _(Optional)_                                                                                                       |
| [itemType?](./qwik.htmlattributes.itemtype.md)               |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [lang?](./qwik.htmlattributes.lang.md)                       |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [placeholder?](./qwik.htmlattributes.placeholder.md)         |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [prefix?](./qwik.htmlattributes.prefix.md)                   |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [property?](./qwik.htmlattributes.property.md)               |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [radioGroup?](./qwik.htmlattributes.radiogroup.md)           |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [resource?](./qwik.htmlattributes.resource.md)               |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [results?](./qwik.htmlattributes.results.md)                 |           | number \| undefined                                                                              | _(Optional)_                                                                                                       |
| [role?](./qwik.htmlattributes.role.md)                       |           | [AriaRole](./qwik.ariarole.md) \| undefined                                                      | _(Optional)_                                                                                                       |
| [security?](./qwik.htmlattributes.security.md)               |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [slot?](./qwik.htmlattributes.slot.md)                       |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [spellcheck?](./qwik.htmlattributes.spellcheck.md)           |           | boolean \| undefined                                                                             | _(Optional)_                                                                                                       |
| [style?](./qwik.htmlattributes.style.md)                     |           | Record&lt;string, string \| number \| undefined&gt; \| string \| undefined                       | _(Optional)_                                                                                                       |
| [tabIndex?](./qwik.htmlattributes.tabindex.md)               |           | number \| undefined                                                                              | _(Optional)_                                                                                                       |
| [title?](./qwik.htmlattributes.title.md)                     |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [translate?](./qwik.htmlattributes.translate.md)             |           | 'yes' \| 'no' \| undefined                                                                       | _(Optional)_                                                                                                       |
| [typeof?](./qwik.htmlattributes.typeof.md)                   |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [unselectable?](./qwik.htmlattributes.unselectable.md)       |           | 'on' \| 'off' \| undefined                                                                       | _(Optional)_                                                                                                       |
| [vocab?](./qwik.htmlattributes.vocab.md)                     |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |

## HTMLAttributes.placeholder property

**Signature:**

```typescript
placeholder?: string | undefined;
```

## HTMLAttributes.prefix property

**Signature:**

```typescript
prefix?: string | undefined;
```

## HTMLAttributes.property property

**Signature:**

```typescript
property?: string | undefined;
```

## HTMLAttributes.radioGroup property

**Signature:**

```typescript
radioGroup?: string | undefined;
```

## HTMLAttributes.resource property

**Signature:**

```typescript
resource?: string | undefined;
```

## HTMLAttributes.results property

**Signature:**

```typescript
results?: number | undefined;
```

## HTMLAttributes.role property

**Signature:**

```typescript
role?: AriaRole | undefined;
```

## HTMLAttributes.security property

**Signature:**

```typescript
security?: string | undefined;
```

## HTMLAttributes.slot property

**Signature:**

```typescript
slot?: string | undefined;
```

## HTMLAttributes.spellcheck property

**Signature:**

```typescript
spellcheck?: boolean | undefined;
```

## HTMLAttributes.style property

**Signature:**

```typescript
style?: Record<string, string | number | undefined> | string | undefined;
```

## HTMLAttributes.tabIndex property

**Signature:**

```typescript
tabIndex?: number | undefined;
```

## HTMLAttributes.title property

**Signature:**

```typescript
title?: string | undefined;
```

## HTMLAttributes.translate property

**Signature:**

```typescript
translate?: 'yes' | 'no' | undefined;
```

## HTMLAttributes.typeof property

**Signature:**

```typescript
typeof?: string | undefined;
```

## HTMLAttributes.unselectable property

**Signature:**

```typescript
unselectable?: 'on' | 'off' | undefined;
```

## HTMLAttributes.vocab property

**Signature:**

```typescript
vocab?: string | undefined;
```

## jsx variable

**Signature:**

```typescript
jsx: <T extends string | FunctionComponent<any>>(
  type: T,
  props: T extends FunctionComponent<infer PROPS> ? PROPS : Record<string, any>,
  key?: string | number | null
) => JSXNode<T>;
```

## JSXChildren type

**Signature:**

```typescript
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
```

**References:** [JSXChildren](./qwik.jsxchildren.md)<!-- -->, [JSXNode](./qwik.jsxnode.md)

## jsxDEV variable

**Signature:**

```typescript
jsxDEV: <T extends string | FunctionComponent<any>>(
  type: T,
  props: T extends FunctionComponent<infer PROPS> ? PROPS : Record<string, any>,
  key: string | number | null | undefined,
  _isStatic: boolean,
  opts: JsxDevOpts,
  _ctx: any
) => JSXNode<T>;
```

## JSXNode.children property

**Signature:**

```typescript
children: any | null;
```

## JSXNode.dev property

**Signature:**

```typescript
dev?: DevJSX;
```

## JSXNode.flags property

**Signature:**

```typescript
flags: number;
```

## JSXNode.immutableProps property

**Signature:**

```typescript
immutableProps: Record<string, any> | null;
```

## JSXNode.key property

**Signature:**

```typescript
key: string | null;
```

## JSXNode interface

**Signature:**

```typescript
export interface JSXNode<T = string | FunctionComponent>
```

## Properties

| Property                                           | Modifiers | Type                                                                                                              | Description  |
| -------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------- | ------------ |
| [children](./qwik.jsxnode.children.md)             |           | any \| null                                                                                                       |              |
| [dev?](./qwik.jsxnode.dev.md)                      |           | DevJSX                                                                                                            | _(Optional)_ |
| [flags](./qwik.jsxnode.flags.md)                   |           | number                                                                                                            |              |
| [immutableProps](./qwik.jsxnode.immutableprops.md) |           | Record&lt;string, any&gt; \| null                                                                                 |              |
| [key](./qwik.jsxnode.key.md)                       |           | string \| null                                                                                                    |              |
| [props](./qwik.jsxnode.props.md)                   |           | T extends [FunctionComponent](./qwik.functioncomponent.md)<!-- -->&lt;infer B&gt; ? B : Record&lt;string, any&gt; |              |
| [type](./qwik.jsxnode.type.md)                     |           | T                                                                                                                 |              |

## JSXNode.props property

**Signature:**

```typescript
props: T extends FunctionComponent<infer B> ? B : Record<string, any>;
```

## JSXNode.type property

**Signature:**

```typescript
type: T;
```

## JSXTagName type

**Signature:**

```typescript
export type JSXTagName =
  | keyof HTMLElementTagNameMap
  | Omit<string, keyof HTMLElementTagNameMap>;
```

## qwik package

## Functions

| Function                                | Description |
| --------------------------------------- | ----------- |
| [h(type, props, children)](./qwik.h.md) |             |

## Interfaces

| Interface                                          | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [AriaAttributes](./qwik.ariaattributes.md)         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| [ComponentBaseProps](./qwik.componentbaseprops.md) |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| [Context](./qwik.context.md)                       | **_(BETA)_**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| [ContextId](./qwik.contextid.md)                   | <p>ContextId is a typesafe ID for your context.</p><p>Context is a way to pass stores to the child components without prop-drilling.</p><p>Use <code>createContextId()</code> to create a <code>ContextId</code>. <code>ContextId</code> is just a serializable identifier for the context. It is not the context value itself. See <code>useContextProvider()</code> and <code>useContext()</code> for the values. Qwik needs a serializable ID for the context so that the it can track context providers and consumers in a way that survives resumability.</p><p>\#\#\# Example</p> |

```tsx
// Declare the Context type.
interface TodosStore {
  items: string[];
}
// Create a Context ID (no data is saved here.)
// You will use this ID to both create and retrieve the Context.
export const TodosContext = createContextId<TodosStore>("Todos");

// Example of providing context to child components.
export const App = component$(() => {
  useContextProvider(
    TodosContext,
    useStore<TodosStore>({
      items: ["Learn Qwik", "Build Qwik app", "Profit"],
    })
  );

  return <Items />;
});

// Example of retrieving the context provided by a parent component.
export const Items = component$(() => {
  const todos = useContext(TodosContext);
  return (
    <ul>
      {todos.items.map((item) => (
        <li>{item}</li>
      ))}
    </ul>
  );
});
```

|
| [DOMAttributes](./qwik.domattributes.md) | |
| [FunctionComponent](./qwik.functioncomponent.md) | |
| [HTMLAttributes](./qwik.htmlattributes.md) | |
| [JSXNode](./qwik.jsxnode.md) | |
| [OnVisibleTaskOptions](./qwik.onvisibletaskoptions.md) | |
| [PropFnInterface](./qwik.propfninterface.md) | |
| [QRL](./qwik.qrl.md) | <p>The <code>QRL</code> type represents a lazy-loadable AND serializable resource.</p><p>QRL stands for Qwik URL.</p><p>Use <code>QRL</code> when you want to refer to a lazy-loaded resource. <code>QRL</code>s are most often used for code (functions) but can also be used for other resources such as <code>string</code>s in the case of styles.</p><p><code>QRL</code> is an opaque token that is generated by the Qwik Optimizer. (Do not rely on any properties in <code>QRL</code> as it may change between versions.)</p><p>\#\# Creating <code>QRL</code> references</p><p>Creating <code>QRL</code> is done using <code>$(...)</code> function. <code>$(...)</code> is a special marker for the Qwik Optimizer that marks that the code should be extracted into a lazy-loaded symbol.</p>

```tsx
useOnDocument(
  "mousemove",
  $((event) => console.log("mousemove", event))
);
```

<p>In the above code, the Qwik Optimizer detects <code>$(...)</code> and transforms the code as shown below:</p>
```tsx
// FILE: <current file>
useOnDocument('mousemove', qrl('./chunk-abc.js', 'onMousemove'));

// FILE: chunk-abc.js
export const onMousemove = () => console.log('mousemove');

````
<p>NOTE: <code>qrl(...)</code> is a result of Qwik Optimizer transformation. You should never have to invoke this function directly in your application. The <code>qrl(...)</code> function should be invoked only after the Qwik Optimizer transformation.</p><p>\#\# Using <code>QRL</code>s</p><p>Use <code>QRL</code> type in your application when you want to get a lazy-loadable reference to a resource (most likely a function).</p>
```tsx
// Example of declaring a custom functions which takes callback as QRL.
export function useMyFunction(callback: QRL<() => void>) {
  doExtraStuff();
  // The callback passed to `onDocument` requires `QRL`.
  useOnDocument('mousemove', callback);
}
````

<p>In the above example, the way to think about the code is that you are not asking for a callback function but rather a reference to a lazy-loadable callback function. Specifically, the function loading should be delayed until it is actually needed. In the above example, the function would not load until after a <code>mousemove</code> event on <code>document</code> fires.</p><p>\#\# Resolving <code>QRL</code> references</p><p>At times it may be necessary to resolve a <code>QRL</code> reference to the actual value. This can be performed using <code>QRL.resolve(..)</code> function.</p>
```tsx
// Assume you have QRL reference to a greet function
const lazyGreet: QRL<() => void> = $(() => console.log('Hello World!'));

// Use `qrlImport` to load / resolve the reference.
const greet: () => void = await lazyGreet.resolve();

// Invoke it
greet();

````
<p>NOTE: <code>element</code> is needed because <code>QRL</code>s are relative and need a base location to resolve against. The base location is encoded in the HTML in the form of <code>&lt;div q:base=&quot;/url&quot;&gt;</code>.</p><p>\#\# Question: Why not just use <code>import()</code>?</p><p>At first glance, <code>QRL</code> serves the same purpose as <code>import()</code>. However, there are three subtle differences that need to be taken into account.</p><p>1. <code>QRL</code>s must be serializable into HTML. 2. <code>QRL</code>s must be resolved by framework relative to <code>q:base</code>. 3. <code>QRL</code>s must be able to capture lexically scoped variables. 4. <code>QRL</code>s encapsulate the difference between running with and without Qwik Optimizer. 5. <code>QRL</code>s allow expressing lazy-loaded boundaries without thinking about chunk and symbol names.</p><p>Let's assume that you intend to write code such as this:</p>
```typescript
return <button onClick={() => (await import('./chunk-abc.js')).onClick}>
````

<p>The above code needs to be serialized into DOM such as:</p>
```
<div q:base="/build/">
  <button on:click="./chunk-abc.js#onClick">...</button>
</div>
```
<p>1. Notice there is no easy way to extract chunk (<code>./chunk-abc.js</code>) and symbol (<code>onClick</code>) into HTML. 2. Notice that even if you could extract it, the <code>import('./chunk-abc.js')</code> would become relative to where the <code>import()</code> file is declared. Because it is our framework doing the load, the <code>./chunk-abc.js</code> would become relative to the framework file. This is not correct, as it should be relative to the original file generated by the bundler. 3. Next, the framework needs to resolve the <code>./chunk-abc.js</code> and needs a base location that is encoded in the HTML. 4. The QRL needs to be able to capture lexically scoped variables. (<code>import()</code> only allows loading top-level symbols which don't capture variables.) 5. As a developer, you don't want to think about <code>import</code> and naming the chunks and symbols. You just want to say: "this should be lazy."</p><p>These are the main reasons why Qwik introduces its own concept of <code>QRL</code>.</p> |
|  [QwikAnimationEvent](./qwik.qwikanimationevent.md) | **_(BETA)_** |
|  [QwikChangeEvent](./qwik.qwikchangeevent.md) | **_(BETA)_** |
|  [QwikClipboardEvent](./qwik.qwikclipboardevent.md) | **_(BETA)_** |
|  [QwikCompositionEvent](./qwik.qwikcompositionevent.md) | **_(BETA)_** |
|  [QwikDOMAttributes](./qwik.qwikdomattributes.md) |  |
|  [QwikDragEvent](./qwik.qwikdragevent.md) | **_(BETA)_** |
|  [QwikFocusEvent](./qwik.qwikfocusevent.md) | **_(BETA)_** |
|  [QwikIntrinsicElements](./qwik.qwikintrinsicelements.md) |  |
|  [QwikInvalidEvent](./qwik.qwikinvalidevent.md) | **_(BETA)_** |
|  [QwikKeyboardEvent](./qwik.qwikkeyboardevent.md) | **_(BETA)_** |
|  [QwikMouseEvent](./qwik.qwikmouseevent.md) | **_(BETA)_** |
|  [QwikPointerEvent](./qwik.qwikpointerevent.md) | **_(BETA)_** |
|  [QwikSubmitEvent](./qwik.qwiksubmitevent.md) | **_(BETA)_** |
|  [QwikTouchEvent](./qwik.qwiktouchevent.md) | **_(BETA)_** |
|  [QwikTransitionEvent](./qwik.qwiktransitionevent.md) | **_(BETA)_** |
|  [QwikUIEvent](./qwik.qwikuievent.md) | **_(BETA)_** |
|  [QwikWheelEvent](./qwik.qwikwheelevent.md) | **_(BETA)_** |
|  [ResourceCtx](./qwik.resourcectx.md) |  |
|  [ResourceOptions](./qwik.resourceoptions.md) | Options to pass to <code>useResource$()</code> |
|  [ResourcePending](./qwik.resourcepending.md) |  |
|  [ResourceProps](./qwik.resourceprops.md) |  |
|  [ResourceRejected](./qwik.resourcerejected.md) |  |
|  [ResourceResolved](./qwik.resourceresolved.md) |  |
|  [TaskCtx](./qwik.taskctx.md) |  |
|  [Tracker](./qwik.tracker.md) | <p>Used to signal to Qwik which state should be watched for changes.</p><p>The <code>Tracker</code> is passed into the <code>taskFn</code> of <code>useTask</code>. It is intended to be used to wrap state objects in a read proxy which signals to Qwik which properties should be watched for changes. A change to any of the properties causes the <code>taskFn</code> to rerun.</p><p>\#\#\# Example</p><p>The <code>obs</code> passed into the <code>taskFn</code> is used to mark <code>state.count</code> as a property of interest. Any changes to the <code>state.count</code> property will cause the <code>taskFn</code> to rerun.</p>
```tsx
const Cmp = component$(() => {
  const store = useStore({ count: 0, doubleCount: 0 });
  useTask$(({ track }) => {
    const count = track(() => store.count);
    store.doubleCount = 2 * count;
  });
  return (
    <div>
      <span>
        {store.count} / {store.doubleCount}
      </span>
      <button onClick$={() => store.count++}>+</button>
    </div>
  );
});
```
 |
|  [UseStoreOptions](./qwik.usestoreoptions.md) |  |
|  [UseTaskOptions](./qwik.usetaskoptions.md) |  |

## Namespaces

| Namespace                    | Description |
| ---------------------------- | ----------- |
| [h](./qwik.h.md)             |             |
| [QwikJSX](./qwik.qwikjsx.md) |             |

## Variables

| Variable                           | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [\_jsxC](./qwik._jsxc.md)          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [\_jsxQ](./qwik._jsxq.md)          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [$](./qwik._.md)                   | <p>Qwik Optimizer marker function.</p><p>Use <code>$(...)</code> to tell Qwik Optimizer to extract the expression in <code>$(...)</code> into a lazy-loadable resource referenced by <code>QRL</code>.</p>                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [component$](./qwik.component_.md) | <p>Declare a Qwik component that can be used to create UI.</p><p>Use <code>component$</code> to declare a Qwik component. A Qwik component is a special kind of component that allows the Qwik framework to lazy load and execute the component independently of other Qwik components as well as lazy load the component's life-cycle hooks and event handlers.</p><p>Side note: You can also declare regular (standard JSX) components that will have standard synchronous behavior.</p><p>Qwik component is a facade that describes how the component should be used without forcing the implementation of the component to be eagerly loaded. A minimum Qwik definition consists of:</p><p>\#\#\# Example</p><p>An example showing how to create a counter component:</p> |

```tsx
export interface CounterProps {
  initialValue?: number;
  step?: number;
}
export const Counter = component$((props: CounterProps) => {
  const state = useStore({ count: props.initialValue || 0 });
  return (
    <div>
      <span>{state.count}</span>
      <button onClick$={() => (state.count += props.step || 1)}>+</button>
    </div>
  );
});
```

<p>- <code>component$</code> is how a component gets declared. - <code>{ value?: number; step?: number }</code> declares the public (props) interface of the component. - <code>{ count: number }</code> declares the private (state) interface of the component.</p><p>The above can then be used like so:</p>
```tsx
export const OtherComponent = component$(() => {
  return <Counter initialValue={100} />;
});
```
<p>See also: <code>component</code>, <code>useCleanup</code>, <code>onResume</code>, <code>onPause</code>, <code>useOn</code>, <code>useOnDocument</code>, <code>useOnWindow</code>, <code>useStyles</code></p> |
|  [componentQrl](./qwik.componentqrl.md) | <p>Declare a Qwik component that can be used to create UI.</p><p>Use <code>component$</code> to declare a Qwik component. A Qwik component is a special kind of component that allows the Qwik framework to lazy load and execute the component independently of other Qwik components as well as lazy load the component's life-cycle hooks and event handlers.</p><p>Side note: You can also declare regular (standard JSX) components that will have standard synchronous behavior.</p><p>Qwik component is a facade that describes how the component should be used without forcing the implementation of the component to be eagerly loaded. A minimum Qwik definition consists of:</p><p>\#\#\# Example</p><p>An example showing how to create a counter component:</p>
```tsx
export interface CounterProps {
  initialValue?: number;
  step?: number;
}
export const Counter = component$((props: CounterProps) => {
  const state = useStore({ count: props.initialValue || 0 });
  return (
    <div>
      <span>{state.count}</span>
      <button onClick$={() => (state.count += props.step || 1)}>+</button>
    </div>
  );
});
```
<p>- <code>component$</code> is how a component gets declared. - <code>{ value?: number; step?: number }</code> declares the public (props) interface of the component. - <code>{ count: number }</code> declares the private (state) interface of the component.</p><p>The above can then be used like so:</p>
```tsx
export const OtherComponent = component$(() => {
  return <Counter initialValue={100} />;
});
```
<p>See also: <code>component</code>, <code>useCleanup</code>, <code>onResume</code>, <code>onPause</code>, <code>useOn</code>, <code>useOnDocument</code>, <code>useOnWindow</code>, <code>useStyles</code></p> |
|  [createContext](./qwik.createcontext.md) | **_(BETA)_** |
|  [createContextId](./qwik.createcontextid.md) | <p>Create a context ID to be used in your application. The name should be written with no spaces.</p><p>Context is a way to pass stores to the child components without prop-drilling.</p><p>Use <code>createContextId()</code> to create a <code>ContextId</code>. <code>ContextId</code> is just a serializable identifier for the context. It is not the context value itself. See <code>useContextProvider()</code> and <code>useContext()</code> for the values. Qwik needs a serializable ID for the context so that the it can track context providers and consumers in a way that survives resumability.</p><p>\#\#\# Example</p>
```tsx
// Declare the Context type.
interface TodosStore {
  items: string[];
}
// Create a Context ID (no data is saved here.)
// You will use this ID to both create and retrieve the Context.
export const TodosContext = createContextId<TodosStore>('Todos');

// Example of providing context to child components.
export const App = component$(() => {
useContextProvider(
TodosContext,
useStore<TodosStore>({
items: ['Learn Qwik', 'Build Qwik app', 'Profit'],
})
);

return <Items />;
});

// Example of retrieving the context provided by a parent component.
export const Items = component$(() => {
const todos = useContext(TodosContext);
return (
<ul>
{todos.items.map((item) => (
<li>{item}</li>
))}
</ul>
);
});

````
 |
|  [Fragment](./qwik.fragment.md) |  |
|  [jsx](./qwik.jsx.md) |  |
|  [jsxDEV](./qwik.jsxdev.md) |  |
|  [noSerialize](./qwik.noserialize.md) | <p>Marks a property on a store as non-serializable.</p><p>At times it is necessary to store values on a store that are non-serializable. Normally this is a runtime error as Store wants to eagerly report when a non-serializable property is assigned to it.</p><p>You can use <code>noSerialize()</code> to mark a value as non-serializable. The value is persisted in the Store but does not survive serialization. The implication is that when your application is resumed, the value of this object will be <code>undefined</code>. You will be responsible for recovering from this.</p><p>See: \[noSerialize Tutorial\](http://qwik.builder.io/tutorial/store/no-serialize)</p> |
|  [Resource](./qwik.resource.md) | <p>This method works like an async memoized function that runs whenever some tracked value changes and returns some data.</p><p><code>useResource</code> however returns immediate a <code>ResourceReturn</code> object that contains the data and a state that indicates if the data is available or not.</p><p>The status can be one of the following:</p><p>- 'pending' - the data is not yet available. - 'resolved' - the data is available. - 'rejected' - the data is not available due to an error or timeout.</p><p>\#\#\# Example</p><p>Example showing how <code>useResource</code> to perform a fetch to request the weather, whenever the input city name changes.</p>
```tsx
const Cmp = component$(() => {
  const store = useStore({
    city: '',
  });

  const weatherResource = useResource$<any>(async ({ track, cleanup }) => {
    const cityName = track(() => store.city);
    const abortController = new AbortController();
    cleanup(() => abortController.abort('cleanup'));
    const res = await fetch(`http://weatherdata.com?city=${cityName}`, {
      signal: abortController.signal,
    });
    const data = res.json();
    return data;
  });

  return (
    <div>
      <input name="city" onInput$={(ev: any) => (store.city = ev.target.value)} />
      <Resource
        value={weatherResource}
        onResolved={(weather) => {
          return <div>Temperature: {weather.temp}</div>;
        }}
      />
    </div>
  );
});
````

|
| [Slot](./qwik.slot.md) | Allows to project the children of the current component. <Slot/> can only be used within the context of a component defined with <code>component$</code>. |
|  [useClientMount$](./qwik.useclientmount\_.md) | <p>Deprecated API, equivalent of doing:</p>

```tsx
import { useTask$ } from "@builder.io/qwik";
import { isBrowser } from "@builder.io/qwik/build";
useTask$(() => {
  if (isBrowser) {
    // only runs on server
  }
});
```

|
| [useClientMountQrl](./qwik.useclientmountqrl.md) | <p>Deprecated API, equivalent of doing:</p>

```tsx
import { useTask$ } from "@builder.io/qwik";
import { isBrowser } from "@builder.io/qwik/build";
useTask$(() => {
  if (isBrowser) {
    // only runs on server
  }
});
```

|
| [useContext](./qwik.usecontext.md) | <p>Retrieve Context value.</p><p>Use <code>useContext()</code> to retrieve the value of context in a component. To retrieve a value a parent component needs to invoke <code>useContextProvider()</code> to assign a value.</p><p>\#\#\# Example</p>

```tsx
// Declare the Context type.
interface TodosStore {
  items: string[];
}
// Create a Context ID (no data is saved here.)
// You will use this ID to both create and retrieve the Context.
export const TodosContext = createContextId<TodosStore>("Todos");

// Example of providing context to child components.
export const App = component$(() => {
  useContextProvider(
    TodosContext,
    useStore<TodosStore>({
      items: ["Learn Qwik", "Build Qwik app", "Profit"],
    })
  );

  return <Items />;
});

// Example of retrieving the context provided by a parent component.
export const Items = component$(() => {
  const todos = useContext(TodosContext);
  return (
    <ul>
      {todos.items.map((item) => (
        <li>{item}</li>
      ))}
    </ul>
  );
});
```

|
| [useContextProvider](./qwik.usecontextprovider.md) | <p>Assign a value to a Context.</p><p>Use <code>useContextProvider()</code> to assign a value to a context. The assignment happens in the component's function. Once assign use <code>useContext()</code> in any child component to retrieve the value.</p><p>Context is a way to pass stores to the child components without prop-drilling.</p><p>\#\#\# Example</p>

```tsx
// Declare the Context type.
interface TodosStore {
  items: string[];
}
// Create a Context ID (no data is saved here.)
// You will use this ID to both create and retrieve the Context.
export const TodosContext = createContextId<TodosStore>("Todos");

// Example of providing context to child components.
export const App = component$(() => {
  useContextProvider(
    TodosContext,
    useStore<TodosStore>({
      items: ["Learn Qwik", "Build Qwik app", "Profit"],
    })
  );

  return <Items />;
});

// Example of retrieving the context provided by a parent component.
export const Items = component$(() => {
  const todos = useContext(TodosContext);
  return (
    <ul>
      {todos.items.map((item) => (
        <li>{item}</li>
      ))}
    </ul>
  );
});
```

|
| [useMount$](./qwik.usemount_.md) | **_(BETA)_** |
| [useMountQrl](./qwik.usemountqrl.md) | **_(BETA)_** |
| [useResource$](./qwik.useresource_.md) | <p>This method works like an async memoized function that runs whenever some tracked value changes and returns some data.</p><p><code>useResource</code> however returns immediate a <code>ResourceReturn</code> object that contains the data and a state that indicates if the data is available or not.</p><p>The status can be one of the following:</p><p>- 'pending' - the data is not yet available. - 'resolved' - the data is available. - 'rejected' - the data is not available due to an error or timeout.</p><p>\#\#\# Example</p><p>Example showing how <code>useResource</code> to perform a fetch to request the weather, whenever the input city name changes.</p>

```tsx
const Cmp = component$(() => {
  const store = useStore({
    city: "",
  });

  const weatherResource = useResource$<any>(async ({ track, cleanup }) => {
    const cityName = track(() => store.city);
    const abortController = new AbortController();
    cleanup(() => abortController.abort("cleanup"));
    const res = await fetch(`http://weatherdata.com?city=${cityName}`, {
      signal: abortController.signal,
    });
    const data = res.json();
    return data;
  });

  return (
    <div>
      <input
        name="city"
        onInput$={(ev: any) => (store.city = ev.target.value)}
      />
      <Resource
        value={weatherResource}
        onResolved={(weather) => {
          return <div>Temperature: {weather.temp}</div>;
        }}
      />
    </div>
  );
});
```

|
| [useResourceQrl](./qwik.useresourceqrl.md) | <p>This method works like an async memoized function that runs whenever some tracked value changes and returns some data.</p><p><code>useResource</code> however returns immediate a <code>ResourceReturn</code> object that contains the data and a state that indicates if the data is available or not.</p><p>The status can be one of the following:</p><p>- 'pending' - the data is not yet available. - 'resolved' - the data is available. - 'rejected' - the data is not available due to an error or timeout.</p><p>\#\#\# Example</p><p>Example showing how <code>useResource</code> to perform a fetch to request the weather, whenever the input city name changes.</p>

```tsx
const Cmp = component$(() => {
  const store = useStore({
    city: "",
  });

  const weatherResource = useResource$<any>(async ({ track, cleanup }) => {
    const cityName = track(() => store.city);
    const abortController = new AbortController();
    cleanup(() => abortController.abort("cleanup"));
    const res = await fetch(`http://weatherdata.com?city=${cityName}`, {
      signal: abortController.signal,
    });
    const data = res.json();
    return data;
  });

  return (
    <div>
      <input
        name="city"
        onInput$={(ev: any) => (store.city = ev.target.value)}
      />
      <Resource
        value={weatherResource}
        onResolved={(weather) => {
          return <div>Temperature: {weather.temp}</div>;
        }}
      />
    </div>
  );
});
```

|
| [useServerMount$](./qwik.useservermount_.md) | <p>Deprecated API, equivalent of doing:</p>

```tsx
import { useTask$ } from "@builder.io/qwik";
import { isServer } from "@builder.io/qwik/build";
useTask$(() => {
  if (isServer) {
    // only runs on server
  }
});
```

|
| [useServerMountQrl](./qwik.useservermountqrl.md) | <p>Deprecated API, equivalent of doing:</p>

```tsx
import { useTask$ } from "@builder.io/qwik";
import { isServer } from "@builder.io/qwik/build";
useTask$(() => {
  if (isServer) {
    // only runs on server
  }
});
```

|
| [useStore](./qwik.usestore.md) | <p>Creates an object that Qwik can track across serializations.</p><p>Use <code>useStore</code> to create a state for your application. The returned object is a proxy that has a unique ID. The ID of the object is used in the <code>QRL</code>s to refer to the store.</p><p>\#\#\# Example</p><p>Example showing how <code>useStore</code> is used in Counter example to keep track of the count.</p>

```tsx
const Stores = component$(() => {
  const counter = useCounter(1);

  // Reactivity happens even for nested objects and arrays
  const userData = useStore({
    name: "Manu",
    address: {
      address: "",
      city: "",
    },
    orgs: [],
  });

  // useStore() can also accept a function to calculate the initial value
  const state = useStore(() => {
    return {
      value: expensiveInitialValue(),
    };
  });

  return (
    <div>
      <div>Counter: {counter.value}</div>
      <Child userData={userData} state={state} />
    </div>
  );
});

function useCounter(step: number) {
  // Multiple stores can be created in custom hooks for convenience and composability
  const counterStore = useStore({
    value: 0,
  });
  useVisibleTask$(() => {
    // Only runs in the client
    const timer = setInterval(() => {
      counterStore.value += step;
    }, 500);
    return () => {
      clearInterval(timer);
    };
  });
  return counterStore;
}
```

|
| [useStyles$](./qwik.usestyles_.md) | <p>A lazy-loadable reference to a component's styles.</p><p>Component styles allow Qwik to lazy load the style information for the component only when needed. (And avoid double loading it in case of SSR hydration.)</p>

```tsx
import styles from "./code-block.css?inline";

export const CmpStyles = component$(() => {
  useStyles$(styles);

  return <div>Some text</div>;
});
```

|
| [useStylesQrl](./qwik.usestylesqrl.md) | <p>A lazy-loadable reference to a component's styles.</p><p>Component styles allow Qwik to lazy load the style information for the component only when needed. (And avoid double loading it in case of SSR hydration.)</p>

```tsx
import styles from "./code-block.css?inline";

export const CmpStyles = component$(() => {
  useStyles$(styles);

  return <div>Some text</div>;
});
```

|
| [useTask$](./qwik.usetask_.md) | <p>Reruns the <code>taskFn</code> when the observed inputs change.</p><p>Use <code>useTask</code> to observe changes on a set of inputs, and then re-execute the <code>taskFn</code> when those inputs change.</p><p>The <code>taskFn</code> only executes if the observed inputs change. To observe the inputs, use the <code>obs</code> function to wrap property reads. This creates subscriptions that will trigger the <code>taskFn</code> to rerun.</p> |
| [useTaskQrl](./qwik.usetaskqrl.md) | <p>Reruns the <code>taskFn</code> when the observed inputs change.</p><p>Use <code>useTask</code> to observe changes on a set of inputs, and then re-execute the <code>taskFn</code> when those inputs change.</p><p>The <code>taskFn</code> only executes if the observed inputs change. To observe the inputs, use the <code>obs</code> function to wrap property reads. This creates subscriptions that will trigger the <code>taskFn</code> to rerun.</p> |
| [useVisibleTask$](./qwik.usevisibletask_.md) |

```tsx
const Timer = component$(() => {
  const store = useStore({
    count: 0,
  });

  useVisibleTask$(() => {
    // Only runs in the client
    const timer = setInterval(() => {
      store.count++;
    }, 500);
    return () => {
      clearInterval(timer);
    };
  });

  return <div>{store.count}</div>;
});
```

|
| [useVisibleTaskQrl](./qwik.usevisibletaskqrl.md) |

```tsx
const Timer = component$(() => {
  const store = useStore({
    count: 0,
  });

  useVisibleTask$(() => {
    // Only runs in the client
    const timer = setInterval(() => {
      store.count++;
    }, 500);
    return () => {
      clearInterval(timer);
    };
  });

  return <div>{store.count}</div>;
});
```

|
| [useWatch$](./qwik.usewatch_.md) | **_(BETA)_** |
| [useWatchQrl](./qwik.usewatchqrl.md) | **_(BETA)_** |
| [version](./qwik.version.md) | QWIK_VERSION |

## Type Aliases

| Type Alias                       | Description                                                                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [AriaRole](./qwik.ariarole.md)   |                                                                                                                                     |
| [Component](./qwik.component.md) | <p>Type representing the Qwik component.</p><p><code>Component</code> is the type returned by invoking <code>component$</code>.</p> |

```
interface MyComponentProps {
  someProp: string;
}
const MyComponent: Component<MyComponentProps> = component$((props: MyComponentProps) => {
  return <span>{props.someProp}</span>;
});
```

|
| [EagernessOptions](./qwik.eagernessoptions.md) | |
| [JSXChildren](./qwik.jsxchildren.md) | |
| [JSXTagName](./qwik.jsxtagname.md) | |
| [MountFn](./qwik.mountfn.md) | |
| [NativeAnimationEvent](./qwik.nativeanimationevent.md) | **_(BETA)_** |
| [NativeClipboardEvent](./qwik.nativeclipboardevent.md) | **_(BETA)_** |
| [NativeCompositionEvent](./qwik.nativecompositionevent.md) | **_(BETA)_** |
| [NativeDragEvent](./qwik.nativedragevent.md) | **_(BETA)_** |
| [NativeFocusEvent](./qwik.nativefocusevent.md) | **_(BETA)_** |
| [NativeKeyboardEvent](./qwik.nativekeyboardevent.md) | **_(BETA)_** |
| [NativeMouseEvent](./qwik.nativemouseevent.md) | **_(BETA)_** |
| [NativePointerEvent](./qwik.nativepointerevent.md) | **_(BETA)_** |
| [NativeTouchEvent](./qwik.nativetouchevent.md) | **_(BETA)_** |
| [NativeTransitionEvent](./qwik.nativetransitionevent.md) | **_(BETA)_** |
| [NativeUIEvent](./qwik.nativeuievent.md) | **_(BETA)_** |
| [NativeWheelEvent](./qwik.nativewheelevent.md) | **_(BETA)_** |
| [NoSerialize](./qwik.noserialize.md) | Returned type of the <code>noSerialize()</code> function. It will be TYPE or undefined. |
| [OnRenderFn](./qwik.onrenderfn.md) | |
| [PropFunction](./qwik.propfunction.md) | |
| [PropsOf](./qwik.propsof.md) | <p>Infers <code>Props</code> from the component.</p>

```typescript
export const OtherComponent = component$(() => {
  return $(() => <Counter value={100} />);
});
```

|
| [PublicProps](./qwik.publicprops.md) | Extends the defined component PROPS, adding the default ones (children and q:slot).. |
| [ResourceFn](./qwik.resourcefn.md) | |
| [ResourceReturn](./qwik.resourcereturn.md) | |
| [TaskFn](./qwik.taskfn.md) | |
| [ValueOrPromise](./qwik.valueorpromise.md) | Type representing a value which is either resolve or a promise. |
| [VisibleTaskStrategy](./qwik.visibletaskstrategy.md) | |

## MountFn type

**Signature:**

```typescript
export type MountFn<T> = () => ValueOrPromise<T>;
```

**References:** [ValueOrPromise](./qwik.valueorpromise.md)

## NativeAnimationEvent type

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
export type NativeAnimationEvent = AnimationEvent;
```

## NativeClipboardEvent type

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
export type NativeClipboardEvent = ClipboardEvent;
```

## NativeCompositionEvent type

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
export type NativeCompositionEvent = CompositionEvent;
```

## NativeDragEvent type

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
export type NativeDragEvent = DragEvent;
```

## NativeFocusEvent type

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
export type NativeFocusEvent = FocusEvent;
```

## NativeKeyboardEvent type

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
export type NativeKeyboardEvent = KeyboardEvent;
```

## NativeMouseEvent type

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
export type NativeMouseEvent = MouseEvent;
```

## NativePointerEvent type

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
export type NativePointerEvent = PointerEvent;
```

## NativeTouchEvent type

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
export type NativeTouchEvent = TouchEvent;
```

## NativeTransitionEvent type

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
export type NativeTransitionEvent = TransitionEvent;
```

## NativeUIEvent type

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
export type NativeUIEvent = UIEvent;
```

## NativeWheelEvent type

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
export type NativeWheelEvent = WheelEvent;
```

## noSerialize variable

Marks a property on a store as non-serializable.

At times it is necessary to store values on a store that are non-serializable. Normally this is a runtime error as Store wants to eagerly report when a non-serializable property is assigned to it.

You can use `noSerialize()` to mark a value as non-serializable. The value is persisted in the Store but does not survive serialization. The implication is that when your application is resumed, the value of this object will be `undefined`<!-- -->. You will be responsible for recovering from this.

See: \[noSerialize Tutorial\](http://qwik.builder.io/tutorial/store/no-serialize)

**Signature:**

```typescript
noSerialize: <T extends object | undefined>(input: T) => NoSerialize<T>;
```

## OnRenderFn type

**Signature:**

```typescript
export type OnRenderFn<PROPS> = (props: PROPS) => JSXNode<any> | null;
```

**References:** [JSXNode](./qwik.jsxnode.md)

## OnVisibleTaskOptions.eagerness property

> Warning: This API is now obsolete.
>
> Use `strategy` instead.

**Signature:**

```typescript
eagerness?: EagernessOptions;
```

## OnVisibleTaskOptions interface

**Signature:**

```typescript
export interface OnVisibleTaskOptions
```

## Properties

| Property                                               | Modifiers | Type                                                 | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------ | --------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [eagerness?](./qwik.onvisibletaskoptions.eagerness.md) |           | [EagernessOptions](./qwik.eagernessoptions.md)       | _(Optional)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| [strategy?](./qwik.onvisibletaskoptions.strategy.md)   |           | [VisibleTaskStrategy](./qwik.visibletaskstrategy.md) | <p>_(Optional)_ The strategy to use to determine when the "VisibleTask" should first execute.</p><p>- <code>intersection-observer</code>: the task will first execute when the element is visible in the viewport, under the hood it uses the IntersectionObserver API. - <code>document-ready</code>: the task will first execute when the document is ready, under the hood it uses the document <code>load</code> event. - <code>document-idle</code>: the task will first execute when the document is idle, under the hood it uses the requestIdleCallback API.</p> |

## OnVisibleTaskOptions.strategy property

The strategy to use to determine when the "VisibleTask" should first execute.

- `intersection-observer`<!-- -->: the task will first execute when the element is visible in the viewport, under the hood it uses the IntersectionObserver API. - `document-ready`<!-- -->: the task will first execute when the document is ready, under the hood it uses the document `load` event. - `document-idle`<!-- -->: the task will first execute when the document is idle, under the hood it uses the requestIdleCallback API.

**Signature:**

```typescript
strategy?: VisibleTaskStrategy;
```

## PropFnInterface interface

**Signature:**

```typescript
export interface PropFnInterface<ARGS extends any[], RET>
```

## PropFunction type

**Signature:**

```typescript
export type PropFunction<T extends Function> = T extends (
  ...args: infer ARGS
) => infer RET
  ? PropFnInterface<ARGS, RET>
  : never;
```

**References:** [PropFnInterface](./qwik.propfninterface.md)

## PropsOf type

Infers `Props` from the component.

```typescript
export const OtherComponent = component$(() => {
  return $(() => <Counter value={100} />);
});
```

**Signature:**

```typescript
export type PropsOf<COMP extends Component<any>> = COMP extends Component<
  infer PROPS
>
  ? NonNullable<PROPS>
  : never;
```

**References:** [Component](./qwik.component.md)

## PublicProps type

Extends the defined component PROPS, adding the default ones (children and q:slot)..

**Signature:**

```typescript
export type PublicProps<PROPS extends {}> = TransformProps<PROPS> &
  ComponentBaseProps &
  ComponentChildren<PROPS>;
```

**References:** [ComponentBaseProps](./qwik.componentbaseprops.md)

## QRL.\_\_brand\_\_QRL\_\_ property

**Signature:**

```typescript
__brand__QRL__: TYPE;
```

## QRL.dev property

**Signature:**

```typescript
dev: QRLDev | null;
```

## QRL.getCaptured() method

**Signature:**

```typescript
getCaptured(): any[] | null;
```

**Returns:**

any\[\] \| null

## QRL.getHash() method

**Signature:**

```typescript
getHash(): string;
```

**Returns:**

string

## QRL.getSymbol() method

**Signature:**

```typescript
getSymbol(): string;
```

**Returns:**

string

## QRL interface

The `QRL` type represents a lazy-loadable AND serializable resource.

QRL stands for Qwik URL.

Use `QRL` when you want to refer to a lazy-loaded resource. `QRL`<!-- -->s are most often used for code (functions) but can also be used for other resources such as `string`<!-- -->s in the case of styles.

`QRL` is an opaque token that is generated by the Qwik Optimizer. (Do not rely on any properties in `QRL` as it may change between versions.)

\#\# Creating `QRL` references

Creating `QRL` is done using `$(...)` function. `$(...)` is a special marker for the Qwik Optimizer that marks that the code should be extracted into a lazy-loaded symbol.

```tsx
useOnDocument(
  "mousemove",
  $((event) => console.log("mousemove", event))
);
```

In the above code, the Qwik Optimizer detects `$(...)` and transforms the code as shown below:

```tsx
// FILE: <current file>
useOnDocument("mousemove", qrl("./chunk-abc.js", "onMousemove"));

// FILE: chunk-abc.js
export const onMousemove = () => console.log("mousemove");
```

NOTE: `qrl(...)` is a result of Qwik Optimizer transformation. You should never have to invoke this function directly in your application. The `qrl(...)` function should be invoked only after the Qwik Optimizer transformation.

\#\# Using `QRL`<!-- -->s

Use `QRL` type in your application when you want to get a lazy-loadable reference to a resource (most likely a function).

```tsx
// Example of declaring a custom functions which takes callback as QRL.
export function useMyFunction(callback: QRL<() => void>) {
  doExtraStuff();
  // The callback passed to `onDocument` requires `QRL`.
  useOnDocument("mousemove", callback);
}
```

In the above example, the way to think about the code is that you are not asking for a callback function but rather a reference to a lazy-loadable callback function. Specifically, the function loading should be delayed until it is actually needed. In the above example, the function would not load until after a `mousemove` event on `document` fires.

\#\# Resolving `QRL` references

At times it may be necessary to resolve a `QRL` reference to the actual value. This can be performed using `QRL.resolve(..)` function.

```tsx
// Assume you have QRL reference to a greet function
const lazyGreet: QRL<() => void> = $(() => console.log("Hello World!"));

// Use `qrlImport` to load / resolve the reference.
const greet: () => void = await lazyGreet.resolve();

//  Invoke it
greet();
```

NOTE: `element` is needed because `QRL`<!-- -->s are relative and need a base location to resolve against. The base location is encoded in the HTML in the form of `<div q:base="/url">`<!-- -->.

\#\# Question: Why not just use `import()`<!-- -->?

At first glance, `QRL` serves the same purpose as `import()`<!-- -->. However, there are three subtle differences that need to be taken into account.

1. `QRL`<!-- -->s must be serializable into HTML. 2. `QRL`<!-- -->s must be resolved by framework relative to `q:base`<!-- -->. 3. `QRL`<!-- -->s must be able to capture lexically scoped variables. 4. `QRL`<!-- -->s encapsulate the difference between running with and without Qwik Optimizer. 5. `QRL`<!-- -->s allow expressing lazy-loaded boundaries without thinking about chunk and symbol names.

Let's assume that you intend to write code such as this:

```typescript
return <button onClick={() => (await import('./chunk-abc.js')).onClick}>
```

The above code needs to be serialized into DOM such as:

```
<div q:base="/build/">
  <button on:click="./chunk-abc.js#onClick">...</button>
</div>
```

1. Notice there is no easy way to extract chunk (`./chunk-abc.js`<!-- -->) and symbol (`onClick`<!-- -->) into HTML. 2. Notice that even if you could extract it, the `import('./chunk-abc.js')` would become relative to where the `import()` file is declared. Because it is our framework doing the load, the `./chunk-abc.js` would become relative to the framework file. This is not correct, as it should be relative to the original file generated by the bundler. 3. Next, the framework needs to resolve the `./chunk-abc.js` and needs a base location that is encoded in the HTML. 4. The QRL needs to be able to capture lexically scoped variables. (`import()` only allows loading top-level symbols which don't capture variables.) 5. As a developer, you don't want to think about `import` and naming the chunks and symbols. You just want to say: "this should be lazy."

These are the main reasons why Qwik introduces its own concept of `QRL`<!-- -->.

**Signature:**

```typescript
export interface QRL<TYPE = any>
```

## Properties

| Property                                             | Modifiers | Type           | Description |
| ---------------------------------------------------- | --------- | -------------- | ----------- |
| [\_\_brand\_\_QRL\_\_](./qwik.qrl.__brand__qrl__.md) |           | TYPE           |             |
| [dev](./qwik.qrl.dev.md)                             |           | QRLDev \| null |             |

## Methods

| Method                                     | Description                                  |
| ------------------------------------------ | -------------------------------------------- |
| [getCaptured()](./qwik.qrl.getcaptured.md) |                                              |
| [getHash()](./qwik.qrl.gethash.md)         |                                              |
| [getSymbol()](./qwik.qrl.getsymbol.md)     |                                              |
| [resolve()](./qwik.qrl.resolve.md)         | Resolve the QRL and return the actual value. |

## QRL.resolve() method

Resolve the QRL and return the actual value.

**Signature:**

```typescript
resolve(): Promise<TYPE>;
```

**Returns:**

Promise&lt;TYPE&gt;

## QwikAnimationEvent.animationName property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
animationName: string;
```

## QwikAnimationEvent.elapsedTime property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
elapsedTime: number;
```

## QwikAnimationEvent interface

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
export interface QwikAnimationEvent<T = Element> extends SyntheticEvent<T, NativeAnimationEvent>
```

**Extends:** SyntheticEvent&lt;T, [NativeAnimationEvent](./qwik.nativeanimationevent.md)<!-- -->&gt;

## Properties

| Property                                                    | Modifiers | Type   | Description  |
| ----------------------------------------------------------- | --------- | ------ | ------------ |
| [animationName](./qwik.qwikanimationevent.animationname.md) |           | string | **_(BETA)_** |
| [elapsedTime](./qwik.qwikanimationevent.elapsedtime.md)     |           | number | **_(BETA)_** |
| [pseudoElement](./qwik.qwikanimationevent.pseudoelement.md) |           | string | **_(BETA)_** |

## QwikAnimationEvent.pseudoElement property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
pseudoElement: string;
```

## QwikChangeEvent interface

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
export interface QwikChangeEvent<T = Element> extends SyntheticEvent<T>
```

**Extends:** SyntheticEvent&lt;T&gt;

## Properties

| Property                                   | Modifiers | Type                | Description  |
| ------------------------------------------ | --------- | ------------------- | ------------ |
| [target](./qwik.qwikchangeevent.target.md) |           | EventTarget &amp; T | **_(BETA)_** |

## QwikChangeEvent.target property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
target: EventTarget & T;
```

## QwikClipboardEvent.clipboardData property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
clipboardData: DataTransfer;
```

## QwikClipboardEvent interface

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
export interface QwikClipboardEvent<T = Element> extends SyntheticEvent<T, NativeClipboardEvent>
```

**Extends:** SyntheticEvent&lt;T, [NativeClipboardEvent](./qwik.nativeclipboardevent.md)<!-- -->&gt;

## Properties

| Property                                                    | Modifiers | Type         | Description  |
| ----------------------------------------------------------- | --------- | ------------ | ------------ |
| [clipboardData](./qwik.qwikclipboardevent.clipboarddata.md) |           | DataTransfer | **_(BETA)_** |

## QwikCompositionEvent.data property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
data: string;
```

## QwikCompositionEvent interface

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
export interface QwikCompositionEvent<T = Element> extends SyntheticEvent<T, NativeCompositionEvent>
```

**Extends:** SyntheticEvent&lt;T, [NativeCompositionEvent](./qwik.nativecompositionevent.md)<!-- -->&gt;

## Properties

| Property                                    | Modifiers | Type   | Description  |
| ------------------------------------------- | --------- | ------ | ------------ |
| [data](./qwik.qwikcompositionevent.data.md) |           | string | **_(BETA)_** |

## QwikDOMAttributes interface

**Signature:**

```typescript
export interface QwikDOMAttributes extends DOMAttributes<any>
```

**Extends:** [DOMAttributes](./qwik.domattributes.md)<!-- -->&lt;any&gt;

## QwikDragEvent.dataTransfer property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
dataTransfer: DataTransfer;
```

## QwikDragEvent interface

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
export interface QwikDragEvent<T = Element> extends QwikMouseEvent<T, NativeDragEvent>
```

**Extends:** [QwikMouseEvent](./qwik.qwikmouseevent.md)<!-- -->&lt;T, [NativeDragEvent](./qwik.nativedragevent.md)<!-- -->&gt;

## Properties

| Property                                             | Modifiers | Type         | Description  |
| ---------------------------------------------------- | --------- | ------------ | ------------ |
| [dataTransfer](./qwik.qwikdragevent.datatransfer.md) |           | DataTransfer | **_(BETA)_** |

## QwikFocusEvent interface

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
export interface QwikFocusEvent<T = Element> extends SyntheticEvent<T, NativeFocusEvent>
```

**Extends:** SyntheticEvent&lt;T, [NativeFocusEvent](./qwik.nativefocusevent.md)<!-- -->&gt;

## Properties

| Property                                                | Modifiers | Type                | Description  |
| ------------------------------------------------------- | --------- | ------------------- | ------------ |
| [relatedTarget](./qwik.qwikfocusevent.relatedtarget.md) |           | EventTarget \| null | **_(BETA)_** |
| [target](./qwik.qwikfocusevent.target.md)               |           | EventTarget &amp; T | **_(BETA)_** |

## QwikFocusEvent.relatedTarget property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
relatedTarget: EventTarget | null;
```

## QwikFocusEvent.target property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
target: EventTarget & T;
```

## QwikIntrinsicElements interface

**Signature:**

```typescript
export interface QwikIntrinsicElements extends IntrinsicHTMLElements
```

**Extends:** IntrinsicHTMLElements

## Properties

| Property                                         | Modifiers | Type                                              | Description |
| ------------------------------------------------ | --------- | ------------------------------------------------- | ----------- |
| [script](./qwik.qwikintrinsicelements.script.md) |           | QwikScriptHTMLAttributes&lt;HTMLScriptElement&gt; |             |

## QwikIntrinsicElements.script property

**Signature:**

```typescript
script: QwikScriptHTMLAttributes<HTMLScriptElement>;
```

## QwikInvalidEvent interface

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
export interface QwikInvalidEvent<T = Element> extends SyntheticEvent<T>
```

**Extends:** SyntheticEvent&lt;T&gt;

## Properties

| Property                                    | Modifiers | Type                | Description  |
| ------------------------------------------- | --------- | ------------------- | ------------ |
| [target](./qwik.qwikinvalidevent.target.md) |           | EventTarget &amp; T | **_(BETA)_** |

## QwikInvalidEvent.target property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
target: EventTarget & T;
```

## QwikJSX.Element interface

**Signature:**

```typescript
interface Element extends JSXNode
```

**Extends:** [JSXNode](./qwik.jsxnode.md)

## QwikJSX.ElementChildrenAttribute.children property

**Signature:**

```typescript
children: any;
```

## QwikJSX.ElementChildrenAttribute interface

**Signature:**

```typescript
interface ElementChildrenAttribute
```

## Properties

| Property                                                        | Modifiers | Type | Description |
| --------------------------------------------------------------- | --------- | ---- | ----------- |
| [children](./qwik.qwikjsx.elementchildrenattribute.children.md) |           | any  |             |

## QwikJSX.IntrinsicAttributes interface

**Signature:**

```typescript
interface IntrinsicAttributes extends QwikIntrinsicAttributes
```

**Extends:** QwikIntrinsicAttributes

## QwikJSX.IntrinsicElements interface

**Signature:**

```typescript
interface IntrinsicElements extends QwikIntrinsicElements
```

**Extends:** [QwikIntrinsicElements](./qwik.qwikintrinsicelements.md)

## QwikJSX namespace

**Signature:**

```typescript
export declare namespace QwikJSX
```

## Interfaces

| Interface                                                              | Description |
| ---------------------------------------------------------------------- | ----------- |
| [Element](./qwik.qwikjsx.element.md)                                   |             |
| [ElementChildrenAttribute](./qwik.qwikjsx.elementchildrenattribute.md) |             |
| [IntrinsicAttributes](./qwik.qwikjsx.intrinsicattributes.md)           |             |
| [IntrinsicElements](./qwik.qwikjsx.intrinsicelements.md)               |             |

## QwikKeyboardEvent.altKey property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
altKey: boolean;
```

## QwikKeyboardEvent.charCode property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
charCode: number;
```

## QwikKeyboardEvent.ctrlKey property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
ctrlKey: boolean;
```

## QwikKeyboardEvent.getModifierState() method

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

See \[DOM Level 3 Events spec\](https://www.w3.org/TR/uievents-key/\#keys-modifier). for a list of valid (case-sensitive) arguments to this method.

**Signature:**

```typescript
getModifierState(key: string): boolean;
```

## Parameters

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| key       | string |             |

**Returns:**

boolean

## QwikKeyboardEvent.key property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

See the \[DOM Level 3 Events spec\](https://www.w3.org/TR/uievents-key/\#named-key-attribute-values). for possible values

**Signature:**

```typescript
key: string;
```

## QwikKeyboardEvent.keyCode property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
keyCode: number;
```

## QwikKeyboardEvent.locale property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
locale: string;
```

## QwikKeyboardEvent.location property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
location: number;
```

## QwikKeyboardEvent interface

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
export interface QwikKeyboardEvent<T = Element> extends SyntheticEvent<T, NativeKeyboardEvent>
```

**Extends:** SyntheticEvent&lt;T, [NativeKeyboardEvent](./qwik.nativekeyboardevent.md)<!-- -->&gt;

## Properties

| Property                                         | Modifiers | Type    | Description                                                                                                                            |
| ------------------------------------------------ | --------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| [altKey](./qwik.qwikkeyboardevent.altkey.md)     |           | boolean | **_(BETA)_**                                                                                                                           |
| [charCode](./qwik.qwikkeyboardevent.charcode.md) |           | number  | **_(BETA)_**                                                                                                                           |
| [ctrlKey](./qwik.qwikkeyboardevent.ctrlkey.md)   |           | boolean | **_(BETA)_**                                                                                                                           |
| [key](./qwik.qwikkeyboardevent.key.md)           |           | string  | **_(BETA)_** See the \[DOM Level 3 Events spec\](https://www.w3.org/TR/uievents-key/\#named-key-attribute-values). for possible values |
| [keyCode](./qwik.qwikkeyboardevent.keycode.md)   |           | number  | **_(BETA)_**                                                                                                                           |
| [locale](./qwik.qwikkeyboardevent.locale.md)     |           | string  | **_(BETA)_**                                                                                                                           |
| [location](./qwik.qwikkeyboardevent.location.md) |           | number  | **_(BETA)_**                                                                                                                           |
| [metaKey](./qwik.qwikkeyboardevent.metakey.md)   |           | boolean | **_(BETA)_**                                                                                                                           |
| [repeat](./qwik.qwikkeyboardevent.repeat.md)     |           | boolean | **_(BETA)_**                                                                                                                           |
| [shiftKey](./qwik.qwikkeyboardevent.shiftkey.md) |           | boolean | **_(BETA)_**                                                                                                                           |
| [which](./qwik.qwikkeyboardevent.which.md)       |           | number  | **_(BETA)_**                                                                                                                           |

## Methods

| Method                                                                | Description                                                                                                                                                      |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [getModifierState(key)](./qwik.qwikkeyboardevent.getmodifierstate.md) | **_(BETA)_** See \[DOM Level 3 Events spec\](https://www.w3.org/TR/uievents-key/\#keys-modifier). for a list of valid (case-sensitive) arguments to this method. |

## QwikKeyboardEvent.metaKey property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
metaKey: boolean;
```

## QwikKeyboardEvent.repeat property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
repeat: boolean;
```

## QwikKeyboardEvent.shiftKey property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
shiftKey: boolean;
```

## QwikKeyboardEvent.which property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
which: number;
```

## QwikMouseEvent.altKey property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
altKey: boolean;
```

## QwikMouseEvent.button property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
button: number;
```

## QwikMouseEvent.buttons property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
buttons: number;
```

## QwikMouseEvent.clientX property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
clientX: number;
```

## QwikMouseEvent.clientY property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
clientY: number;
```

## QwikMouseEvent.ctrlKey property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
ctrlKey: boolean;
```

## QwikMouseEvent.getModifierState() method

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

See \[DOM Level 3 Events spec\](https://www.w3.org/TR/uievents-key/\#keys-modifier). for a list of valid (case-sensitive) arguments to this method.

**Signature:**

```typescript
getModifierState(key: string): boolean;
```

## Parameters

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| key       | string |             |

**Returns:**

boolean

## QwikMouseEvent interface

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
export interface QwikMouseEvent<T = Element, E = NativeMouseEvent> extends SyntheticEvent<T, E>
```

**Extends:** SyntheticEvent&lt;T, E&gt;

## Properties

| Property                                                | Modifiers | Type                | Description  |
| ------------------------------------------------------- | --------- | ------------------- | ------------ |
| [altKey](./qwik.qwikmouseevent.altkey.md)               |           | boolean             | **_(BETA)_** |
| [button](./qwik.qwikmouseevent.button.md)               |           | number              | **_(BETA)_** |
| [buttons](./qwik.qwikmouseevent.buttons.md)             |           | number              | **_(BETA)_** |
| [clientX](./qwik.qwikmouseevent.clientx.md)             |           | number              | **_(BETA)_** |
| [clientY](./qwik.qwikmouseevent.clienty.md)             |           | number              | **_(BETA)_** |
| [ctrlKey](./qwik.qwikmouseevent.ctrlkey.md)             |           | boolean             | **_(BETA)_** |
| [metaKey](./qwik.qwikmouseevent.metakey.md)             |           | boolean             | **_(BETA)_** |
| [movementX](./qwik.qwikmouseevent.movementx.md)         |           | number              | **_(BETA)_** |
| [movementY](./qwik.qwikmouseevent.movementy.md)         |           | number              | **_(BETA)_** |
| [pageX](./qwik.qwikmouseevent.pagex.md)                 |           | number              | **_(BETA)_** |
| [pageY](./qwik.qwikmouseevent.pagey.md)                 |           | number              | **_(BETA)_** |
| [relatedTarget](./qwik.qwikmouseevent.relatedtarget.md) |           | EventTarget \| null | **_(BETA)_** |
| [screenX](./qwik.qwikmouseevent.screenx.md)             |           | number              | **_(BETA)_** |
| [screenY](./qwik.qwikmouseevent.screeny.md)             |           | number              | **_(BETA)_** |
| [shiftKey](./qwik.qwikmouseevent.shiftkey.md)           |           | boolean             | **_(BETA)_** |
| [x](./qwik.qwikmouseevent.x.md)                         |           | number              | **_(BETA)_** |
| [y](./qwik.qwikmouseevent.y.md)                         |           | number              | **_(BETA)_** |

## Methods

| Method                                                             | Description                                                                                                                                                      |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [getModifierState(key)](./qwik.qwikmouseevent.getmodifierstate.md) | **_(BETA)_** See \[DOM Level 3 Events spec\](https://www.w3.org/TR/uievents-key/\#keys-modifier). for a list of valid (case-sensitive) arguments to this method. |

## QwikMouseEvent.metaKey property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
metaKey: boolean;
```

## QwikMouseEvent.movementX property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
movementX: number;
```

## QwikMouseEvent.movementY property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
movementY: number;
```

## QwikMouseEvent.pageX property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
pageX: number;
```

## QwikMouseEvent.pageY property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
pageY: number;
```

## QwikMouseEvent.relatedTarget property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
relatedTarget: EventTarget | null;
```

## QwikMouseEvent.screenX property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
screenX: number;
```

## QwikMouseEvent.screenY property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
screenY: number;
```

## QwikMouseEvent.shiftKey property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
shiftKey: boolean;
```

## QwikMouseEvent.x property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
x: number;
```

## QwikMouseEvent.y property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
y: number;
```

## QwikPointerEvent.height property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
height: number;
```

## QwikPointerEvent.isPrimary property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
isPrimary: boolean;
```

## QwikPointerEvent interface

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
export interface QwikPointerEvent<T = Element> extends QwikMouseEvent<T, NativePointerEvent>
```

**Extends:** [QwikMouseEvent](./qwik.qwikmouseevent.md)<!-- -->&lt;T, [NativePointerEvent](./qwik.nativepointerevent.md)<!-- -->&gt;

## Properties

| Property                                              | Modifiers | Type                        | Description  |
| ----------------------------------------------------- | --------- | --------------------------- | ------------ |
| [height](./qwik.qwikpointerevent.height.md)           |           | number                      | **_(BETA)_** |
| [isPrimary](./qwik.qwikpointerevent.isprimary.md)     |           | boolean                     | **_(BETA)_** |
| [pointerId](./qwik.qwikpointerevent.pointerid.md)     |           | number                      | **_(BETA)_** |
| [pointerType](./qwik.qwikpointerevent.pointertype.md) |           | 'mouse' \| 'pen' \| 'touch' | **_(BETA)_** |
| [pressure](./qwik.qwikpointerevent.pressure.md)       |           | number                      | **_(BETA)_** |
| [tiltX](./qwik.qwikpointerevent.tiltx.md)             |           | number                      | **_(BETA)_** |
| [tiltY](./qwik.qwikpointerevent.tilty.md)             |           | number                      | **_(BETA)_** |
| [width](./qwik.qwikpointerevent.width.md)             |           | number                      | **_(BETA)_** |

## QwikPointerEvent.pointerId property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
pointerId: number;
```

## QwikPointerEvent.pointerType property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
pointerType: "mouse" | "pen" | "touch";
```

## QwikPointerEvent.pressure property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
pressure: number;
```

## QwikPointerEvent.tiltX property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
tiltX: number;
```

## QwikPointerEvent.tiltY property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
tiltY: number;
```

## QwikPointerEvent.width property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
width: number;
```

## QwikSubmitEvent interface

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
export interface QwikSubmitEvent<T = Element> extends SyntheticEvent<T>
```

**Extends:** SyntheticEvent&lt;T&gt;

## QwikTouchEvent.altKey property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
altKey: boolean;
```

## QwikTouchEvent.changedTouches property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
changedTouches: TouchList;
```

## QwikTouchEvent.ctrlKey property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
ctrlKey: boolean;
```

## QwikTouchEvent.getModifierState() method

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

See \[DOM Level 3 Events spec\](https://www.w3.org/TR/uievents-key/\#keys-modifier). for a list of valid (case-sensitive) arguments to this method.

**Signature:**

```typescript
getModifierState(key: string): boolean;
```

## Parameters

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| key       | string |             |

**Returns:**

boolean

## QwikTouchEvent interface

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
export interface QwikTouchEvent<T = Element> extends SyntheticEvent<T, NativeTouchEvent>
```

**Extends:** SyntheticEvent&lt;T, [NativeTouchEvent](./qwik.nativetouchevent.md)<!-- -->&gt;

## Properties

| Property                                                  | Modifiers | Type      | Description  |
| --------------------------------------------------------- | --------- | --------- | ------------ |
| [altKey](./qwik.qwiktouchevent.altkey.md)                 |           | boolean   | **_(BETA)_** |
| [changedTouches](./qwik.qwiktouchevent.changedtouches.md) |           | TouchList | **_(BETA)_** |
| [ctrlKey](./qwik.qwiktouchevent.ctrlkey.md)               |           | boolean   | **_(BETA)_** |
| [metaKey](./qwik.qwiktouchevent.metakey.md)               |           | boolean   | **_(BETA)_** |
| [shiftKey](./qwik.qwiktouchevent.shiftkey.md)             |           | boolean   | **_(BETA)_** |
| [targetTouches](./qwik.qwiktouchevent.targettouches.md)   |           | TouchList | **_(BETA)_** |
| [touches](./qwik.qwiktouchevent.touches.md)               |           | TouchList | **_(BETA)_** |

## Methods

| Method                                                             | Description                                                                                                                                                      |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [getModifierState(key)](./qwik.qwiktouchevent.getmodifierstate.md) | **_(BETA)_** See \[DOM Level 3 Events spec\](https://www.w3.org/TR/uievents-key/\#keys-modifier). for a list of valid (case-sensitive) arguments to this method. |

## QwikTouchEvent.metaKey property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
metaKey: boolean;
```

## QwikTouchEvent.shiftKey property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
shiftKey: boolean;
```

## QwikTouchEvent.targetTouches property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
targetTouches: TouchList;
```

## QwikTouchEvent.touches property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
touches: TouchList;
```

## QwikTransitionEvent.elapsedTime property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
elapsedTime: number;
```

## QwikTransitionEvent interface

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
export interface QwikTransitionEvent<T = Element> extends SyntheticEvent<T, NativeTransitionEvent>
```

**Extends:** SyntheticEvent&lt;T, [NativeTransitionEvent](./qwik.nativetransitionevent.md)<!-- -->&gt;

## Properties

| Property                                                     | Modifiers | Type   | Description  |
| ------------------------------------------------------------ | --------- | ------ | ------------ |
| [elapsedTime](./qwik.qwiktransitionevent.elapsedtime.md)     |           | number | **_(BETA)_** |
| [propertyName](./qwik.qwiktransitionevent.propertyname.md)   |           | string | **_(BETA)_** |
| [pseudoElement](./qwik.qwiktransitionevent.pseudoelement.md) |           | string | **_(BETA)_** |

## QwikTransitionEvent.propertyName property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
propertyName: string;
```

## QwikTransitionEvent.pseudoElement property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
pseudoElement: string;
```

## QwikUIEvent.detail property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
detail: number;
```

## QwikUIEvent interface

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
export interface QwikUIEvent<T = Element> extends SyntheticEvent<T, NativeUIEvent>
```

**Extends:** SyntheticEvent&lt;T, [NativeUIEvent](./qwik.nativeuievent.md)<!-- -->&gt;

## Properties

| Property                               | Modifiers | Type         | Description  |
| -------------------------------------- | --------- | ------------ | ------------ |
| [detail](./qwik.qwikuievent.detail.md) |           | number       | **_(BETA)_** |
| [view](./qwik.qwikuievent.view.md)     |           | AbstractView | **_(BETA)_** |

## QwikUIEvent.view property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
view: AbstractView;
```

## QwikWheelEvent.deltaMode property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
deltaMode: number;
```

## QwikWheelEvent.deltaX property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
deltaX: number;
```

## QwikWheelEvent.deltaY property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
deltaY: number;
```

## QwikWheelEvent.deltaZ property

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
deltaZ: number;
```

## QwikWheelEvent interface

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

**Signature:**

```typescript
export interface QwikWheelEvent<T = Element> extends QwikMouseEvent<T, NativeWheelEvent>
```

**Extends:** [QwikMouseEvent](./qwik.qwikmouseevent.md)<!-- -->&lt;T, [NativeWheelEvent](./qwik.nativewheelevent.md)<!-- -->&gt;

## Properties

| Property                                        | Modifiers | Type   | Description  |
| ----------------------------------------------- | --------- | ------ | ------------ |
| [deltaMode](./qwik.qwikwheelevent.deltamode.md) |           | number | **_(BETA)_** |
| [deltaX](./qwik.qwikwheelevent.deltax.md)       |           | number | **_(BETA)_** |
| [deltaY](./qwik.qwikwheelevent.deltay.md)       |           | number | **_(BETA)_** |
| [deltaZ](./qwik.qwikwheelevent.deltaz.md)       |           | number | **_(BETA)_** |

## Resource variable

This method works like an async memoized function that runs whenever some tracked value changes and returns some data.

`useResource` however returns immediate a `ResourceReturn` object that contains the data and a state that indicates if the data is available or not.

The status can be one of the following:

- 'pending' - the data is not yet available. - 'resolved' - the data is available. - 'rejected' - the data is not available due to an error or timeout.

\#\#\# Example

Example showing how `useResource` to perform a fetch to request the weather, whenever the input city name changes.

```tsx
const Cmp = component$(() => {
  const store = useStore({
    city: "",
  });

  const weatherResource = useResource$<any>(async ({ track, cleanup }) => {
    const cityName = track(() => store.city);
    const abortController = new AbortController();
    cleanup(() => abortController.abort("cleanup"));
    const res = await fetch(`http://weatherdata.com?city=${cityName}`, {
      signal: abortController.signal,
    });
    const data = res.json();
    return data;
  });

  return (
    <div>
      <input
        name="city"
        onInput$={(ev: any) => (store.city = ev.target.value)}
      />
      <Resource
        value={weatherResource}
        onResolved={(weather) => {
          return <div>Temperature: {weather.temp}</div>;
        }}
      />
    </div>
  );
});
```

**Signature:**

```typescript
Resource: <T>(props: ResourceProps<T>) => JSXNode;
```

## ResourceCtx.cache() method

**Signature:**

```typescript
cache(policyOrMilliseconds: number | 'immutable'): void;
```

## Parameters

| Parameter            | Type                  | Description |
| -------------------- | --------------------- | ----------- |
| policyOrMilliseconds | number \| 'immutable' |             |

**Returns:**

void

## ResourceCtx.cleanup() method

**Signature:**

```typescript
cleanup(callback: () => void): void;
```

## Parameters

| Parameter | Type          | Description |
| --------- | ------------- | ----------- |
| callback  | () =&gt; void |             |

**Returns:**

void

## ResourceCtx interface

**Signature:**

```typescript
export interface ResourceCtx<T>
```

## Properties

| Property                                   | Modifiers | Type                         | Description |
| ------------------------------------------ | --------- | ---------------------------- | ----------- |
| [previous](./qwik.resourcectx.previous.md) |           | T \| undefined               |             |
| [track](./qwik.resourcectx.track.md)       |           | [Tracker](./qwik.tracker.md) |             |

## Methods

| Method                                                     | Description |
| ---------------------------------------------------------- | ----------- |
| [cache(policyOrMilliseconds)](./qwik.resourcectx.cache.md) |             |
| [cleanup(callback)](./qwik.resourcectx.cleanup.md)         |             |

## ResourceCtx.previous property

**Signature:**

```typescript
previous: T | undefined;
```

## ResourceCtx.track property

**Signature:**

```typescript
track: Tracker;
```

## ResourceFn type

**Signature:**

```typescript
export type ResourceFn<T> = (ctx: ResourceCtx<T>) => ValueOrPromise<T>;
```

**References:** [ResourceCtx](./qwik.resourcectx.md)<!-- -->, [ValueOrPromise](./qwik.valueorpromise.md)

## ResourceOptions interface

Options to pass to `useResource$()`

**Signature:**

```typescript
export interface ResourceOptions
```

## Properties

| Property                                      | Modifiers | Type   | Description                                                                                                                                         |
| --------------------------------------------- | --------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| [timeout?](./qwik.resourceoptions.timeout.md) |           | number | _(Optional)_ Timeout in milliseconds. If the resource takes more than the specified millisecond, it will timeout. Resulting on a rejected resource. |

## ResourceOptions.timeout property

Timeout in milliseconds. If the resource takes more than the specified millisecond, it will timeout. Resulting on a rejected resource.

**Signature:**

```typescript
timeout?: number;
```

## ResourcePending.loading property

**Signature:**

```typescript
readonly loading: boolean;
```

## ResourcePending interface

**Signature:**

```typescript
export interface ResourcePending<T>
```

## Properties

| Property                                     | Modifiers             | Type             | Description |
| -------------------------------------------- | --------------------- | ---------------- | ----------- |
| [loading](./qwik.resourcepending.loading.md) | <code>readonly</code> | boolean          |             |
| [value](./qwik.resourcepending.value.md)     | <code>readonly</code> | Promise&lt;T&gt; |             |

## ResourcePending.value property

**Signature:**

```typescript
readonly value: Promise<T>;
```

## ResourceProps interface

**Signature:**

```typescript
export interface ResourceProps<T>
```

## Properties

| Property                                          | Modifiers             | Type                                                                                                                   | Description  |
| ------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------ |
| [onPending?](./qwik.resourceprops.onpending.md)   |                       | () =&gt; [JSXNode](./qwik.jsxnode.md)                                                                                  | _(Optional)_ |
| [onRejected?](./qwik.resourceprops.onrejected.md) |                       | (reason: any) =&gt; [JSXNode](./qwik.jsxnode.md)                                                                       | _(Optional)_ |
| [onResolved](./qwik.resourceprops.onresolved.md)  |                       | (value: T) =&gt; [JSXNode](./qwik.jsxnode.md)                                                                          |              |
| [value](./qwik.resourceprops.value.md)            | <code>readonly</code> | [ResourceReturn](./qwik.resourcereturn.md)<!-- -->&lt;T&gt; \| Signal&lt;Promise&lt;T&gt; \| T&gt; \| Promise&lt;T&gt; |              |

## ResourceProps.onPending property

**Signature:**

```typescript
onPending?: () => JSXNode;
```

## ResourceProps.onRejected property

**Signature:**

```typescript
onRejected?: (reason: any) => JSXNode;
```

## ResourceProps.onResolved property

**Signature:**

```typescript
onResolved: (value: T) => JSXNode;
```

## ResourceProps.value property

**Signature:**

```typescript
readonly value: ResourceReturn<T> | Signal<Promise<T> | T> | Promise<T>;
```

## ResourceRejected.loading property

**Signature:**

```typescript
readonly loading: boolean;
```

## ResourceRejected interface

**Signature:**

```typescript
export interface ResourceRejected<T>
```

## Properties

| Property                                      | Modifiers             | Type             | Description |
| --------------------------------------------- | --------------------- | ---------------- | ----------- |
| [loading](./qwik.resourcerejected.loading.md) | <code>readonly</code> | boolean          |             |
| [value](./qwik.resourcerejected.value.md)     | <code>readonly</code> | Promise&lt;T&gt; |             |

## ResourceRejected.value property

**Signature:**

```typescript
readonly value: Promise<T>;
```

## ResourceResolved.loading property

**Signature:**

```typescript
readonly loading: boolean;
```

## ResourceResolved interface

**Signature:**

```typescript
export interface ResourceResolved<T>
```

## Properties

| Property                                      | Modifiers             | Type             | Description |
| --------------------------------------------- | --------------------- | ---------------- | ----------- |
| [loading](./qwik.resourceresolved.loading.md) | <code>readonly</code> | boolean          |             |
| [value](./qwik.resourceresolved.value.md)     | <code>readonly</code> | Promise&lt;T&gt; |             |

## ResourceResolved.value property

**Signature:**

```typescript
readonly value: Promise<T>;
```

## ResourceReturn type

**Signature:**

```typescript
export type ResourceReturn<T> =
  | ResourcePending<T>
  | ResourceResolved<T>
  | ResourceRejected<T>;
```

**References:** [ResourcePending](./qwik.resourcepending.md)<!-- -->, [ResourceResolved](./qwik.resourceresolved.md)<!-- -->, [ResourceRejected](./qwik.resourcerejected.md)

## Slot variable

Allows to project the children of the current component. <Slot/> can only be used within the context of a component defined with `component$`<!-- -->.

**Signature:**

```typescript
Slot: FunctionComponent<{
  name?: string;
}>;
```

## TaskCtx.cleanup() method

**Signature:**

```typescript
cleanup(callback: () => void): void;
```

## Parameters

| Parameter | Type          | Description |
| --------- | ------------- | ----------- |
| callback  | () =&gt; void |             |

**Returns:**

void

## TaskCtx interface

**Signature:**

```typescript
export interface TaskCtx
```

## Properties

| Property                         | Modifiers | Type                         | Description |
| -------------------------------- | --------- | ---------------------------- | ----------- |
| [track](./qwik.taskctx.track.md) |           | [Tracker](./qwik.tracker.md) |             |

## Methods

| Method                                         | Description |
| ---------------------------------------------- | ----------- |
| [cleanup(callback)](./qwik.taskctx.cleanup.md) |             |

## TaskCtx.track property

**Signature:**

```typescript
track: Tracker;
```

## TaskFn type

**Signature:**

```typescript
export type TaskFn = (ctx: TaskCtx) => ValueOrPromise<void | (() => void)>;
```

**References:** [TaskCtx](./qwik.taskctx.md)<!-- -->, [ValueOrPromise](./qwik.valueorpromise.md)

## Tracker interface

Used to signal to Qwik which state should be watched for changes.

The `Tracker` is passed into the `taskFn` of `useTask`<!-- -->. It is intended to be used to wrap state objects in a read proxy which signals to Qwik which properties should be watched for changes. A change to any of the properties causes the `taskFn` to rerun.

\#\#\# Example

The `obs` passed into the `taskFn` is used to mark `state.count` as a property of interest. Any changes to the `state.count` property will cause the `taskFn` to rerun.

```tsx
const Cmp = component$(() => {
  const store = useStore({ count: 0, doubleCount: 0 });
  useTask$(({ track }) => {
    const count = track(() => store.count);
    store.doubleCount = 2 * count;
  });
  return (
    <div>
      <span>
        {store.count} / {store.doubleCount}
      </span>
      <button onClick$={() => store.count++}>+</button>
    </div>
  );
});
```

**Signature:**

```typescript
export interface Tracker
```

## useClientMount$ variable

> Warning: This API is now obsolete.
>
> - use `useTask$()` with `isBrowser` instead. See https://qwik.builder.io/docs/components/lifecycle/\#usemountserver

Deprecated API, equivalent of doing:

```tsx
import { useTask$ } from "@builder.io/qwik";
import { isBrowser } from "@builder.io/qwik/build";
useTask$(() => {
  if (isBrowser) {
    // only runs on server
  }
});
```

**Signature:**

```typescript
useClientMount$: <T>(first: MountFn<T>) => void
```

## useClientMountQrl variable

> Warning: This API is now obsolete.
>
> - use `useTask$()` with `isBrowser` instead. See https://qwik.builder.io/docs/components/lifecycle/\#usemountserver

Deprecated API, equivalent of doing:

```tsx
import { useTask$ } from "@builder.io/qwik";
import { isBrowser } from "@builder.io/qwik/build";
useTask$(() => {
  if (isBrowser) {
    // only runs on server
  }
});
```

**Signature:**

```typescript
useClientMountQrl: <T>(mountQrl: QRL<MountFn<T>>) => void
```

## useContext variable

Retrieve Context value.

Use `useContext()` to retrieve the value of context in a component. To retrieve a value a parent component needs to invoke `useContextProvider()` to assign a value.

\#\#\# Example

```tsx
// Declare the Context type.
interface TodosStore {
  items: string[];
}
// Create a Context ID (no data is saved here.)
// You will use this ID to both create and retrieve the Context.
export const TodosContext = createContextId<TodosStore>("Todos");

// Example of providing context to child components.
export const App = component$(() => {
  useContextProvider(
    TodosContext,
    useStore<TodosStore>({
      items: ["Learn Qwik", "Build Qwik app", "Profit"],
    })
  );

  return <Items />;
});

// Example of retrieving the context provided by a parent component.
export const Items = component$(() => {
  const todos = useContext(TodosContext);
  return (
    <ul>
      {todos.items.map((item) => (
        <li>{item}</li>
      ))}
    </ul>
  );
});
```

**Signature:**

```typescript
useContext: UseContext;
```

## useContextProvider variable

Assign a value to a Context.

Use `useContextProvider()` to assign a value to a context. The assignment happens in the component's function. Once assign use `useContext()` in any child component to retrieve the value.

Context is a way to pass stores to the child components without prop-drilling.

\#\#\# Example

```tsx
// Declare the Context type.
interface TodosStore {
  items: string[];
}
// Create a Context ID (no data is saved here.)
// You will use this ID to both create and retrieve the Context.
export const TodosContext = createContextId<TodosStore>("Todos");

// Example of providing context to child components.
export const App = component$(() => {
  useContextProvider(
    TodosContext,
    useStore<TodosStore>({
      items: ["Learn Qwik", "Build Qwik app", "Profit"],
    })
  );

  return <Items />;
});

// Example of retrieving the context provided by a parent component.
export const Items = component$(() => {
  const todos = useContext(TodosContext);
  return (
    <ul>
      {todos.items.map((item) => (
        <li>{item}</li>
      ))}
    </ul>
  );
});
```

**Signature:**

```typescript
useContextProvider: <STATE extends object>(context: ContextId<STATE>, newValue: STATE) => void
```

## useMount$ variable

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

> Warning: This API is now obsolete.
>
> - use `useTask$()` instead

**Signature:**

```typescript
useMount$: (first: import("./use-task").TaskFn, opts?: import("./use-task").UseTaskOptions | undefined) => void
```

## useMountQrl variable

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

> Warning: This API is now obsolete.
>
> - use `useTask$()` instead

**Signature:**

```typescript
useMountQrl: (qrl: QRL<import("./use-task").TaskFn>, opts?: import("./use-task").UseTaskOptions | undefined) => void
```

## useResource$ variable

This method works like an async memoized function that runs whenever some tracked value changes and returns some data.

`useResource` however returns immediate a `ResourceReturn` object that contains the data and a state that indicates if the data is available or not.

The status can be one of the following:

- 'pending' - the data is not yet available. - 'resolved' - the data is available. - 'rejected' - the data is not available due to an error or timeout.

\#\#\# Example

Example showing how `useResource` to perform a fetch to request the weather, whenever the input city name changes.

```tsx
const Cmp = component$(() => {
  const store = useStore({
    city: "",
  });

  const weatherResource = useResource$<any>(async ({ track, cleanup }) => {
    const cityName = track(() => store.city);
    const abortController = new AbortController();
    cleanup(() => abortController.abort("cleanup"));
    const res = await fetch(`http://weatherdata.com?city=${cityName}`, {
      signal: abortController.signal,
    });
    const data = res.json();
    return data;
  });

  return (
    <div>
      <input
        name="city"
        onInput$={(ev: any) => (store.city = ev.target.value)}
      />
      <Resource
        value={weatherResource}
        onResolved={(weather) => {
          return <div>Temperature: {weather.temp}</div>;
        }}
      />
    </div>
  );
});
```

**Signature:**

```typescript
useResource$: <T>(generatorFn: ResourceFn<T>, opts?: ResourceOptions) =>
  ResourceReturn<T>;
```

## useResourceQrl variable

This method works like an async memoized function that runs whenever some tracked value changes and returns some data.

`useResource` however returns immediate a `ResourceReturn` object that contains the data and a state that indicates if the data is available or not.

The status can be one of the following:

- 'pending' - the data is not yet available. - 'resolved' - the data is available. - 'rejected' - the data is not available due to an error or timeout.

\#\#\# Example

Example showing how `useResource` to perform a fetch to request the weather, whenever the input city name changes.

```tsx
const Cmp = component$(() => {
  const store = useStore({
    city: "",
  });

  const weatherResource = useResource$<any>(async ({ track, cleanup }) => {
    const cityName = track(() => store.city);
    const abortController = new AbortController();
    cleanup(() => abortController.abort("cleanup"));
    const res = await fetch(`http://weatherdata.com?city=${cityName}`, {
      signal: abortController.signal,
    });
    const data = res.json();
    return data;
  });

  return (
    <div>
      <input
        name="city"
        onInput$={(ev: any) => (store.city = ev.target.value)}
      />
      <Resource
        value={weatherResource}
        onResolved={(weather) => {
          return <div>Temperature: {weather.temp}</div>;
        }}
      />
    </div>
  );
});
```

**Signature:**

```typescript
useResourceQrl: <T>(qrl: QRL<ResourceFn<T>>, opts?: ResourceOptions) =>
  ResourceReturn<T>;
```

## useServerMount$ variable

> Warning: This API is now obsolete.
>
> - use `useTask$()` with `isServer` instead. See

Deprecated API, equivalent of doing:

```tsx
import { useTask$ } from "@builder.io/qwik";
import { isServer } from "@builder.io/qwik/build";
useTask$(() => {
  if (isServer) {
    // only runs on server
  }
});
```

**Signature:**

```typescript
useServerMount$: <T>(first: MountFn<T>) => void
```

## useServerMountQrl variable

> Warning: This API is now obsolete.
>
> - use `useTask$()` with `isServer` instead. See

Deprecated API, equivalent of doing:

```tsx
import { useTask$ } from "@builder.io/qwik";
import { isServer } from "@builder.io/qwik/build";
useTask$(() => {
  if (isServer) {
    // only runs on server
  }
});
```

**Signature:**

```typescript
useServerMountQrl: <T>(mountQrl: QRL<MountFn<T>>) => void
```

## useStore variable

Creates an object that Qwik can track across serializations.

Use `useStore` to create a state for your application. The returned object is a proxy that has a unique ID. The ID of the object is used in the `QRL`<!-- -->s to refer to the store.

\#\#\# Example

Example showing how `useStore` is used in Counter example to keep track of the count.

```tsx
const Stores = component$(() => {
  const counter = useCounter(1);

  // Reactivity happens even for nested objects and arrays
  const userData = useStore({
    name: "Manu",
    address: {
      address: "",
      city: "",
    },
    orgs: [],
  });

  // useStore() can also accept a function to calculate the initial value
  const state = useStore(() => {
    return {
      value: expensiveInitialValue(),
    };
  });

  return (
    <div>
      <div>Counter: {counter.value}</div>
      <Child userData={userData} state={state} />
    </div>
  );
});

function useCounter(step: number) {
  // Multiple stores can be created in custom hooks for convenience and composability
  const counterStore = useStore({
    value: 0,
  });
  useVisibleTask$(() => {
    // Only runs in the client
    const timer = setInterval(() => {
      counterStore.value += step;
    }, 500);
    return () => {
      clearInterval(timer);
    };
  });
  return counterStore;
}
```

**Signature:**

```typescript
useStore: <STATE extends object>(
  initialState: STATE | (() => STATE),
  opts?: UseStoreOptions
) => STATE;
```

## UseStoreOptions.deep property

If `true` then all nested objects and arrays will be tracked as well. Default is `false`<!-- -->.

**Signature:**

```typescript
deep?: boolean;
```

## UseStoreOptions interface

**Signature:**

```typescript
export interface UseStoreOptions
```

## Properties

| Property                                          | Modifiers | Type    | Description                                                                                                                  |
| ------------------------------------------------- | --------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [deep?](./qwik.usestoreoptions.deep.md)           |           | boolean | _(Optional)_ If <code>true</code> then all nested objects and arrays will be tracked as well. Default is <code>false</code>. |
| [reactive?](./qwik.usestoreoptions.reactive.md)   |           | boolean | _(Optional)_ If <code>false</code> then the object will not be tracked for changes. Default is <code>true</code>.            |
| [recursive?](./qwik.usestoreoptions.recursive.md) |           | boolean | _(Optional)_                                                                                                                 |

## UseStoreOptions.reactive property

If `false` then the object will not be tracked for changes. Default is `true`<!-- -->.

**Signature:**

```typescript
reactive?: boolean;
```

## UseStoreOptions.recursive property

> Warning: This API is now obsolete.
>
> - use `deep` instead

**Signature:**

```typescript
recursive?: boolean;
```

## useStyles$ variable

A lazy-loadable reference to a component's styles.

Component styles allow Qwik to lazy load the style information for the component only when needed. (And avoid double loading it in case of SSR hydration.)

```tsx
import styles from "./code-block.css?inline";

export const CmpStyles = component$(() => {
  useStyles$(styles);

  return <div>Some text</div>;
});
```

**Signature:**

```typescript
useStyles$: (first: string) => void
```

## useStylesQrl variable

A lazy-loadable reference to a component's styles.

Component styles allow Qwik to lazy load the style information for the component only when needed. (And avoid double loading it in case of SSR hydration.)

```tsx
import styles from "./code-block.css?inline";

export const CmpStyles = component$(() => {
  useStyles$(styles);

  return <div>Some text</div>;
});
```

**Signature:**

```typescript
useStylesQrl: (styles: QRL<string>) => void
```

## useTask$ variable

Reruns the `taskFn` when the observed inputs change.

Use `useTask` to observe changes on a set of inputs, and then re-execute the `taskFn` when those inputs change.

The `taskFn` only executes if the observed inputs change. To observe the inputs, use the `obs` function to wrap property reads. This creates subscriptions that will trigger the `taskFn` to rerun.

**Signature:**

```typescript
useTask$: (first: TaskFn, opts?: UseTaskOptions | undefined) => void
```

## UseTaskOptions.eagerness property

- `visible`<!-- -->: run the effect when the element is visible. - `load`<!-- -->: eagerly run the effect when the application resumes.

**Signature:**

```typescript
eagerness?: EagernessOptions;
```

## UseTaskOptions interface

**Signature:**

```typescript
export interface UseTaskOptions
```

## Properties

| Property                                         | Modifiers | Type                                           | Description                                                                                                                                                |
| ------------------------------------------------ | --------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [eagerness?](./qwik.usetaskoptions.eagerness.md) |           | [EagernessOptions](./qwik.eagernessoptions.md) | _(Optional)_ - <code>visible</code>: run the effect when the element is visible. - <code>load</code>: eagerly run the effect when the application resumes. |

## useTaskQrl variable

Reruns the `taskFn` when the observed inputs change.

Use `useTask` to observe changes on a set of inputs, and then re-execute the `taskFn` when those inputs change.

The `taskFn` only executes if the observed inputs change. To observe the inputs, use the `obs` function to wrap property reads. This creates subscriptions that will trigger the `taskFn` to rerun.

**Signature:**

```typescript
useTaskQrl: (qrl: QRL<TaskFn>, opts?: UseTaskOptions) => void
```

## useVisibleTask$ variable

```tsx
const Timer = component$(() => {
  const store = useStore({
    count: 0,
  });

  useVisibleTask$(() => {
    // Only runs in the client
    const timer = setInterval(() => {
      store.count++;
    }, 500);
    return () => {
      clearInterval(timer);
    };
  });

  return <div>{store.count}</div>;
});
```

**Signature:**

```typescript
useVisibleTask$: (first: TaskFn, opts?: OnVisibleTaskOptions | undefined) => void
```

## useVisibleTaskQrl variable

```tsx
const Timer = component$(() => {
  const store = useStore({
    count: 0,
  });

  useVisibleTask$(() => {
    // Only runs in the client
    const timer = setInterval(() => {
      store.count++;
    }, 500);
    return () => {
      clearInterval(timer);
    };
  });

  return <div>{store.count}</div>;
});
```

**Signature:**

```typescript
useVisibleTaskQrl: (qrl: QRL<TaskFn>, opts?: OnVisibleTaskOptions) => void
```

## useWatch$ variable

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

> Warning: This API is now obsolete.
>
> - use `useTask$()` instead

**Signature:**

```typescript
useWatch$: (first: TaskFn, opts?: UseTaskOptions | undefined) => void
```

## useWatchQrl variable

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

> Warning: This API is now obsolete.
>
> - use `useTask$()` instead

**Signature:**

```typescript
useWatchQrl: (qrl: QRL<TaskFn>, opts?: UseTaskOptions) => void
```

## ValueOrPromise type

Type representing a value which is either resolve or a promise.

**Signature:**

```typescript
export type ValueOrPromise<T> = T | Promise<T>;
```

## version variable

QWIK_VERSION

**Signature:**

```typescript
version: string;
```

## VisibleTaskStrategy type

**Signature:**

```typescript
export type VisibleTaskStrategy =
  | "intersection-observer"
  | "document-ready"
  | "document-idle";
```
