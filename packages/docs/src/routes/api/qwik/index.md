---
title: \@builder.io/qwik API Reference
---

# [API](/api) &rsaquo; @builder.io/qwik

## \_qrlSync

> This API is provided as an alpha preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

Extract function into a synchronously loadable QRL.

NOTE: Synchronous QRLs functions can't close over any variables, including exports.

```typescript
_qrlSync: <TYPE extends Function>(fn: TYPE, serializedFn?: string) =>
  SyncQRL<TYPE>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/qrl/qrl.public.ts)

## "q:slot"

```typescript
'q:slot'?: string;
```

## "xlink:actuate"

```typescript
'xlink:actuate'?: string | undefined;
```

## "xlink:arcrole"

```typescript
'xlink:arcrole'?: string | undefined;
```

## "xlink:href"

```typescript
'xlink:href'?: string | undefined;
```

## "xlink:role"

```typescript
'xlink:role'?: string | undefined;
```

## "xlink:show"

```typescript
'xlink:show'?: string | undefined;
```

## "xlink:title"

```typescript
'xlink:title'?: string | undefined;
```

## "xlink:type"

```typescript
'xlink:type'?: string | undefined;
```

## "xml:base"

```typescript
'xml:base'?: string | undefined;
```

## "xml:lang"

```typescript
'xml:lang'?: string | undefined;
```

## "xml:space"

```typescript
'xml:space'?: string | undefined;
```

## "xmlns:xlink"

```typescript
'xmlns:xlink'?: string | undefined;
```

## $

Qwik Optimizer marker function.

Use `$(...)` to tell Qwik Optimizer to extract the expression in `$(...)` into a lazy-loadable resource referenced by `QRL`.

```typescript
$: <T>(expression: T) => QRL<T>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/qrl/qrl.public.ts)

## AnchorHTMLAttributes

```typescript
export interface AnchorHTMLAttributes<T extends Element> extends Attrs<'a', T>
```

**Extends:** Attrs&lt;'a', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## AreaHTMLAttributes

```typescript
export interface AreaHTMLAttributes<T extends Element> extends Attrs<'area', T>
```

**Extends:** Attrs&lt;'area', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## AriaAttributes

TS defines these with the React syntax which is not compatible with Qwik. E.g. `ariaAtomic` instead of `aria-atomic`.

```typescript
export interface AriaAttributes
```

| Property                      | Modifiers | Type                                                                                                                                                                                    | Description                                                                                                                                                                                                                       |
| ----------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ["aria-activedescendant"?](#) |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Identifies the currently active element when DOM focus is on a composite widget, textbox, group, or application.                                                                                                     |
| ["aria-atomic"?](#)           |           | [Booleanish](#booleanish) \| undefined                                                                                                                                                  | _(Optional)_ Indicates whether assistive technologies will present all, or only parts of, the changed region based on the change notifications defined by the aria-relevant attribute.                                            |
| ["aria-autocomplete"?](#)     |           | 'none' \| 'inline' \| 'list' \| 'both' \| undefined                                                                                                                                     | _(Optional)_ Indicates whether inputting text could trigger display of one or more predictions of the user's intended value for an input and specifies how predictions would be presented if they are made.                       |
| ["aria-busy"?](#)             |           | [Booleanish](#booleanish) \| undefined                                                                                                                                                  | _(Optional)_ Indicates an element is being modified and that assistive technologies MAY want to wait until the modifications are complete before exposing them to the user.                                                       |
| ["aria-checked"?](#)          |           | boolean \| 'false' \| 'mixed' \| 'true' \| undefined                                                                                                                                    | _(Optional)_ Indicates the current "checked" state of checkboxes, radio buttons, and other widgets.                                                                                                                               |
| ["aria-colcount"?](#)         |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines the total number of columns in a table, grid, or treegrid.                                                                                                                                                   |
| ["aria-colindex"?](#)         |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines an element's column index or position with respect to the total number of columns within a table, grid, or treegrid.                                                                                         |
| ["aria-colspan"?](#)          |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines the number of columns spanned by a cell or gridcell within a table, grid, or treegrid.                                                                                                                       |
| ["aria-controls"?](#)         |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Identifies the element (or elements) whose contents or presence are controlled by the current element.                                                                                                               |
| ["aria-current"?](#)          |           | boolean \| 'false' \| 'true' \| 'page' \| 'step' \| 'location' \| 'date' \| 'time' \| undefined                                                                                         | _(Optional)_ Indicates the element that represents the current item within a container or set of related elements.                                                                                                                |
| ["aria-describedby"?](#)      |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Identifies the element (or elements) that describes the object.                                                                                                                                                      |
| ["aria-details"?](#)          |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Identifies the element that provides a detailed, extended description for the object.                                                                                                                                |
| ["aria-disabled"?](#)         |           | [Booleanish](#booleanish) \| undefined                                                                                                                                                  | _(Optional)_ Indicates that the element is perceivable but disabled, so it is not editable or otherwise operable.                                                                                                                 |
| ["aria-dropeffect"?](#)       |           | 'none' \| 'copy' \| 'execute' \| 'link' \| 'move' \| 'popup' \| undefined                                                                                                               | _(Optional)_ Indicates what functions can be performed when a dragged object is released on the drop target.                                                                                                                      |
| ["aria-errormessage"?](#)     |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Identifies the element that provides an error message for the object.                                                                                                                                                |
| ["aria-expanded"?](#)         |           | [Booleanish](#booleanish) \| undefined                                                                                                                                                  | _(Optional)_ Indicates whether the element, or another grouping element it controls, is currently expanded or collapsed.                                                                                                          |
| ["aria-flowto"?](#)           |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Identifies the next element (or elements) in an alternate reading order of content which, at the user's discretion, allows assistive technology to override the general default of reading in document source order. |
| ["aria-grabbed"?](#)          |           | [Booleanish](#booleanish) \| undefined                                                                                                                                                  | _(Optional)_ Indicates an element's "grabbed" state in a drag-and-drop operation.                                                                                                                                                 |
| ["aria-haspopup"?](#)         |           | boolean \| 'false' \| 'true' \| 'menu' \| 'listbox' \| 'tree' \| 'grid' \| 'dialog' \| undefined                                                                                        | _(Optional)_ Indicates the availability and type of interactive popup element, such as menu or dialog, that can be triggered by an element.                                                                                       |
| ["aria-hidden"?](#)           |           | [Booleanish](#booleanish) \| undefined                                                                                                                                                  | _(Optional)_ Indicates whether the element is exposed to an accessibility API.                                                                                                                                                    |
| ["aria-invalid"?](#)          |           | boolean \| 'false' \| 'true' \| 'grammar' \| 'spelling' \| undefined                                                                                                                    | _(Optional)_ Indicates the entered value does not conform to the format expected by the application.                                                                                                                              |
| ["aria-keyshortcuts"?](#)     |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Indicates keyboard shortcuts that an author has implemented to activate or give focus to an element.                                                                                                                 |
| ["aria-label"?](#)            |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Defines a string value that labels the current element.                                                                                                                                                              |
| ["aria-labelledby"?](#)       |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Identifies the element (or elements) that labels the current element.                                                                                                                                                |
| ["aria-level"?](#)            |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines the hierarchical level of an element within a structure.                                                                                                                                                     |
| ["aria-live"?](#)             |           | 'off' \| 'assertive' \| 'polite' \| undefined                                                                                                                                           | _(Optional)_ Indicates that an element will be updated, and describes the types of updates the user agents, assistive technologies, and user can expect from the live region.                                                     |
| ["aria-modal"?](#)            |           | [Booleanish](#booleanish) \| undefined                                                                                                                                                  | _(Optional)_ Indicates whether an element is modal when displayed.                                                                                                                                                                |
| ["aria-multiline"?](#)        |           | [Booleanish](#booleanish) \| undefined                                                                                                                                                  | _(Optional)_ Indicates whether a text box accepts multiple lines of input or only a single line.                                                                                                                                  |
| ["aria-multiselectable"?](#)  |           | [Booleanish](#booleanish) \| undefined                                                                                                                                                  | _(Optional)_ Indicates that the user may select more than one item from the current selectable descendants.                                                                                                                       |
| ["aria-orientation"?](#)      |           | 'horizontal' \| 'vertical' \| undefined                                                                                                                                                 | _(Optional)_ Indicates whether the element's orientation is horizontal, vertical, or unknown/ambiguous.                                                                                                                           |
| ["aria-owns"?](#)             |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Identifies an element (or elements) in order to define a visual, functional, or contextual parent/child relationship between DOM elements where the DOM hierarchy cannot be used to represent the relationship.      |
| ["aria-placeholder"?](#)      |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Defines a short hint (a word or short phrase) intended to aid the user with data entry when the control has no value. A hint could be a sample value or a brief description of the expected format.                  |
| ["aria-posinset"?](#)         |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines an element's number or position in the current set of listitems or treeitems. Not required if all elements in the set are present in the DOM.                                                                |
| ["aria-pressed"?](#)          |           | boolean \| 'false' \| 'mixed' \| 'true' \| undefined                                                                                                                                    | _(Optional)_ Indicates the current "pressed" state of toggle buttons.                                                                                                                                                             |
| ["aria-readonly"?](#)         |           | [Booleanish](#booleanish) \| undefined                                                                                                                                                  | _(Optional)_ Indicates that the element is not editable, but is otherwise operable.                                                                                                                                               |
| ["aria-relevant"?](#)         |           | 'additions' \| 'additions removals' \| 'additions text' \| 'all' \| 'removals' \| 'removals additions' \| 'removals text' \| 'text' \| 'text additions' \| 'text removals' \| undefined | _(Optional)_ Indicates what notifications the user agent will trigger when the accessibility tree within a live region is modified.                                                                                               |
| ["aria-required"?](#)         |           | [Booleanish](#booleanish) \| undefined                                                                                                                                                  | _(Optional)_ Indicates that user input is required on the element before a form may be submitted.                                                                                                                                 |
| ["aria-roledescription"?](#)  |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Defines a human-readable, author-localized description for the role of an element.                                                                                                                                   |
| ["aria-rowcount"?](#)         |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines the total number of rows in a table, grid, or treegrid.                                                                                                                                                      |
| ["aria-rowindex"?](#)         |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines an element's row index or position with respect to the total number of rows within a table, grid, or treegrid.                                                                                               |
| ["aria-rowspan"?](#)          |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines the number of rows spanned by a cell or gridcell within a table, grid, or treegrid.                                                                                                                          |
| ["aria-selected"?](#)         |           | [Booleanish](#booleanish) \| undefined                                                                                                                                                  | _(Optional)_ Indicates the current "selected" state of various widgets.                                                                                                                                                           |
| ["aria-setsize"?](#)          |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines the number of items in the current set of listitems or treeitems. Not required if all elements in the set are present in the DOM.                                                                            |
| ["aria-sort"?](#)             |           | 'none' \| 'ascending' \| 'descending' \| 'other' \| undefined                                                                                                                           | _(Optional)_ Indicates if items in a table or grid are sorted in ascending or descending order.                                                                                                                                   |
| ["aria-valuemax"?](#)         |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines the maximum allowed value for a range widget.                                                                                                                                                                |
| ["aria-valuemin"?](#)         |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines the minimum allowed value for a range widget.                                                                                                                                                                |
| ["aria-valuenow"?](#)         |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines the current value for a range widget.                                                                                                                                                                        |
| ["aria-valuetext"?](#)        |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Defines the human readable text alternative of aria-valuenow for a range widget.                                                                                                                                     |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## AriaRole

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

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## AudioHTMLAttributes

```typescript
export interface AudioHTMLAttributes<T extends Element> extends Attrs<'audio', T>
```

**Extends:** Attrs&lt;'audio', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## BaseHTMLAttributes

```typescript
export interface BaseHTMLAttributes<T extends Element> extends Attrs<'base', T>
```

**Extends:** Attrs&lt;'base', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## BlockquoteHTMLAttributes

```typescript
export interface BlockquoteHTMLAttributes<T extends Element> extends Attrs<'blockquote', T>
```

**Extends:** Attrs&lt;'blockquote', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## Booleanish

```typescript
export type Booleanish = boolean | `${boolean}`;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## ButtonHTMLAttributes

```typescript
export interface ButtonHTMLAttributes<T extends Element> extends Attrs<'button', T>
```

**Extends:** Attrs&lt;'button', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## cache

```typescript
cache(policyOrMilliseconds: number | 'immutable'): void;
```

| Parameter            | Type                  | Description |
| -------------------- | --------------------- | ----------- |
| policyOrMilliseconds | number \| 'immutable' |             |

**Returns:**

void

## CanvasHTMLAttributes

```typescript
export interface CanvasHTMLAttributes<T extends Element> extends Attrs<'canvas', T>
```

**Extends:** Attrs&lt;'canvas', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## ClassList

A class list can be a string, a boolean, an array, or an object.

If it's an array, each item is a class list and they are all added.

If it's an object, then the keys are class name strings, and the values are booleans that determine if the class name string should be added or not.

```typescript
export type ClassList =
  | string
  | undefined
  | null
  | false
  | Record<string, boolean | string | number | null | undefined>
  | ClassList[];
```

**References:** [ClassList](#classlist)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-attributes.ts)

## cleanup

```typescript
cleanup(): void;
```

**Returns:**

void

## ColgroupHTMLAttributes

```typescript
export interface ColgroupHTMLAttributes<T extends Element> extends Attrs<'colgroup', T>
```

**Extends:** Attrs&lt;'colgroup', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## ColHTMLAttributes

```typescript
export interface ColHTMLAttributes<T extends Element> extends Attrs<'col', T>
```

**Extends:** Attrs&lt;'col', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## Component

Type representing the Qwik component.

`Component` is the type returned by invoking `component$`.

```tsx
interface MyComponentProps {
  someProp: string;
}
const MyComponent: Component<MyComponentProps> = component$(
  (props: MyComponentProps) => {
    return <span>{props.someProp}</span>;
  },
);
```

```typescript
export type Component<
  PROPS extends Record<any, any> = Record<string, unknown>,
> = FunctionComponent<PublicProps<PROPS>>;
```

**References:** [FunctionComponent](#functioncomponent), [PublicProps](#publicprops)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/component/component.public.ts)

## component$

Declare a Qwik component that can be used to create UI.

Use `component$` to declare a Qwik component. A Qwik component is a special kind of component that allows the Qwik framework to lazy load and execute the component independently of other Qwik components as well as lazy load the component's life-cycle hooks and event handlers.

Side note: You can also declare regular (standard JSX) components that will have standard synchronous behavior.

Qwik component is a facade that describes how the component should be used without forcing the implementation of the component to be eagerly loaded. A minimum Qwik definition consists of:

### Example

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

See also: `component`, `useCleanup`, `onResume`, `onPause`, `useOn`, `useOnDocument`, `useOnWindow`, `useStyles`

```typescript
component$: <PROPS extends Record<any, any>>(
  onMount: (props: PROPS) => JSXNode | null,
) => Component<PropFunctionProps<PROPS>>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/component/component.public.ts)

## ComponentBaseProps

```typescript
export interface ComponentBaseProps
```

| Property                                  | Modifiers | Type                                  | Description  |
| ----------------------------------------- | --------- | ------------------------------------- | ------------ |
| ["q:slot"?](#componentbaseprops-_q_slot_) |           | string                                | _(Optional)_ |
| [key?](#)                                 |           | string \| number \| null \| undefined | _(Optional)_ |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-attributes.ts)

## componentQrl

Declare a Qwik component that can be used to create UI.

Use `component$` to declare a Qwik component. A Qwik component is a special kind of component that allows the Qwik framework to lazy load and execute the component independently of other Qwik components as well as lazy load the component's life-cycle hooks and event handlers.

Side note: You can also declare regular (standard JSX) components that will have standard synchronous behavior.

Qwik component is a facade that describes how the component should be used without forcing the implementation of the component to be eagerly loaded. A minimum Qwik definition consists of:

### Example

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

See also: `component`, `useCleanup`, `onResume`, `onPause`, `useOn`, `useOnDocument`, `useOnWindow`, `useStyles`

```typescript
componentQrl: <PROPS extends Record<any, any>>(
  componentQrl: QRL<OnRenderFn<PROPS>>,
) => Component<PROPS>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/component/component.public.ts)

## ContextId

ContextId is a typesafe ID for your context.

Context is a way to pass stores to the child components without prop-drilling.

Use `createContextId()` to create a `ContextId`. A `ContextId` is just a serializable identifier for the context. It is not the context value itself. See `useContextProvider()` and `useContext()` for the values. Qwik needs a serializable ID for the context so that the it can track context providers and consumers in a way that survives resumability.

### Example

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
    }),
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

```typescript
export interface ContextId<STATE>
```

| Property                        | Modifiers             | Type   | Description                                                     |
| ------------------------------- | --------------------- | ------ | --------------------------------------------------------------- |
| [\_\_brand_context_type\_\_](#) | <code>readonly</code> | STATE  | Design-time property to store type information for the context. |
| [id](#)                         | <code>readonly</code> | string | A unique ID for the context.                                    |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-context.ts)

## CorePlatform

Low-level API for platform abstraction.

Different platforms (browser, node, service workers) may have different ways of handling things such as `requestAnimationFrame` and imports. To make Qwik platform-independent Qwik uses the `CorePlatform` API to access the platform API.

`CorePlatform` also is responsible for importing symbols. The import map is different on the client (browser) then on the server. For this reason, the server has a manifest that is used to map symbols to javascript chunks. The manifest is encapsulated in `CorePlatform`, for this reason, the `CorePlatform` can't be global as there may be multiple applications running at server concurrently.

This is a low-level API and there should not be a need for you to access this.

```typescript
export interface CorePlatform
```

| Property            | Modifiers | Type                                                                                                                                            | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [chunkForSymbol](#) |           | (symbolName: string, chunk: string \| null) =&gt; readonly [symbol: string, chunk: string] \| undefined                                         | <p>Retrieve chunk name for the symbol.</p><p>When the application is running on the server the symbols may be imported from different files (as server build is typically a single javascript chunk.) For this reason, it is necessary to convert the chunks from server format to client (browser) format. This is done by looking up symbols (which are globally unique) in the manifest. (Manifest is the mapping of symbols to the client chunk names.)</p>                                                                                                                                   |
| [importSymbol](#)   |           | (containerEl: Element \| undefined, url: string \| URL \| undefined \| null, symbol: string) =&gt; [ValueOrPromise](#valueorpromise)&lt;any&gt; | <p>Retrieve a symbol value from QRL.</p><p>Qwik needs to lazy load data and closures. For this Qwik uses QRLs that are serializable references of resources that are needed. The QRLs contain all the information necessary to retrieve the reference using <code>importSymbol</code>.</p><p>Why not use <code>import()</code>? Because <code>import()</code> is relative to the current file, and the current file is always the Qwik framework. So QRLs have additional information that allows them to serialize imports relative to application base rather than the Qwik framework file.</p> |
| [isServer](#)       |           | boolean                                                                                                                                         | True of running on the server platform.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [nextTick](#)       |           | (fn: () =&gt; any) =&gt; Promise&lt;any&gt;                                                                                                     | Perform operation on next tick.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| [raf](#)            |           | (fn: () =&gt; any) =&gt; Promise&lt;any&gt;                                                                                                     | Perform operation on next request-animation-frame.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/platform/types.ts)

## CorrectedToggleEvent

This corrects the TS definition for ToggleEvent

```typescript
export interface CorrectedToggleEvent extends Event
```

**Extends:** Event

| Property       | Modifiers             | Type               | Description |
| -------------- | --------------------- | ------------------ | ----------- |
| [newState](#)  | <code>readonly</code> | 'open' \| 'closed' |             |
| [prevState](#) | <code>readonly</code> | 'open' \| 'closed' |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-attributes.ts)

## createContextId

Create a context ID to be used in your application. The name should be written with no spaces.

Context is a way to pass stores to the child components without prop-drilling.

Use `createContextId()` to create a `ContextId`. A `ContextId` is just a serializable identifier for the context. It is not the context value itself. See `useContextProvider()` and `useContext()` for the values. Qwik needs a serializable ID for the context so that the it can track context providers and consumers in a way that survives resumability.

### Example

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
    }),
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

```typescript
createContextId: <STATE = unknown>(name: string) => ContextId<STATE>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-context.ts)

## CSSProperties

```typescript
export interface CSSProperties extends CSS.Properties<string | number>, CSS.PropertiesHyphen<string | number>
```

**Extends:** CSS.Properties&lt;string \| number&gt;, CSS.PropertiesHyphen&lt;string \| number&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## DataHTMLAttributes

```typescript
export interface DataHTMLAttributes<T extends Element> extends Attrs<'data', T>
```

**Extends:** Attrs&lt;'data', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## DelHTMLAttributes

```typescript
export interface DelHTMLAttributes<T extends Element> extends Attrs<'del', T>
```

**Extends:** Attrs&lt;'del', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## DetailsHTMLAttributes

```typescript
export interface DetailsHTMLAttributes<T extends Element> extends Attrs<'details', T>
```

**Extends:** Attrs&lt;'details', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## DevJSX

```typescript
export interface DevJSX
```

| Property          | Modifiers | Type   | Description  |
| ----------------- | --------- | ------ | ------------ |
| [columnNumber](#) |           | number |              |
| [fileName](#)     |           | string |              |
| [lineNumber](#)   |           | number |              |
| [stack?](#)       |           | string | _(Optional)_ |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-node.ts)

## DialogHTMLAttributes

```typescript
export interface DialogHTMLAttributes<T extends Element> extends Attrs<'dialog', T>
```

**Extends:** Attrs&lt;'dialog', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## DOMAttributes

The Qwik-specific attributes that DOM elements accept

```typescript
export interface DOMAttributes<EL extends Element> extends QwikAttributesBase, RefAttr<EL>, QwikEvents<EL>
```

**Extends:** QwikAttributesBase, RefAttr&lt;EL&gt;, QwikEvents&lt;EL&gt;

| Property    | Modifiers | Type                                                                                     | Description  |
| ----------- | --------- | ---------------------------------------------------------------------------------------- | ------------ |
| [class?](#) |           | [ClassList](#classlist) \| [Signal](#signal)&lt;[ClassList](#classlist)&gt; \| undefined | _(Optional)_ |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-attributes.ts)

## EagernessOptions

```typescript
export type EagernessOptions = "visible" | "load" | "idle";
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts)

## Element

```typescript
interface Element extends QwikJSX.Element
```

**Extends:** [QwikJSX.Element](#)

## ElementChildrenAttribute

```typescript
interface ElementChildrenAttribute
```

| Property       | Modifiers | Type | Description  |
| -------------- | --------- | ---- | ------------ |
| [children?](#) |           | any  | _(Optional)_ |

## ElementType

```typescript
type ElementType = string | ((...args: any[]) => JSXNode | null);
```

**References:** [JSXNode](#jsxnode)

## EmbedHTMLAttributes

```typescript
export interface EmbedHTMLAttributes<T extends Element> extends Attrs<'embed', T>
```

**Extends:** Attrs&lt;'embed', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## ErrorBoundaryStore

```typescript
export interface ErrorBoundaryStore
```

| Property   | Modifiers | Type             | Description |
| ---------- | --------- | ---------------- | ----------- |
| [error](#) |           | any \| undefined |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/error-handling.ts)

## event$

```typescript
event$: <T>(first: T) => QRL<T>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/qrl/qrl.public.ts)

## eventQrl

```typescript
eventQrl: <T>(qrl: QRL<T>) => QRL<T>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/qrl/qrl.public.ts)

## FieldsetHTMLAttributes

```typescript
export interface FieldsetHTMLAttributes<T extends Element> extends Attrs<'fieldset', T>
```

**Extends:** Attrs&lt;'fieldset', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## FormHTMLAttributes

```typescript
export interface FormHTMLAttributes<T extends Element> extends Attrs<'form', T>
```

**Extends:** Attrs&lt;'form', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## Fragment

```typescript
Fragment: FunctionComponent<{
  children?: any;
  key?: string | number | null;
}>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/jsx-runtime.ts)

## FunctionComponent

```typescript
export interface FunctionComponent<P extends Record<any, any> = Record<any, unknown>>
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-node.ts)

## getPlatform

Retrieve the `CorePlatform`.

The `CorePlatform` is also responsible for retrieving the Manifest, that contains mappings from symbols to javascript import chunks. For this reason, `CorePlatform` can't be global, but is specific to the application currently running. On server it is possible that many different applications are running in a single server instance, and for this reason the `CorePlatform` is associated with the application document.

```typescript
getPlatform: () => CorePlatform;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/platform/platform.ts)

## h

```typescript
export declare namespace h
```

| Function                     | Description |
| ---------------------------- | ----------- |
| [h(type)](#)                 |             |
| [h(type, data)](#)           |             |
| [h(type, text)](#)           |             |
| [h(type, children)](#)       |             |
| [h(type, data, text)](#)     |             |
| [h(type, data, children)](#) |             |
| [h(sel, data, children)](#)  |             |

| Namespace     | Description |
| ------------- | ----------- |
| [JSX](#h-jsx) |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/factory.ts)

## h

```typescript
export declare namespace h
```

| Function                     | Description |
| ---------------------------- | ----------- |
| [h(type)](#)                 |             |
| [h(type, data)](#)           |             |
| [h(type, text)](#)           |             |
| [h(type, children)](#)       |             |
| [h(type, data, text)](#)     |             |
| [h(type, data, children)](#) |             |
| [h(sel, data, children)](#)  |             |

| Namespace     | Description |
| ------------- | ----------- |
| [JSX](#h-jsx) |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/factory.ts)

## HrHTMLAttributes

```typescript
export interface HrHTMLAttributes<T extends Element> extends Attrs<'hr', T>
```

**Extends:** Attrs&lt;'hr', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## HTMLAttributeAnchorTarget

```typescript
export type HTMLAttributeAnchorTarget =
  | "_self"
  | "_blank"
  | "_parent"
  | "_top"
  | (string & {});
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## HTMLAttributeReferrerPolicy

```typescript
export type HTMLAttributeReferrerPolicy = ReferrerPolicy;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## HTMLAttributes

```typescript
export interface HTMLAttributes<E extends Element> extends HTMLElementAttrs, DOMAttributes<E>
```

**Extends:** HTMLElementAttrs, [DOMAttributes](#domattributes)&lt;E&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## HTMLCrossOriginAttribute

```typescript
export type HTMLCrossOriginAttribute =
  | "anonymous"
  | "use-credentials"
  | ""
  | undefined;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## HTMLFragment

```typescript
HTMLFragment: FunctionComponent<{
  dangerouslySetInnerHTML: string;
}>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/jsx-runtime.ts)

## HtmlHTMLAttributes

```typescript
export interface HtmlHTMLAttributes<T extends Element> extends Attrs<'html', T>
```

**Extends:** Attrs&lt;'html', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## HTMLInputAutocompleteAttribute

```typescript
export type HTMLInputAutocompleteAttribute =
  | "on"
  | "off"
  | "billing"
  | "shipping"
  | "name"
  | "honorific-prefix"
  | "given-name"
  | "additional-name"
  | "family-name"
  | "honorific-suffix"
  | "nickname"
  | "username"
  | "new-password"
  | "current-password"
  | "one-time-code"
  | "organization-title"
  | "organization"
  | "street-address"
  | "address-line1"
  | "address-line2"
  | "address-line3"
  | "address-level4"
  | "address-level3"
  | "address-level2"
  | "address-level1"
  | "country"
  | "country-name"
  | "postal-code"
  | "cc-name"
  | "cc-given-name"
  | "cc-additional-name"
  | "cc-family-name"
  | "cc-number"
  | "cc-exp"
  | "cc-exp-month"
  | "cc-exp-year"
  | "cc-csc"
  | "cc-type"
  | "transaction-currency"
  | "transaction-amount"
  | "language"
  | "bday"
  | "bday-day"
  | "bday-month"
  | "bday-year"
  | "sex"
  | "url"
  | "photo";
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## HTMLInputTypeAttribute

```typescript
export type HTMLInputTypeAttribute =
  | "button"
  | "checkbox"
  | "color"
  | "date"
  | "datetime-local"
  | "email"
  | "file"
  | "hidden"
  | "image"
  | "month"
  | "number"
  | "password"
  | "radio"
  | "range"
  | "reset"
  | "search"
  | "submit"
  | "tel"
  | "text"
  | "time"
  | "url"
  | "week"
  | (string & {});
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## IframeHTMLAttributes

```typescript
export interface IframeHTMLAttributes<T extends Element> extends Attrs<'iframe', T>
```

**Extends:** Attrs&lt;'iframe', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## ImgHTMLAttributes

```typescript
export interface ImgHTMLAttributes<T extends Element> extends Attrs<'img', T>
```

**Extends:** Attrs&lt;'img', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## implicit$FirstArg

Create a `____$(...)` convenience method from `___(...)`.

It is very common for functions to take a lazy-loadable resource as a first argument. For this reason, the Qwik Optimizer automatically extracts the first argument from any function which ends in `$`.

This means that `foo$(arg0)` and `foo($(arg0))` are equivalent with respect to Qwik Optimizer. The former is just a shorthand for the latter.

For example, these function calls are equivalent:

- `component$(() => {...})` is same as `component($(() => {...}))`

```tsx
export function myApi(callback: QRL<() => void>): void {
  // ...
}

export const myApi$ = implicit$FirstArg(myApi);
// type of myApi$: (callback: () => void): void

// can be used as:
myApi$(() => console.log("callback"));

// will be transpiled to:
// FILE: <current file>
myApi(qrl("./chunk-abc.js", "callback"));

// FILE: chunk-abc.js
export const callback = () => console.log("callback");
```

```typescript
implicit$FirstArg: <FIRST, REST extends any[], RET>(
    fn: (first: QRL<FIRST>, ...rest: REST) => RET,
  ) =>
  (first: FIRST, ...rest: REST) =>
    RET;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/util/implicit_dollar.ts)

## InputHTMLAttributes

```typescript
export type InputHTMLAttributes<T extends Element> = Attrs<
  "input",
  T,
  HTMLInputElement
>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## InsHTMLAttributes

```typescript
export interface InsHTMLAttributes<T extends Element> extends Attrs<'ins', T>
```

**Extends:** Attrs&lt;'ins', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## IntrinsicAttributes

```typescript
interface IntrinsicAttributes extends QwikJSX.IntrinsicAttributes
```

**Extends:** [QwikJSX.IntrinsicAttributes](#)

## IntrinsicElements

```typescript
interface IntrinsicElements extends QwikJSX.IntrinsicElements
```

**Extends:** [QwikJSX.IntrinsicElements](#)

## isSignal

Checks if a given object is a `Signal`.

```typescript
isSignal: <T = unknown>(obj: any) => obj is Signal<T>
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/state/signal.ts)

## jsx

```typescript
jsx: <T extends string | FunctionComponent<any>>(
  type: T,
  props: T extends FunctionComponent<infer PROPS extends Record<any, any>>
    ? PROPS
    : Record<any, unknown>,
  key?: string | number | null,
) => JSXNode<T>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/jsx-runtime.ts)

## JSX

```typescript
namespace JSX
```

| Interface                                                   | Description |
| ----------------------------------------------------------- | ----------- |
| [Element](#h-jsx-element)                                   |             |
| [ElementChildrenAttribute](#h-jsx-elementchildrenattribute) |             |
| [IntrinsicAttributes](#h-jsx-intrinsicattributes)           |             |
| [IntrinsicElements](#h-jsx-intrinsicelements)               |             |

## JSXChildren

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

**References:** [JSXChildren](#jsxchildren), [Signal](#signal), [JSXNode](#jsxnode)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-attributes.ts)

## jsxDEV

```typescript
jsxDEV: <T extends string | FunctionComponent<Record<any, unknown>>>(
  type: T,
  props: T extends FunctionComponent<infer PROPS extends Record<any, any>>
    ? PROPS
    : Record<any, unknown>,
  key: string | number | null | undefined,
  _isStatic: boolean,
  opts: JsxDevOpts,
  _ctx: unknown,
) => JSXNode<T>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/jsx-runtime.ts)

## JSXNode

```typescript
export interface JSXNode<T = string | FunctionComponent>
```

| Property            | Modifiers | Type                                                                                              | Description  |
| ------------------- | --------- | ------------------------------------------------------------------------------------------------- | ------------ |
| [children](#)       |           | [JSXChildren](#jsxchildren) \| null                                                               |              |
| [dev?](#)           |           | [DevJSX](#devjsx)                                                                                 | _(Optional)_ |
| [flags](#)          |           | number                                                                                            |              |
| [immutableProps](#) |           | Record&lt;any, unknown&gt; \| null                                                                |              |
| [key](#)            |           | string \| null                                                                                    |              |
| [props](#)          |           | T extends [FunctionComponent](#functioncomponent)&lt;infer B&gt; ? B : Record&lt;any, unknown&gt; |              |
| [type](#)           |           | T                                                                                                 |              |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-node.ts)

## JSXTagName

```typescript
export type JSXTagName =
  | keyof HTMLElementTagNameMap
  | Omit<string, keyof HTMLElementTagNameMap>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-attributes.ts)

## KeygenHTMLAttributes

> Warning: This API is now obsolete.
>
> in html5

```typescript
export interface KeygenHTMLAttributes<T extends Element> extends Attrs<'base', T>
```

**Extends:** Attrs&lt;'base', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## KnownEventNames

The names of events that Qwik knows about. They are all lowercase, but on the JSX side, they are PascalCase for nicer DX. (`onAuxClick$` vs `onauxclick$`)

```typescript
export type KnownEventNames = LiteralUnion<AllEventKeys, string>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts)

## LabelHTMLAttributes

```typescript
export interface LabelHTMLAttributes<T extends Element> extends Attrs<'label', T>
```

**Extends:** Attrs&lt;'label', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## LiHTMLAttributes

```typescript
export interface LiHTMLAttributes<T extends Element> extends Attrs<'li', T>
```

**Extends:** Attrs&lt;'li', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## LinkHTMLAttributes

```typescript
export interface LinkHTMLAttributes<T extends Element> extends Attrs<'link', T>
```

**Extends:** Attrs&lt;'link', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## MapHTMLAttributes

```typescript
export interface MapHTMLAttributes<T extends Element> extends Attrs<'map', T>
```

**Extends:** Attrs&lt;'map', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## MediaHTMLAttributes

```typescript
export interface MediaHTMLAttributes<T extends Element> extends HTMLAttributes<T>, Augmented<HTMLMediaElement, {
    crossOrigin?: HTMLCrossOriginAttribute;
}>
```

**Extends:** [HTMLAttributes](#htmlattributes)&lt;T&gt;, Augmented&lt;HTMLMediaElement, { crossOrigin?: [HTMLCrossOriginAttribute](#htmlcrossoriginattribute); }&gt;

| Property          | Modifiers | Type                                                  | Description  |
| ----------------- | --------- | ----------------------------------------------------- | ------------ |
| [crossOrigin?](#) |           | [HTMLCrossOriginAttribute](#htmlcrossoriginattribute) | _(Optional)_ |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## MenuHTMLAttributes

```typescript
export interface MenuHTMLAttributes<T extends Element> extends Attrs<'menu', T>
```

**Extends:** Attrs&lt;'menu', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## MetaHTMLAttributes

```typescript
export interface MetaHTMLAttributes<T extends Element> extends Attrs<'meta', T>
```

**Extends:** Attrs&lt;'meta', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## MeterHTMLAttributes

```typescript
export interface MeterHTMLAttributes<T extends Element> extends Attrs<'meter', T>
```

**Extends:** Attrs&lt;'meter', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## NativeAnimationEvent

> Warning: This API is now obsolete.
>
> Use `AnimationEvent` and use the second argument to the handler function for the current event target

```typescript
export type NativeAnimationEvent = AnimationEvent;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts)

## NativeClipboardEvent

> Warning: This API is now obsolete.
>
> Use `ClipboardEvent` and use the second argument to the handler function for the current event target

```typescript
export type NativeClipboardEvent = ClipboardEvent;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts)

## NativeCompositionEvent

> Warning: This API is now obsolete.
>
> Use `CompositionEvent` and use the second argument to the handler function for the current event target

```typescript
export type NativeCompositionEvent = CompositionEvent;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts)

## NativeDragEvent

> Warning: This API is now obsolete.
>
> Use `DragEvent` and use the second argument to the handler function for the current event target

```typescript
export type NativeDragEvent = DragEvent;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts)

## NativeFocusEvent

> Warning: This API is now obsolete.
>
> Use `FocusEvent` and use the second argument to the handler function for the current event target

```typescript
export type NativeFocusEvent = FocusEvent;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts)

## NativeKeyboardEvent

> Warning: This API is now obsolete.
>
> Use `KeyboardEvent` and use the second argument to the handler function for the current event target

```typescript
export type NativeKeyboardEvent = KeyboardEvent;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts)

## NativeMouseEvent

> Warning: This API is now obsolete.
>
> Use `MouseEvent` and use the second argument to the handler function for the current event target

```typescript
export type NativeMouseEvent = MouseEvent;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts)

## NativePointerEvent

> Warning: This API is now obsolete.
>
> Use `PointerEvent` and use the second argument to the handler function for the current event target

```typescript
export type NativePointerEvent = PointerEvent;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts)

## NativeTouchEvent

> Warning: This API is now obsolete.
>
> Use `TouchEvent` and use the second argument to the handler function for the current event target

```typescript
export type NativeTouchEvent = TouchEvent;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts)

## NativeTransitionEvent

> Warning: This API is now obsolete.
>
> Use `TransitionEvent` and use the second argument to the handler function for the current event target

```typescript
export type NativeTransitionEvent = TransitionEvent;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts)

## NativeUIEvent

> Warning: This API is now obsolete.
>
> Use `UIEvent` and use the second argument to the handler function for the current event target

```typescript
export type NativeUIEvent = UIEvent;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts)

## NativeWheelEvent

> Warning: This API is now obsolete.
>
> Use `WheelEvent` and use the second argument to the handler function for the current event target

```typescript
export type NativeWheelEvent = WheelEvent;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts)

## noSerialize

Marks a property on a store as non-serializable.

At times it is necessary to store values on a store that are non-serializable. Normally this is a runtime error as Store wants to eagerly report when a non-serializable property is assigned to it.

You can use `noSerialize()` to mark a value as non-serializable. The value is persisted in the Store but does not survive serialization. The implication is that when your application is resumed, the value of this object will be `undefined`. You will be responsible for recovering from this.

See: [noSerialize Tutorial](http://qwik.builder.io/tutorial/store/no-serialize)

```typescript
noSerialize: <T extends object | undefined>(input: T) => NoSerialize<T>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/state/common.ts)

## NoSerialize

Marks a property on a store as non-serializable.

At times it is necessary to store values on a store that are non-serializable. Normally this is a runtime error as Store wants to eagerly report when a non-serializable property is assigned to it.

You can use `noSerialize()` to mark a value as non-serializable. The value is persisted in the Store but does not survive serialization. The implication is that when your application is resumed, the value of this object will be `undefined`. You will be responsible for recovering from this.

See: [noSerialize Tutorial](http://qwik.builder.io/tutorial/store/no-serialize)

```typescript
noSerialize: <T extends object | undefined>(input: T) => NoSerialize<T>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/state/common.ts)

## Numberish

```typescript
export type Numberish = number | `${number}`;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## ObjectHTMLAttributes

```typescript
export interface ObjectHTMLAttributes<T extends Element> extends Attrs<'object', T>
```

**Extends:** Attrs&lt;'object', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## OlHTMLAttributes

```typescript
export interface OlHTMLAttributes<T extends Element> extends Attrs<'ol', T>
```

**Extends:** Attrs&lt;'ol', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## OnRenderFn

```typescript
export type OnRenderFn<PROPS extends Record<any, any>> = (
  props: PROPS,
) => JSXNode | null;
```

**References:** [JSXNode](#jsxnode)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/component/component.public.ts)

## OnVisibleTaskOptions

```typescript
export interface OnVisibleTaskOptions
```

| Property       | Modifiers | Type                                        | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------- | --------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [strategy?](#) |           | [VisibleTaskStrategy](#visibletaskstrategy) | <p>_(Optional)_ The strategy to use to determine when the "VisibleTask" should first execute.</p><p>- <code>intersection-observer</code>: the task will first execute when the element is visible in the viewport, under the hood it uses the IntersectionObserver API. - <code>document-ready</code>: the task will first execute when the document is ready, under the hood it uses the document <code>load</code> event. - <code>document-idle</code>: the task will first execute when the document is idle, under the hood it uses the requestIdleCallback API.</p> |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts)

## OptgroupHTMLAttributes

```typescript
export interface OptgroupHTMLAttributes<T extends Element> extends Attrs<'optgroup', T>
```

**Extends:** Attrs&lt;'optgroup', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## OptionHTMLAttributes

```typescript
export interface OptionHTMLAttributes<T extends Element> extends Attrs<'option', T>
```

**Extends:** Attrs&lt;'option', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## OutputHTMLAttributes

```typescript
export interface OutputHTMLAttributes<T extends Element> extends Attrs<'output', T>
```

**Extends:** Attrs&lt;'output', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## ParamHTMLAttributes

> Warning: This API is now obsolete.
>
> Old DOM API

```typescript
export interface ParamHTMLAttributes<T extends Element> extends Attrs<'base', T, HTMLParamElement>
```

**Extends:** Attrs&lt;'base', T, HTMLParamElement&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## ProgressHTMLAttributes

```typescript
export interface ProgressHTMLAttributes<T extends Element> extends Attrs<'progress', T>
```

**Extends:** Attrs&lt;'progress', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## PropFnInterface

```typescript
export type PropFnInterface<ARGS extends any[], RET> = {
  __qwik_serializable__?: any;
  (...args: ARGS): Promise<RET>;
};
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/qrl/qrl.public.ts)

## PropFunction

```typescript
export type PropFunction<T extends Function = (...args: any) => any> =
  T extends (...args: infer ARGS) => infer RET
    ? PropFnInterface<ARGS, Awaited<RET>>
    : never;
```

**References:** [PropFnInterface](#propfninterface)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/qrl/qrl.public.ts)

## PropFunctionProps

```typescript
export type PropFunctionProps<PROPS extends Record<any, any>> = {
  [K in keyof PROPS]: PROPS[K] extends undefined
    ? PROPS[K]
    : PROPS[K] extends ((...args: infer ARGS) => infer RET) | undefined
      ? PropFnInterface<ARGS, Awaited<RET>>
      : PROPS[K];
};
```

**References:** [PropFnInterface](#propfninterface)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/component/component.public.ts)

## PropsOf

Infers `Props` from the component.

```typescript
export const OtherComponent = component$(() => {
  return $(() => <Counter value={100} />);
});
```

```typescript
export type PropsOf<COMP> = COMP extends Component<infer PROPS>
  ? NonNullable<PROPS>
  : COMP extends FunctionComponent<infer PROPS>
    ? NonNullable<PublicProps<PROPS>>
    : COMP extends string
      ? QwikIntrinsicElements[COMP]
      : Record<string, unknown>;
```

**References:** [Component](#component), [FunctionComponent](#functioncomponent), [PublicProps](#publicprops), [QwikIntrinsicElements](#qwikintrinsicelements)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/component/component.public.ts)

## PublicProps

Extends the defined component PROPS, adding the default ones (children and q:slot)..

```typescript
export type PublicProps<PROPS extends Record<any, any>> =
  TransformProps<PROPS> & ComponentBaseProps & ComponentChildren<PROPS>;
```

**References:** [ComponentBaseProps](#componentbaseprops)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/component/component.public.ts)

## qrl

Used by Qwik Optimizer to point to lazy-loaded resources.

This function should be used by the Qwik Optimizer only. The function should not be directly referred to in the source code of the application.

```typescript
qrl: <T = any>(
  chunkOrFn: string | (() => Promise<any>),
  symbol: string,
  lexicalScopeCapture?: any[],
  stackOffset?: number,
) => QRL<T>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/qrl/qrl.ts)

## QRL

Used by Qwik Optimizer to point to lazy-loaded resources.

This function should be used by the Qwik Optimizer only. The function should not be directly referred to in the source code of the application.

```typescript
qrl: <T = any>(
  chunkOrFn: string | (() => Promise<any>),
  symbol: string,
  lexicalScopeCapture?: any[],
  stackOffset?: number,
) => QRL<T>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/qrl/qrl.public.ts)

## QuoteHTMLAttributes

```typescript
export interface QuoteHTMLAttributes<T extends Element> extends Attrs<'q', T>
```

**Extends:** Attrs&lt;'q', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## QwikAnimationEvent

> Warning: This API is now obsolete.
>
> Use `AnimationEvent` and use the second argument to the handler function for the current event target

```typescript
export type QwikAnimationEvent<T = Element> = NativeAnimationEvent;
```

**References:** [NativeAnimationEvent](#nativeanimationevent)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts)

## QwikChangeEvent

> Warning: This API is now obsolete.
>
> Use `Event` and use the second argument to the handler function for the current event target. Also note that in Qwik, onInput$ with the InputEvent is the event that behaves like onChange in React.

```typescript
export type QwikChangeEvent<T = Element> = Event;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts)

## QwikClipboardEvent

> Warning: This API is now obsolete.
>
> Use `ClipboardEvent` and use the second argument to the handler function for the current event target

```typescript
export type QwikClipboardEvent<T = Element> = NativeClipboardEvent;
```

**References:** [NativeClipboardEvent](#nativeclipboardevent)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts)

## QwikCompositionEvent

> Warning: This API is now obsolete.
>
> Use `CompositionEvent` and use the second argument to the handler function for the current event target

```typescript
export type QwikCompositionEvent<T = Element> = NativeCompositionEvent;
```

**References:** [NativeCompositionEvent](#nativecompositionevent)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts)

## QwikDOMAttributes

```typescript
export interface QwikDOMAttributes extends DOMAttributes<Element>
```

**Extends:** [DOMAttributes](#domattributes)&lt;Element&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik.ts)

## QwikDragEvent

> Warning: This API is now obsolete.
>
> Use `DragEvent` and use the second argument to the handler function for the current event target

```typescript
export type QwikDragEvent<T = Element> = NativeDragEvent;
```

**References:** [NativeDragEvent](#nativedragevent)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts)

## QwikFocusEvent

> Warning: This API is now obsolete.
>
> Use `FocusEvent` and use the second argument to the handler function for the current event target

```typescript
export type QwikFocusEvent<T = Element> = NativeFocusEvent;
```

**References:** [NativeFocusEvent](#nativefocusevent)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts)

## QwikHTMLElements

The DOM props without plain handlers, for use inside functions

```typescript
export type QwikHTMLElements = {
  [tag in keyof HTMLElementTagNameMap]: Augmented<
    HTMLElementTagNameMap[tag],
    SpecialAttrs[tag]
  > &
    HTMLElementAttrs &
    QwikAttributes<HTMLElementTagNameMap[tag]>;
} & {
  [unknownTag: string]: {
    [prop: string]: any;
  } & HTMLElementAttrs &
    QwikAttributes<any>;
};
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## QwikIdleEvent

Emitted by qwik-loader on document when the document first becomes idle

```typescript
export type QwikIdleEvent = CustomEvent<{}>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts)

## QwikInitEvent

Emitted by qwik-loader on document when the document first becomes interactive

```typescript
export type QwikInitEvent = CustomEvent<{}>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts)

## QwikIntrinsicElements

The interface holds available attributes of both native DOM elements and custom Qwik elements. An example showing how to define a customizable wrapper component:

```tsx
import { component$, Slot, type QwikIntrinsicElements } from "@builder.io/qwik";

type WrapperProps = {
  attributes?: QwikIntrinsicElements["div"];
};

export default component$<WrapperProps>(({ attributes }) => {
  return (
    <div {...attributes} class="p-2">
      <Slot />
    </div>
  );
});
```

Note: It is shorter to use `PropsOf<'div'>`

```typescript
export interface QwikIntrinsicElements extends QwikHTMLElements, QwikSVGElements
```

**Extends:** [QwikHTMLElements](#qwikhtmlelements), [QwikSVGElements](#qwiksvgelements)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-elements.ts)

## QwikInvalidEvent

> Warning: This API is now obsolete.
>
> Use `Event` and use the second argument to the handler function for the current event target

```typescript
export type QwikInvalidEvent<T = Element> = Event;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts)

## QwikJSX

```typescript
export declare namespace QwikJSX
```

| Interface                     | Description |
| ----------------------------- | ----------- |
| [Element](#)                  |             |
| [ElementChildrenAttribute](#) |             |
| [IntrinsicAttributes](#)      |             |
| [IntrinsicElements](#)        |             |

| Type Alias                          | Description |
| ----------------------------------- | ----------- |
| [ElementType](#qwikjsx-elementtype) |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik.ts)

## QwikKeyboardEvent

> Warning: This API is now obsolete.
>
> Use `KeyboardEvent` and use the second argument to the handler function for the current event target

```typescript
export type QwikKeyboardEvent<T = Element> = NativeKeyboardEvent;
```

**References:** [NativeKeyboardEvent](#nativekeyboardevent)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts)

## QwikMouseEvent

> Warning: This API is now obsolete.
>
> Use `MouseEvent` and use the second argument to the handler function for the current event target

```typescript
export type QwikMouseEvent<T = Element, E = NativeMouseEvent> = E;
```

**References:** [NativeMouseEvent](#nativemouseevent)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts)

## QwikPointerEvent

> Warning: This API is now obsolete.
>
> Use `PointerEvent` and use the second argument to the handler function for the current event target

```typescript
export type QwikPointerEvent<T = Element> = NativePointerEvent;
```

**References:** [NativePointerEvent](#nativepointerevent)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts)

## QwikSubmitEvent

> Warning: This API is now obsolete.
>
> Use `SubmitEvent` and use the second argument to the handler function for the current event target

```typescript
export type QwikSubmitEvent<T = Element> = SubmitEvent;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts)

## QwikSVGElements

The SVG props without plain handlers, for use inside functions

```typescript
export type QwikSVGElements = {
  [K in keyof Omit<
    SVGElementTagNameMap,
    keyof HTMLElementTagNameMap
  >]: SVGProps<SVGElementTagNameMap[K]>;
};
```

**References:** [SVGProps](#svgprops)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## QwikSymbolEvent

Emitted by qwik-loader when a module was lazily loaded

```typescript
export type QwikSymbolEvent = CustomEvent<{
  symbol: string;
  element: Element;
  reqTime: number;
}>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts)

## QwikTouchEvent

> Warning: This API is now obsolete.
>
> Use `TouchEvent` and use the second argument to the handler function for the current event target

```typescript
export type QwikTouchEvent<T = Element> = NativeTouchEvent;
```

**References:** [NativeTouchEvent](#nativetouchevent)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts)

## QwikTransitionEvent

> Warning: This API is now obsolete.
>
> Use `TransitionEvent` and use the second argument to the handler function for the current event target

```typescript
export type QwikTransitionEvent<T = Element> = NativeTransitionEvent;
```

**References:** [NativeTransitionEvent](#nativetransitionevent)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts)

## QwikUIEvent

> Warning: This API is now obsolete.
>
> Use `UIEvent` and use the second argument to the handler function for the current event target

```typescript
export type QwikUIEvent<T = Element> = NativeUIEvent;
```

**References:** [NativeUIEvent](#nativeuievent)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts)

## QwikVisibleEvent

Emitted by qwik-loader when an element becomes visible. Used by `useVisibleTask$`

```typescript
export type QwikVisibleEvent = CustomEvent<IntersectionObserverEntry>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts)

## QwikWheelEvent

> Warning: This API is now obsolete.
>
> Use `WheelEvent` and use the second argument to the handler function for the current event target

```typescript
export type QwikWheelEvent<T = Element> = NativeWheelEvent;
```

**References:** [NativeWheelEvent](#nativewheelevent)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts)

## ReadonlySignal

```typescript
export type ReadonlySignal<T = unknown> = Readonly<Signal<T>>;
```

**References:** [Signal](#signal)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/state/signal.ts)

## render

Render JSX.

Use this method to render JSX. This function does reconciling which means it always tries to reuse what is already in the DOM (rather then destroy and recreate content.) It returns a cleanup function you could use for cleaning up subscriptions.

```typescript
render: (
  parent: Element | Document,
  jsxNode: JSXNode | FunctionComponent<any>,
  opts?: RenderOptions,
) => Promise<RenderResult>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/dom/render.public.ts)

## RenderOnce

```typescript
RenderOnce: FunctionComponent<{
  children?: unknown;
  key?: string | number | null | undefined;
}>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/jsx-runtime.ts)

## RenderOptions

```typescript
export interface RenderOptions
```

| Property         | Modifiers | Type                      | Description  |
| ---------------- | --------- | ------------------------- | ------------ |
| [serverData?](#) |           | Record&lt;string, any&gt; | _(Optional)_ |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/dom/render.public.ts)

## RenderResult

```typescript
export interface RenderResult
```

| Method                             | Description |
| ---------------------------------- | ----------- |
| [cleanup()](#renderresult-cleanup) |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/dom/render.public.ts)

## RenderSSROptions

```typescript
export interface RenderSSROptions
```

| Property                 | Modifiers | Type                                                                                                                                                            | Description  |
| ------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| [base?](#)               |           | string                                                                                                                                                          | _(Optional)_ |
| [beforeClose?](#)        |           | (contexts: QContext[], containerState: ContainerState, containsDynamic: boolean, textNodes: Map&lt;string, string&gt;) =&gt; Promise&lt;[JSXNode](#jsxnode)&gt; | _(Optional)_ |
| [beforeContent?](#)      |           | [JSXNode](#jsxnode)&lt;string&gt;[]                                                                                                                             | _(Optional)_ |
| [containerAttributes](#) |           | Record&lt;string, string&gt;                                                                                                                                    |              |
| [containerTagName](#)    |           | string                                                                                                                                                          |              |
| [manifestHash](#)        |           | string                                                                                                                                                          |              |
| [serverData?](#)         |           | Record&lt;string, any&gt;                                                                                                                                       | _(Optional)_ |
| [stream](#)              |           | [StreamWriter](#streamwriter)                                                                                                                                   |              |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/ssr/render-ssr.ts)

## Resource

This method works like an async memoized function that runs whenever some tracked value changes and returns some data.

`useResource` however returns immediate a `ResourceReturn` object that contains the data and a state that indicates if the data is available or not.

The status can be one of the following:

- 'pending' - the data is not yet available. - 'resolved' - the data is available. - 'rejected' - the data is not available due to an error or timeout.

### Example

Example showing how `useResource` to perform a fetch to request the weather, whenever the input city name changes.

```tsx
const Cmp = component$(() => {
  const cityS = useSignal("");

  const weatherResource = useResource$(async ({ track, cleanup }) => {
    const cityName = track(cityS);
    const abortController = new AbortController();
    cleanup(() => abortController.abort("cleanup"));
    const res = await fetch(`http://weatherdata.com?city=${cityName}`, {
      signal: abortController.signal,
    });
    const data = await res.json();
    return data as { temp: number };
  });

  return (
    <div>
      <input name="city" bind:value={cityS} />
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

```typescript
Resource: <T>(props: ResourceProps<T>) => JSXNode;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-resource.ts)

## ResourceCtx

```typescript
export interface ResourceCtx<T>
```

| Property      | Modifiers             | Type                | Description |
| ------------- | --------------------- | ------------------- | ----------- |
| [previous](#) | <code>readonly</code> | T \| undefined      |             |
| [track](#)    | <code>readonly</code> | [Tracker](#tracker) |             |

| Method                                            | Description |
| ------------------------------------------------- | ----------- |
| [cache(policyOrMilliseconds)](#resourcectx-cache) |             |
| [cleanup(callback)](#)                            |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts)

## ResourceFn

```typescript
export type ResourceFn<T> = (ctx: ResourceCtx<unknown>) => ValueOrPromise<T>;
```

**References:** [ResourceCtx](#resourcectx), [ValueOrPromise](#valueorpromise)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts)

## ResourceOptions

Options to pass to `useResource$()`

```typescript
export interface ResourceOptions
```

| Property      | Modifiers | Type   | Description                                                                                                                                         |
| ------------- | --------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| [timeout?](#) |           | number | _(Optional)_ Timeout in milliseconds. If the resource takes more than the specified millisecond, it will timeout. Resulting on a rejected resource. |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-resource.ts)

## ResourcePending

```typescript
export interface ResourcePending<T>
```

| Property     | Modifiers             | Type             | Description |
| ------------ | --------------------- | ---------------- | ----------- |
| [loading](#) | <code>readonly</code> | boolean          |             |
| [value](#)   | <code>readonly</code> | Promise&lt;T&gt; |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts)

## ResourceProps

```typescript
export interface ResourceProps<T>
```

| Property         | Modifiers             | Type                                                                                                             | Description  |
| ---------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------ |
| [onPending?](#)  |                       | () =&gt; [JSXNode](#jsxnode)                                                                                     | _(Optional)_ |
| [onRejected?](#) |                       | (reason: Error) =&gt; [JSXNode](#jsxnode)                                                                        | _(Optional)_ |
| [onResolved](#)  |                       | (value: T) =&gt; [JSXNode](#jsxnode)                                                                             |              |
| [value](#)       | <code>readonly</code> | [ResourceReturn](#resourcereturn)&lt;T&gt; \| [Signal](#signal)&lt;Promise&lt;T&gt; \| T&gt; \| Promise&lt;T&gt; |              |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-resource.ts)

## ResourceRejected

```typescript
export interface ResourceRejected<T>
```

| Property     | Modifiers             | Type             | Description |
| ------------ | --------------------- | ---------------- | ----------- |
| [loading](#) | <code>readonly</code> | boolean          |             |
| [value](#)   | <code>readonly</code> | Promise&lt;T&gt; |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts)

## ResourceResolved

```typescript
export interface ResourceResolved<T>
```

| Property     | Modifiers             | Type             | Description |
| ------------ | --------------------- | ---------------- | ----------- |
| [loading](#) | <code>readonly</code> | boolean          |             |
| [value](#)   | <code>readonly</code> | Promise&lt;T&gt; |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts)

## ResourceReturn

```typescript
export type ResourceReturn<T> =
  | ResourcePending<T>
  | ResourceResolved<T>
  | ResourceRejected<T>;
```

**References:** [ResourcePending](#resourcepending), [ResourceResolved](#resourceresolved), [ResourceRejected](#resourcerejected)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts)

## ScriptHTMLAttributes

```typescript
export interface ScriptHTMLAttributes<T extends Element> extends Attrs<'script', T>
```

**Extends:** Attrs&lt;'script', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## SelectHTMLAttributes

```typescript
export interface SelectHTMLAttributes<T extends Element> extends Attrs<'select', T>
```

**Extends:** Attrs&lt;'select', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## setPlatform

Sets the `CorePlatform`.

This is useful to override the platform in tests to change the behavior of, `requestAnimationFrame`, and import resolution.

```typescript
setPlatform: (plt: CorePlatform) => CorePlatform;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/platform/platform.ts)

## Signal

```typescript
export interface Signal<T = any>
```

| Property   | Modifiers | Type | Description |
| ---------- | --------- | ---- | ----------- |
| [value](#) |           | T    |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/state/signal.ts)

## Size

```typescript
export type Size = number | string;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## SkipRender

```typescript
SkipRender: JSXNode;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/utils.public.ts)

## Slot

Allows to project the children of the current component. <Slot/> can only be used within the context of a component defined with `component$`.

```typescript
Slot: FunctionComponent<{
  name?: string;
}>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/slot.public.ts)

## SlotHTMLAttributes

```typescript
export interface SlotHTMLAttributes<T extends Element> extends Attrs<'slot', T>
```

**Extends:** Attrs&lt;'slot', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## SnapshotListener

```typescript
export interface SnapshotListener
```

| Property | Modifiers | Type                   | Description |
| -------- | --------- | ---------------------- | ----------- |
| [el](#)  |           | Element                |             |
| [key](#) |           | string                 |             |
| [qrl](#) |           | [QRL](#qrl)&lt;any&gt; |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/container/container.ts)

## SnapshotMeta

```typescript
export type SnapshotMeta = Record<string, SnapshotMetaValue>;
```

**References:** [SnapshotMetaValue](#snapshotmetavalue)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/container/container.ts)

## SnapshotMetaValue

```typescript
export interface SnapshotMetaValue
```

| Property | Modifiers | Type   | Description  |
| -------- | --------- | ------ | ------------ |
| [c?](#)  |           | string | _(Optional)_ |
| [h?](#)  |           | string | _(Optional)_ |
| [s?](#)  |           | string | _(Optional)_ |
| [w?](#)  |           | string | _(Optional)_ |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/container/container.ts)

## SnapshotResult

```typescript
export interface SnapshotResult
```

| Property       | Modifiers | Type                                | Description |
| -------------- | --------- | ----------------------------------- | ----------- |
| [funcs](#)     |           | string[]                            |             |
| [mode](#)      |           | 'render' \| 'listeners' \| 'static' |             |
| [objs](#)      |           | any[]                               |             |
| [qrls](#)      |           | [QRL](#qrl)[]                       |             |
| [resources](#) |           | ResourceReturnInternal&lt;any&gt;[] |             |
| [state](#)     |           | [SnapshotState](#snapshotstate)     |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/container/container.ts)

## SnapshotState

```typescript
export interface SnapshotState
```

| Property  | Modifiers | Type                          | Description |
| --------- | --------- | ----------------------------- | ----------- |
| [ctx](#)  |           | [SnapshotMeta](#snapshotmeta) |             |
| [objs](#) |           | any[]                         |             |
| [refs](#) |           | Record&lt;string, string&gt;  |             |
| [subs](#) |           | any[]                         |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/container/container.ts)

## SourceHTMLAttributes

```typescript
export interface SourceHTMLAttributes<T extends Element> extends Attrs<'source', T>
```

**Extends:** Attrs&lt;'source', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## SSRComment

```typescript
SSRComment: FunctionComponent<{
  data: string;
}>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/utils.public.ts)

## SSRHint

> Warning: This API is now obsolete.
>
> - It has no effect

```typescript
SSRHint: FunctionComponent<SSRHintProps>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/utils.public.ts)

## SSRHintProps

```typescript
export type SSRHintProps = {
  dynamic?: boolean;
};
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/utils.public.ts)

## SSRRaw

```typescript
SSRRaw: FunctionComponent<{
  data: string;
}>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/utils.public.ts)

## SSRStream

```typescript
SSRStream: FunctionComponent<SSRStreamProps>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/utils.public.ts)

## SSRStreamBlock

```typescript
SSRStreamBlock: FunctionComponent<{
  children?: any;
}>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/utils.public.ts)

## SSRStreamProps

```typescript
export type SSRStreamProps = {
  children:
    | AsyncGenerator<JSXChildren, void, any>
    | ((stream: StreamWriter) => Promise<void>)
    | (() => AsyncGenerator<JSXChildren, void, any>);
};
```

**References:** [JSXChildren](#jsxchildren), [StreamWriter](#streamwriter)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/utils.public.ts)

## StreamWriter

```typescript
export type StreamWriter = {
  write: (chunk: string) => void;
};
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/ssr/render-ssr.ts)

## StyleHTMLAttributes

```typescript
export interface StyleHTMLAttributes<T extends Element> extends Attrs<'style', T>
```

**Extends:** Attrs&lt;'style', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## SVGAttributes

The TS types don't include the SVG attributes so we have to define them ourselves

NOTE: These props are probably not complete

```typescript
export interface SVGAttributes<T extends Element = Element> extends AriaAttributes
```

**Extends:** [AriaAttributes](#ariaattributes)

| Property                                           | Modifiers | Type                                                                                                                                                                                                                | Description  |
| -------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| ["accent-height"?](#)                              |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["alignment-baseline"?](#)                         |           | 'auto' \| 'baseline' \| 'before-edge' \| 'text-before-edge' \| 'middle' \| 'central' \| 'after-edge' \| 'text-after-edge' \| 'ideographic' \| 'alphabetic' \| 'hanging' \| 'mathematical' \| 'inherit' \| undefined | _(Optional)_ |
| ["arabic-form"?](#)                                |           | 'initial' \| 'medial' \| 'terminal' \| 'isolated' \| undefined                                                                                                                                                      | _(Optional)_ |
| ["baseline-shift"?](#)                             |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["cap-height"?](#)                                 |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["clip-path"?](#)                                  |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| ["clip-rule"?](#)                                  |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["color-interpolation-filters"?](#)                |           | 'auto' \| 's-rGB' \| 'linear-rGB' \| 'inherit' \| undefined                                                                                                                                                         | _(Optional)_ |
| ["color-interpolation"?](#)                        |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["color-profile"?](#)                              |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["color-rendering"?](#)                            |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["dominant-baseline"?](#)                          |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["edge-mode"?](#)                                  |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["enable-background"?](#)                          |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["fill-opacity"?](#)                               |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["fill-rule"?](#)                                  |           | 'nonzero' \| 'evenodd' \| 'inherit' \| undefined                                                                                                                                                                    | _(Optional)_ |
| ["flood-color"?](#)                                |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["flood-opacity"?](#)                              |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["font-family"?](#)                                |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| ["font-size-adjust"?](#)                           |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["font-size"?](#)                                  |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["font-stretch"?](#)                               |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["font-style"?](#)                                 |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["font-variant"?](#)                               |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["font-weight"?](#)                                |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["glyph-name"?](#)                                 |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["glyph-orientation-horizontal"?](#)               |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["glyph-orientation-vertical"?](#)                 |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["horiz-adv-x"?](#)                                |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["horiz-origin-x"?](#)                             |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["image-rendering"?](#)                            |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["letter-spacing"?](#)                             |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["lighting-color"?](#)                             |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["marker-end"?](#)                                 |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| ["marker-mid"?](#)                                 |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| ["marker-start"?](#)                               |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| ["overline-position"?](#)                          |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["overline-thickness"?](#)                         |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["paint-order"?](#)                                |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["pointer-events"?](#)                             |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["rendering-intent"?](#)                           |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["shape-rendering"?](#)                            |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["stop-color"?](#)                                 |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| ["stop-opacity"?](#)                               |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["strikethrough-position"?](#)                     |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["strikethrough-thickness"?](#)                    |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["stroke-dasharray"?](#)                           |           | string \| number \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["stroke-dashoffset"?](#)                          |           | string \| number \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["stroke-linecap"?](#)                             |           | 'butt' \| 'round' \| 'square' \| 'inherit' \| undefined                                                                                                                                                             | _(Optional)_ |
| ["stroke-linejoin"?](#)                            |           | 'miter' \| 'round' \| 'bevel' \| 'inherit' \| undefined                                                                                                                                                             | _(Optional)_ |
| ["stroke-miterlimit"?](#)                          |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| ["stroke-opacity"?](#)                             |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["stroke-width"?](#)                               |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["text-anchor"?](#)                                |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| ["text-decoration"?](#)                            |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["text-rendering"?](#)                             |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["underline-position"?](#)                         |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["underline-thickness"?](#)                        |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["unicode-bidi"?](#)                               |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["unicode-range"?](#)                              |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["units-per-em"?](#)                               |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["v-alphabetic"?](#)                               |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["v-hanging"?](#)                                  |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["v-ideographic"?](#)                              |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["v-mathematical"?](#)                             |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["vector-effect"?](#)                              |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["vert-adv-y"?](#)                                 |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["vert-origin-x"?](#)                              |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["vert-origin-y"?](#)                              |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["word-spacing"?](#)                               |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["writing-mode"?](#)                               |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["x-channel-selector"?](#)                         |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| ["x-height"?](#)                                   |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| ["xlink:actuate"?](#svgattributes-_xlink_actuate_) |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| ["xlink:arcrole"?](#svgattributes-_xlink_arcrole_) |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| ["xlink:href"?](#svgattributes-_xlink_href_)       |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| ["xlink:role"?](#svgattributes-_xlink_role_)       |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| ["xlink:show"?](#svgattributes-_xlink_show_)       |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| ["xlink:title"?](#svgattributes-_xlink_title_)     |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| ["xlink:type"?](#svgattributes-_xlink_type_)       |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| ["xml:base"?](#svgattributes-_xml_base_)           |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| ["xml:lang"?](#svgattributes-_xml_lang_)           |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| ["xml:space"?](#svgattributes-_xml_space_)         |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| ["xmlns:xlink"?](#svgattributes-_xmlns_xlink_)     |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [accumulate?](#)                                   |           | 'none' \| 'sum' \| undefined                                                                                                                                                                                        | _(Optional)_ |
| [additive?](#)                                     |           | 'replace' \| 'sum' \| undefined                                                                                                                                                                                     | _(Optional)_ |
| [allowReorder?](#)                                 |           | 'no' \| 'yes' \| undefined                                                                                                                                                                                          | _(Optional)_ |
| [alphabetic?](#)                                   |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [amplitude?](#)                                    |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [ascent?](#)                                       |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [attributeName?](#)                                |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [attributeType?](#)                                |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [autoReverse?](#)                                  |           | [Booleanish](#booleanish) \| undefined                                                                                                                                                                              | _(Optional)_ |
| [azimuth?](#)                                      |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [baseFrequency?](#)                                |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [baseProfile?](#)                                  |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [bbox?](#)                                         |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [begin?](#)                                        |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [bias?](#)                                         |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [by?](#)                                           |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [calcMode?](#)                                     |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [clip?](#)                                         |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [clipPathUnits?](#)                                |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [color?](#)                                        |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [contentScriptType?](#)                            |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [contentStyleType?](#)                             |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [crossOrigin?](#)                                  |           | [HTMLCrossOriginAttribute](#htmlcrossoriginattribute)                                                                                                                                                               | _(Optional)_ |
| [cursor?](#)                                       |           | number \| string                                                                                                                                                                                                    | _(Optional)_ |
| [cx?](#)                                           |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [cy?](#)                                           |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [d?](#)                                            |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [decelerate?](#)                                   |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [descent?](#)                                      |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [diffuseConstant?](#)                              |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [direction?](#)                                    |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [display?](#)                                      |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [divisor?](#)                                      |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [dur?](#)                                          |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [dx?](#)                                           |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [dy?](#)                                           |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [elevation?](#)                                    |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [end?](#)                                          |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [exponent?](#)                                     |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [externalResourcesRequired?](#)                    |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [fill?](#)                                         |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [filter?](#)                                       |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [filterRes?](#)                                    |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [filterUnits?](#)                                  |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [focusable?](#)                                    |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [format?](#)                                       |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [fr?](#)                                           |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [from?](#)                                         |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [fx?](#)                                           |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [fy?](#)                                           |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [g1?](#)                                           |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [g2?](#)                                           |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [glyphRef?](#)                                     |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [gradientTransform?](#)                            |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [gradientUnits?](#)                                |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [hanging?](#)                                      |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [height?](#)                                       |           | [Size](#size) \| undefined                                                                                                                                                                                          | _(Optional)_ |
| [href?](#)                                         |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [id?](#)                                           |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [ideographic?](#)                                  |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [in?](#)                                           |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [in2?](#)                                          |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [intercept?](#)                                    |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [k?](#)                                            |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [k1?](#)                                           |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [k2?](#)                                           |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [k3?](#)                                           |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [k4?](#)                                           |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [kernelMatrix?](#)                                 |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [kernelUnitLength?](#)                             |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [kerning?](#)                                      |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [keyPoints?](#)                                    |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [keySplines?](#)                                   |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [keyTimes?](#)                                     |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [lang?](#)                                         |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [lengthAdjust?](#)                                 |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [limitingConeAngle?](#)                            |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [local?](#)                                        |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [markerHeight?](#)                                 |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [markerUnits?](#)                                  |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [markerWidth?](#)                                  |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [mask?](#)                                         |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [maskContentUnits?](#)                             |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [maskUnits?](#)                                    |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [mathematical?](#)                                 |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [max?](#)                                          |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [media?](#)                                        |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [method?](#)                                       |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [min?](#)                                          |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [mode?](#)                                         |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [name?](#)                                         |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [numOctaves?](#)                                   |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [offset?](#)                                       |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [opacity?](#)                                      |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [operator?](#)                                     |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [order?](#)                                        |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [orient?](#)                                       |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [orientation?](#)                                  |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [origin?](#)                                       |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [overflow?](#)                                     |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [panose1?](#)                                      |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [path?](#)                                         |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [pathLength?](#)                                   |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [patternContentUnits?](#)                          |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [patternTransform?](#)                             |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [patternUnits?](#)                                 |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [points?](#)                                       |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [pointsAtX?](#)                                    |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [pointsAtY?](#)                                    |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [pointsAtZ?](#)                                    |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [preserveAlpha?](#)                                |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [preserveAspectRatio?](#)                          |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [primitiveUnits?](#)                               |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [r?](#)                                            |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [radius?](#)                                       |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [refX?](#)                                         |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [refY?](#)                                         |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [repeatCount?](#)                                  |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [repeatDur?](#)                                    |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [requiredextensions?](#)                           |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [requiredFeatures?](#)                             |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [restart?](#)                                      |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [result?](#)                                       |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [role?](#)                                         |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [rotate?](#)                                       |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [rx?](#)                                           |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [ry?](#)                                           |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [scale?](#)                                        |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [seed?](#)                                         |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [slope?](#)                                        |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [spacing?](#)                                      |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [specularConstant?](#)                             |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [specularExponent?](#)                             |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [speed?](#)                                        |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [spreadMethod?](#)                                 |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [startOffset?](#)                                  |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [stdDeviation?](#)                                 |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [stemh?](#)                                        |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [stemv?](#)                                        |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [stitchTiles?](#)                                  |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [string?](#)                                       |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [stroke?](#)                                       |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [style?](#)                                        |           | [CSSProperties](#cssproperties) \| string \| undefined                                                                                                                                                              | _(Optional)_ |
| [surfaceScale?](#)                                 |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [systemLanguage?](#)                               |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [tabindex?](#)                                     |           | number \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [tableValues?](#)                                  |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [target?](#)                                       |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [targetX?](#)                                      |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [targetY?](#)                                      |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [textLength?](#)                                   |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [to?](#)                                           |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [transform?](#)                                    |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [type?](#)                                         |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [u1?](#)                                           |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [u2?](#)                                           |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [unicode?](#)                                      |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [values?](#)                                       |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [version?](#)                                      |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [viewBox?](#)                                      |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [viewTarget?](#)                                   |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [visibility?](#)                                   |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [width?](#)                                        |           | [Size](#size) \| undefined                                                                                                                                                                                          | _(Optional)_ |
| [widths?](#)                                       |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [x?](#)                                            |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [x1?](#)                                           |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [x2?](#)                                           |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [xmlns?](#)                                        |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [y?](#)                                            |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [y1?](#)                                           |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [y2?](#)                                           |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [yChannelSelector?](#)                             |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |
| [z?](#)                                            |           | number \| string \| undefined                                                                                                                                                                                       | _(Optional)_ |
| [zoomAndPan?](#)                                   |           | string \| undefined                                                                                                                                                                                                 | _(Optional)_ |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## SVGProps

```typescript
export interface SVGProps<T extends Element> extends SVGAttributes, QwikAttributes<T>
```

**Extends:** [SVGAttributes](#svgattributes), QwikAttributes&lt;T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## sync$

> This API is provided as an alpha preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

Extract function into a synchronously loadable QRL.

NOTE: Synchronous QRLs functions can't close over any variables, including exports.

```typescript
sync$: <T extends Function>(fn: T) => SyncQRL<T>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/qrl/qrl.public.ts)

## TableHTMLAttributes

```typescript
export interface TableHTMLAttributes<T extends Element> extends Attrs<'table', T>
```

**Extends:** Attrs&lt;'table', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## TaskCtx

```typescript
export interface TaskCtx
```

| Property   | Modifiers | Type                | Description |
| ---------- | --------- | ------------------- | ----------- |
| [track](#) |           | [Tracker](#tracker) |             |

| Method                 | Description |
| ---------------------- | ----------- |
| [cleanup(callback)](#) |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts)

## TaskFn

```typescript
export type TaskFn = (ctx: TaskCtx) => ValueOrPromise<void | (() => void)>;
```

**References:** [TaskCtx](#taskctx), [ValueOrPromise](#valueorpromise)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts)

## TdHTMLAttributes

```typescript
export interface TdHTMLAttributes<T extends Element> extends Attrs<'td', T>
```

**Extends:** Attrs&lt;'td', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## TextareaHTMLAttributes

```typescript
export interface TextareaHTMLAttributes<T extends Element> extends Attrs<'textarea', T>
```

**Extends:** Attrs&lt;'textarea', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## ThHTMLAttributes

```typescript
export interface ThHTMLAttributes<T extends Element> extends Attrs<'tr', T>
```

**Extends:** Attrs&lt;'tr', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## TimeHTMLAttributes

```typescript
export interface TimeHTMLAttributes<T extends Element> extends Attrs<'time', T>
```

**Extends:** Attrs&lt;'time', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## TitleHTMLAttributes

```typescript
export interface TitleHTMLAttributes<T extends Element> extends Attrs<'title', T>
```

**Extends:** Attrs&lt;'title', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## Tracker

Used to signal to Qwik which state should be watched for changes.

The `Tracker` is passed into the `taskFn` of `useTask`. It is intended to be used to wrap state objects in a read proxy which signals to Qwik which properties should be watched for changes. A change to any of the properties causes the `taskFn` to rerun.

### Example

The `obs` passed into the `taskFn` is used to mark `state.count` as a property of interest. Any changes to the `state.count` property will cause the `taskFn` to rerun.

```tsx
const Cmp = component$(() => {
  const store = useStore({ count: 0, doubleCount: 0 });
  const signal = useSignal(0);
  useTask$(({ track }) => {
    // Any signals or stores accessed inside the task will be tracked
    const count = track(() => store.count);
    // You can also pass a signal to track() directly
    const signalCount = track(signal);
    store.doubleCount = count + signalCount;
  });
  return (
    <div>
      <span>
        {store.count} / {store.doubleCount}
      </span>
      <button
        onClick$={() => {
          store.count++;
          signal.value++;
        }}
      >
        +
      </button>
    </div>
  );
});
```

```typescript
export interface Tracker
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts)

## TrackHTMLAttributes

```typescript
export interface TrackHTMLAttributes<T extends Element> extends Attrs<'track', T>
```

**Extends:** Attrs&lt;'track', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## untrack

Don't track listeners for this callback

```typescript
untrack: <T>(fn: () => T) => T;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-core.ts)

## useComputed$

```typescript
useComputed$: Computed;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts)

## useComputedQrl

```typescript
useComputedQrl: ComputedQRL;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts)

## useContext

Retrieve Context value.

Use `useContext()` to retrieve the value of context in a component. To retrieve a value a parent component needs to invoke `useContextProvider()` to assign a value.

### Example

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
    }),
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

```typescript
useContext: UseContext;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-context.ts)

## useContextProvider

Assign a value to a Context.

Use `useContextProvider()` to assign a value to a context. The assignment happens in the component's function. Once assigned, use `useContext()` in any child component to retrieve the value.

Context is a way to pass stores to the child components without prop-drilling.

### Example

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
    }),
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

```typescript
useContextProvider: <STATE extends object>(context: ContextId<STATE>, newValue: STATE) => void
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-context.ts)

## useErrorBoundary

```typescript
useErrorBoundary: () => Readonly<ErrorBoundaryStore>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-error-boundary.ts)

## useId

```typescript
useId: () => string;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-id.ts)

## useOn

Register a listener on the current component's host element.

Used to programmatically add event listeners. Useful from custom `use*` methods, which do not have access to the JSX. Otherwise, it's adding a JSX listener in the `<div>` is a better idea.

```typescript
useOn: <T extends KnownEventNames>(event: T | T[], eventQrl: EventQRL<T>) => void
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-on.ts)

## useOnDocument

Register a listener on `document`.

Used to programmatically add event listeners. Useful from custom `use*` methods, which do not have access to the JSX.

```typescript
useOnDocument: <T extends KnownEventNames>(event: T | T[], eventQrl: EventQRL<T>) => void
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-on.ts)

## useOnWindow

Register a listener on `window`.

Used to programmatically add event listeners. Useful from custom `use*` methods, which do not have access to the JSX.

```typescript
useOnWindow: <T extends KnownEventNames>(event: T | T[], eventQrl: EventQRL<T>) => void
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-on.ts)

## useResource$

This method works like an async memoized function that runs whenever some tracked value changes and returns some data.

`useResource` however returns immediate a `ResourceReturn` object that contains the data and a state that indicates if the data is available or not.

The status can be one of the following:

- 'pending' - the data is not yet available. - 'resolved' - the data is available. - 'rejected' - the data is not available due to an error or timeout.

### Example

Example showing how `useResource` to perform a fetch to request the weather, whenever the input city name changes.

```tsx
const Cmp = component$(() => {
  const cityS = useSignal("");

  const weatherResource = useResource$(async ({ track, cleanup }) => {
    const cityName = track(cityS);
    const abortController = new AbortController();
    cleanup(() => abortController.abort("cleanup"));
    const res = await fetch(`http://weatherdata.com?city=${cityName}`, {
      signal: abortController.signal,
    });
    const data = await res.json();
    return data as { temp: number };
  });

  return (
    <div>
      <input name="city" bind:value={cityS} />
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

```typescript
useResource$: <T>(generatorFn: ResourceFn<T>, opts?: ResourceOptions) =>
  ResourceReturn<T>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-resource.ts)

## useResourceQrl

This method works like an async memoized function that runs whenever some tracked value changes and returns some data.

`useResource` however returns immediate a `ResourceReturn` object that contains the data and a state that indicates if the data is available or not.

The status can be one of the following:

- 'pending' - the data is not yet available. - 'resolved' - the data is available. - 'rejected' - the data is not available due to an error or timeout.

### Example

Example showing how `useResource` to perform a fetch to request the weather, whenever the input city name changes.

```tsx
const Cmp = component$(() => {
  const cityS = useSignal("");

  const weatherResource = useResource$(async ({ track, cleanup }) => {
    const cityName = track(cityS);
    const abortController = new AbortController();
    cleanup(() => abortController.abort("cleanup"));
    const res = await fetch(`http://weatherdata.com?city=${cityName}`, {
      signal: abortController.signal,
    });
    const data = await res.json();
    return data as { temp: number };
  });

  return (
    <div>
      <input name="city" bind:value={cityS} />
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

```typescript
useResourceQrl: <T>(qrl: QRL<ResourceFn<T>>, opts?: ResourceOptions) =>
  ResourceReturn<T>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-resource.ts)

## useServerData

```typescript
export declare function useServerData<T>(key: string): T | undefined;
```

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| key       | string |             |

**Returns:**

T \| undefined

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-env-data.ts)

## useSignal

```typescript
useSignal: UseSignal;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-signal.ts)

## UseSignal

```typescript
useSignal: UseSignal;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-signal.ts)

## useStore

Creates an object that Qwik can track across serializations.

Use `useStore` to create a state for your application. The returned object is a proxy that has a unique ID. The ID of the object is used in the `QRL`s to refer to the store.

### Example

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

```typescript
useStore: <STATE extends object>(
  initialState: STATE | (() => STATE),
  opts?: UseStoreOptions,
) => STATE;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-store.public.ts)

## UseStoreOptions

```typescript
export interface UseStoreOptions
```

| Property       | Modifiers | Type    | Description                                                                                                                  |
| -------------- | --------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [deep?](#)     |           | boolean | _(Optional)_ If <code>true</code> then all nested objects and arrays will be tracked as well. Default is <code>false</code>. |
| [reactive?](#) |           | boolean | _(Optional)_ If <code>false</code> then the object will not be tracked for changes. Default is <code>true</code>.            |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-store.public.ts)

## useStyles$

A lazy-loadable reference to a component's styles.

Component styles allow Qwik to lazy load the style information for the component only when needed. (And avoid double loading it in case of SSR hydration.)

```tsx
import styles from "./code-block.css?inline";

export const CmpStyles = component$(() => {
  useStyles$(styles);

  return <div>Some text</div>;
});
```

```typescript
useStyles$: (first: string) => void
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-styles.ts)

## useStylesQrl

A lazy-loadable reference to a component's styles.

Component styles allow Qwik to lazy load the style information for the component only when needed. (And avoid double loading it in case of SSR hydration.)

```tsx
import styles from "./code-block.css?inline";

export const CmpStyles = component$(() => {
  useStyles$(styles);

  return <div>Some text</div>;
});
```

```typescript
useStylesQrl: (styles: QRL<string>) => void
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-styles.ts)

## UseStylesScoped

```typescript
export interface UseStylesScoped
```

| Property     | Modifiers | Type   | Description |
| ------------ | --------- | ------ | ----------- |
| [scopeId](#) |           | string |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-styles.ts)

## useStylesScoped$

A lazy-loadable reference to a component's styles, that is scoped to the component.

Component styles allow Qwik to lazy load the style information for the component only when needed. (And avoid double loading it in case of SSR hydration.)

```tsx
import scoped from "./code-block.css?inline";

export const CmpScopedStyles = component$(() => {
  useStylesScoped$(scoped);

  return <div>Some text</div>;
});
```

```typescript
useStylesScoped$: (first: string) => UseStylesScoped;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-styles.ts)

## useStylesScopedQrl

A lazy-loadable reference to a component's styles, that is scoped to the component.

Component styles allow Qwik to lazy load the style information for the component only when needed. (And avoid double loading it in case of SSR hydration.)

```tsx
import scoped from "./code-block.css?inline";

export const CmpScopedStyles = component$(() => {
  useStylesScoped$(scoped);

  return <div>Some text</div>;
});
```

```typescript
useStylesScopedQrl: (styles: QRL<string>) => UseStylesScoped;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-styles.ts)

## useTask$

Reruns the `taskFn` when the observed inputs change.

Use `useTask` to observe changes on a set of inputs, and then re-execute the `taskFn` when those inputs change.

The `taskFn` only executes if the observed inputs change. To observe the inputs, use the `obs` function to wrap property reads. This creates subscriptions that will trigger the `taskFn` to rerun.

```typescript
useTask$: (first: TaskFn, opts?: UseTaskOptions | undefined) => void
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts)

## UseTaskOptions

```typescript
export interface UseTaskOptions
```

| Property        | Modifiers | Type                                  | Description                                                                                                                                                |
| --------------- | --------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [eagerness?](#) |           | [EagernessOptions](#eagernessoptions) | _(Optional)_ - <code>visible</code>: run the effect when the element is visible. - <code>load</code>: eagerly run the effect when the application resumes. |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts)

## useTaskQrl

Reruns the `taskFn` when the observed inputs change.

Use `useTask` to observe changes on a set of inputs, and then re-execute the `taskFn` when those inputs change.

The `taskFn` only executes if the observed inputs change. To observe the inputs, use the `obs` function to wrap property reads. This creates subscriptions that will trigger the `taskFn` to rerun.

```typescript
useTaskQrl: (qrl: QRL<TaskFn>, opts?: UseTaskOptions) => void
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts)

## useVisibleTask$

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

```typescript
useVisibleTask$: (first: TaskFn, opts?: OnVisibleTaskOptions | undefined) => void
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts)

## useVisibleTaskQrl

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

```typescript
useVisibleTaskQrl: (qrl: QRL<TaskFn>, opts?: OnVisibleTaskOptions) => void
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts)

## ValueOrPromise

Type representing a value which is either resolve or a promise.

```typescript
export type ValueOrPromise<T> = T | Promise<T>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/util/types.ts)

## version

QWIK_VERSION

```typescript
version: string;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/version.ts)

## VideoHTMLAttributes

```typescript
export interface VideoHTMLAttributes<T extends Element> extends Attrs<'video', T>
```

**Extends:** Attrs&lt;'video', T&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)

## VisibleTaskStrategy

```typescript
export type VisibleTaskStrategy =
  | "intersection-observer"
  | "document-ready"
  | "document-idle";
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts)

## WebViewHTMLAttributes

> Warning: This API is now obsolete.
>
> This is the type for a React Native WebView. It doesn't belong in Qwik (yet?) but we're keeping it for backwards compatibility.

```typescript
export interface WebViewHTMLAttributes<T extends Element> extends HTMLAttributes<T>
```

**Extends:** [HTMLAttributes](#htmlattributes)&lt;T&gt;

| Property                   | Modifiers | Type                 | Description  |
| -------------------------- | --------- | -------------------- | ------------ |
| [allowFullScreen?](#)      |           | boolean \| undefined | _(Optional)_ |
| [allowpopups?](#)          |           | boolean \| undefined | _(Optional)_ |
| [autoFocus?](#)            |           | boolean \| undefined | _(Optional)_ |
| [autosize?](#)             |           | boolean \| undefined | _(Optional)_ |
| [blinkfeatures?](#)        |           | string \| undefined  | _(Optional)_ |
| [disableblinkfeatures?](#) |           | string \| undefined  | _(Optional)_ |
| [disableguestresize?](#)   |           | boolean \| undefined | _(Optional)_ |
| [disablewebsecurity?](#)   |           | boolean \| undefined | _(Optional)_ |
| [guestinstance?](#)        |           | string \| undefined  | _(Optional)_ |
| [httpreferrer?](#)         |           | string \| undefined  | _(Optional)_ |
| [nodeintegration?](#)      |           | boolean \| undefined | _(Optional)_ |
| [partition?](#)            |           | string \| undefined  | _(Optional)_ |
| [plugins?](#)              |           | boolean \| undefined | _(Optional)_ |
| [preload?](#)              |           | string \| undefined  | _(Optional)_ |
| [src?](#)                  |           | string \| undefined  | _(Optional)_ |
| [useragent?](#)            |           | string \| undefined  | _(Optional)_ |
| [webpreferences?](#)       |           | string \| undefined  | _(Optional)_ |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts)
