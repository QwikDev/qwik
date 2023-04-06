---
title: \@builder.io/qwik API Reference
---

# **API** @builder.io/qwik

<h2 id="componentbaseprops-_q_slot_" data-kind="property-signature" data-kind-label="P"><a aria-hidden="true" tabindex="-1" href="#componentbaseprops-_q_slot_"><span class="icon icon-link"></span></a>"q:slot" </h2>

```typescript
'q:slot'?: string;
```

<h2 id="_" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#_"><span class="icon icon-link"></span></a>$ </h2>

Qwik Optimizer marker function.

Use `$(...)` to tell Qwik Optimizer to extract the expression in `$(...)` into a lazy-loadable resource referenced by `QRL`.

```typescript
$: <T>(expression: T) => QRL<T>;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/qrl/qrl.public.ts" target="_blanks">Edit this section</a></p>

<h2 id="ariaattributes" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#ariaattributes"><span class="icon icon-link"></span></a>AriaAttributes </h2>

```typescript
export interface AriaAttributes
```

| Property                      | Modifiers | Type                                                                                                                                                                                    | Description                                                                                                                                                                                                                       |
| ----------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ["aria-activedescendant"?](#) |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Identifies the currently active element when DOM focus is on a composite widget, textbox, group, or application.                                                                                                     |
| ["aria-atomic"?](#)           |           | Booleanish \| undefined                                                                                                                                                                 | _(Optional)_ Indicates whether assistive technologies will present all, or only parts of, the changed region based on the change notifications defined by the aria-relevant attribute.                                            |
| ["aria-autocomplete"?](#)     |           | 'none' \| 'inline' \| 'list' \| 'both' \| undefined                                                                                                                                     | _(Optional)_ Indicates whether inputting text could trigger display of one or more predictions of the user's intended value for an input and specifies how predictions would be presented if they are made.                       |
| ["aria-busy"?](#)             |           | Booleanish \| undefined                                                                                                                                                                 | _(Optional)_ Indicates an element is being modified and that assistive technologies MAY want to wait until the modifications are complete before exposing them to the user.                                                       |
| ["aria-checked"?](#)          |           | boolean \| 'false' \| 'mixed' \| 'true' \| undefined                                                                                                                                    | _(Optional)_ Indicates the current "checked" state of checkboxes, radio buttons, and other widgets.                                                                                                                               |
| ["aria-colcount"?](#)         |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines the total number of columns in a table, grid, or treegrid.                                                                                                                                                   |
| ["aria-colindex"?](#)         |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines an element's column index or position with respect to the total number of columns within a table, grid, or treegrid.                                                                                         |
| ["aria-colspan"?](#)          |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines the number of columns spanned by a cell or gridcell within a table, grid, or treegrid.                                                                                                                       |
| ["aria-controls"?](#)         |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Identifies the element (or elements) whose contents or presence are controlled by the current element.                                                                                                               |
| ["aria-current"?](#)          |           | boolean \| 'false' \| 'true' \| 'page' \| 'step' \| 'location' \| 'date' \| 'time' \| undefined                                                                                         | _(Optional)_ Indicates the element that represents the current item within a container or set of related elements.                                                                                                                |
| ["aria-describedby"?](#)      |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Identifies the element (or elements) that describes the object.                                                                                                                                                      |
| ["aria-details"?](#)          |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Identifies the element that provides a detailed, extended description for the object.                                                                                                                                |
| ["aria-disabled"?](#)         |           | Booleanish \| undefined                                                                                                                                                                 | _(Optional)_ Indicates that the element is perceivable but disabled, so it is not editable or otherwise operable.                                                                                                                 |
| ["aria-dropeffect"?](#)       |           | 'none' \| 'copy' \| 'execute' \| 'link' \| 'move' \| 'popup' \| undefined                                                                                                               | _(Optional)_ Indicates what functions can be performed when a dragged object is released on the drop target.                                                                                                                      |
| ["aria-errormessage"?](#)     |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Identifies the element that provides an error message for the object.                                                                                                                                                |
| ["aria-expanded"?](#)         |           | Booleanish \| undefined                                                                                                                                                                 | _(Optional)_ Indicates whether the element, or another grouping element it controls, is currently expanded or collapsed.                                                                                                          |
| ["aria-flowto"?](#)           |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Identifies the next element (or elements) in an alternate reading order of content which, at the user's discretion, allows assistive technology to override the general default of reading in document source order. |
| ["aria-grabbed"?](#)          |           | Booleanish \| undefined                                                                                                                                                                 | _(Optional)_ Indicates an element's "grabbed" state in a drag-and-drop operation.                                                                                                                                                 |
| ["aria-haspopup"?](#)         |           | boolean \| 'false' \| 'true' \| 'menu' \| 'listbox' \| 'tree' \| 'grid' \| 'dialog' \| undefined                                                                                        | _(Optional)_ Indicates the availability and type of interactive popup element, such as menu or dialog, that can be triggered by an element.                                                                                       |
| ["aria-hidden"?](#)           |           | Booleanish \| undefined                                                                                                                                                                 | _(Optional)_ Indicates whether the element is exposed to an accessibility API.                                                                                                                                                    |
| ["aria-invalid"?](#)          |           | boolean \| 'false' \| 'true' \| 'grammar' \| 'spelling' \| undefined                                                                                                                    | _(Optional)_ Indicates the entered value does not conform to the format expected by the application.                                                                                                                              |
| ["aria-keyshortcuts"?](#)     |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Indicates keyboard shortcuts that an author has implemented to activate or give focus to an element.                                                                                                                 |
| ["aria-label"?](#)            |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Defines a string value that labels the current element.                                                                                                                                                              |
| ["aria-labelledby"?](#)       |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Identifies the element (or elements) that labels the current element.                                                                                                                                                |
| ["aria-level"?](#)            |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines the hierarchical level of an element within a structure.                                                                                                                                                     |
| ["aria-live"?](#)             |           | 'off' \| 'assertive' \| 'polite' \| undefined                                                                                                                                           | _(Optional)_ Indicates that an element will be updated, and describes the types of updates the user agents, assistive technologies, and user can expect from the live region.                                                     |
| ["aria-modal"?](#)            |           | Booleanish \| undefined                                                                                                                                                                 | _(Optional)_ Indicates whether an element is modal when displayed.                                                                                                                                                                |
| ["aria-multiline"?](#)        |           | Booleanish \| undefined                                                                                                                                                                 | _(Optional)_ Indicates whether a text box accepts multiple lines of input or only a single line.                                                                                                                                  |
| ["aria-multiselectable"?](#)  |           | Booleanish \| undefined                                                                                                                                                                 | _(Optional)_ Indicates that the user may select more than one item from the current selectable descendants.                                                                                                                       |
| ["aria-orientation"?](#)      |           | 'horizontal' \| 'vertical' \| undefined                                                                                                                                                 | _(Optional)_ Indicates whether the element's orientation is horizontal, vertical, or unknown/ambiguous.                                                                                                                           |
| ["aria-owns"?](#)             |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Identifies an element (or elements) in order to define a visual, functional, or contextual parent/child relationship between DOM elements where the DOM hierarchy cannot be used to represent the relationship.      |
| ["aria-placeholder"?](#)      |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Defines a short hint (a word or short phrase) intended to aid the user with data entry when the control has no value. A hint could be a sample value or a brief description of the expected format.                  |
| ["aria-posinset"?](#)         |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines an element's number or position in the current set of listitems or treeitems. Not required if all elements in the set are present in the DOM.                                                                |
| ["aria-pressed"?](#)          |           | boolean \| 'false' \| 'mixed' \| 'true' \| undefined                                                                                                                                    | _(Optional)_ Indicates the current "pressed" state of toggle buttons.                                                                                                                                                             |
| ["aria-readonly"?](#)         |           | Booleanish \| undefined                                                                                                                                                                 | _(Optional)_ Indicates that the element is not editable, but is otherwise operable.                                                                                                                                               |
| ["aria-relevant"?](#)         |           | 'additions' \| 'additions removals' \| 'additions text' \| 'all' \| 'removals' \| 'removals additions' \| 'removals text' \| 'text' \| 'text additions' \| 'text removals' \| undefined | _(Optional)_ Indicates what notifications the user agent will trigger when the accessibility tree within a live region is modified.                                                                                               |
| ["aria-required"?](#)         |           | Booleanish \| undefined                                                                                                                                                                 | _(Optional)_ Indicates that user input is required on the element before a form may be submitted.                                                                                                                                 |
| ["aria-roledescription"?](#)  |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Defines a human-readable, author-localized description for the role of an element.                                                                                                                                   |
| ["aria-rowcount"?](#)         |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines the total number of rows in a table, grid, or treegrid.                                                                                                                                                      |
| ["aria-rowindex"?](#)         |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines an element's row index or position with respect to the total number of rows within a table, grid, or treegrid.                                                                                               |
| ["aria-rowspan"?](#)          |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines the number of rows spanned by a cell or gridcell within a table, grid, or treegrid.                                                                                                                          |
| ["aria-selected"?](#)         |           | Booleanish \| undefined                                                                                                                                                                 | _(Optional)_ Indicates the current "selected" state of various widgets.                                                                                                                                                           |
| ["aria-setsize"?](#)          |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines the number of items in the current set of listitems or treeitems. Not required if all elements in the set are present in the DOM.                                                                            |
| ["aria-sort"?](#)             |           | 'none' \| 'ascending' \| 'descending' \| 'other' \| undefined                                                                                                                           | _(Optional)_ Indicates if items in a table or grid are sorted in ascending or descending order.                                                                                                                                   |
| ["aria-valuemax"?](#)         |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines the maximum allowed value for a range widget.                                                                                                                                                                |
| ["aria-valuemin"?](#)         |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines the minimum allowed value for a range widget.                                                                                                                                                                |
| ["aria-valuenow"?](#)         |           | number \| undefined                                                                                                                                                                     | _(Optional)_ Defines the current value for a range widget.                                                                                                                                                                        |
| ["aria-valuetext"?](#)        |           | string \| undefined                                                                                                                                                                     | _(Optional)_ Defines the human readable text alternative of aria-valuenow for a range widget.                                                                                                                                     |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts" target="_blanks">Edit this section</a></p>

<h2 id="ariarole" data-kind="type-alias" data-kind-label="T"><a aria-hidden="true" tabindex="-1" href="#ariarole"><span class="icon icon-link"></span></a>AriaRole </h2>

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

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts" target="_blanks">Edit this section</a></p>

<h2 id="resourcectx-cache" data-kind="method-signature" data-kind-label="M"><a aria-hidden="true" tabindex="-1" href="#resourcectx-cache"><span class="icon icon-link"></span></a>cache </h2>

```typescript
cache(policyOrMilliseconds: number | 'immutable'): void;
```

| Parameter            | Type                  | Description |
| -------------------- | --------------------- | ----------- |
| policyOrMilliseconds | number \| 'immutable' |             |

**Returns:**

void

<h2 id="renderresult-cleanup" data-kind="method-signature" data-kind-label="M"><a aria-hidden="true" tabindex="-1" href="#renderresult-cleanup"><span class="icon icon-link"></span></a>cleanup </h2>

```typescript
cleanup(): void;
```

**Returns:**

void

<h2 id="component" data-kind="type-alias" data-kind-label="T"><a aria-hidden="true" tabindex="-1" href="#component"><span class="icon icon-link"></span></a>Component </h2>

Type representing the Qwik component.

`Component` is the type returned by invoking `component$`.

```
interface MyComponentProps {
  someProp: string;
}
const MyComponent: Component<MyComponentProps> = component$((props: MyComponentProps) => {
  return <span>{props.someProp}</span>;
});
```

```typescript
export type Component<PROPS extends {}> = FunctionComponent<PublicProps<PROPS>>;
```

**References:** [FunctionComponent](#functioncomponent), [PublicProps](#publicprops)

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/component/component.public.ts" target="_blanks">Edit this section</a></p>

<h2 id="component_" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#component_"><span class="icon icon-link"></span></a>component$ </h2>

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

See also: `component`, `useCleanup`, `onResume`, `onPause`, `useOn`, `useOnDocument`, `useOnWindow`, `useStyles`

```typescript
component$: <PROPS extends {}>(onMount: OnRenderFn<PROPS>) => Component<PROPS>;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/component/component.public.ts" target="_blanks">Edit this section</a></p>

<h2 id="componentbaseprops" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#componentbaseprops"><span class="icon icon-link"></span></a>ComponentBaseProps </h2>

```typescript
export interface ComponentBaseProps
```

| Property                                  | Modifiers | Type                                  | Description  |
| ----------------------------------------- | --------- | ------------------------------------- | ------------ |
| ["q:slot"?](#componentbaseprops-_q_slot_) |           | string                                | _(Optional)_ |
| [key?](#)                                 |           | string \| number \| null \| undefined | _(Optional)_ |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-attributes.ts" target="_blanks">Edit this section</a></p>

<h2 id="componentqrl" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#componentqrl"><span class="icon icon-link"></span></a>componentQrl </h2>

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

See also: `component`, `useCleanup`, `onResume`, `onPause`, `useOn`, `useOnDocument`, `useOnWindow`, `useStyles`

```typescript
componentQrl: <PROPS extends {}>(componentQrl: QRL<OnRenderFn<PROPS>>) =>
  Component<PROPS>;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/component/component.public.ts" target="_blanks">Edit this section</a></p>

<h2 id="contextid" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#contextid"><span class="icon icon-link"></span></a>ContextId </h2>

ContextId is a typesafe ID for your context.

Context is a way to pass stores to the child components without prop-drilling.

Use `createContextId()` to create a `ContextId`. A `ContextId` is just a serializable identifier for the context. It is not the context value itself. See `useContextProvider()` and `useContext()` for the values. Qwik needs a serializable ID for the context so that the it can track context providers and consumers in a way that survives resumability.

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

```typescript
export interface ContextId<STATE>
```

| Property                        | Modifiers             | Type   | Description                                                     |
| ------------------------------- | --------------------- | ------ | --------------------------------------------------------------- |
| [\_\_brand_context_type\_\_](#) | <code>readonly</code> | STATE  | Design-time property to store type information for the context. |
| [id](#)                         | <code>readonly</code> | string | A unique ID for the context.                                    |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-context.ts" target="_blanks">Edit this section</a></p>

<h2 id="coreplatform" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#coreplatform"><span class="icon icon-link"></span></a>CorePlatform </h2>

Low-level API for platform abstraction.

Different platforms (browser, node, service workers) may have different ways of handling things such as `requestAnimationFrame` and imports. To make Qwik platform-independent Qwik uses the `CorePlatform` API to access the platform API.

`CorePlatform` also is responsible for importing symbols. The import map is different on the client (browser) then on the server. For this reason, the server has a manifest that is used to map symbols to javascript chunks. The manifest is encapsulated in `CorePlatform`, for this reason, the `CorePlatform` can't be global as there may be multiple applications running at server concurrently.

This is a low-level API and there should not be a need for you to access this.

```typescript
export interface CorePlatform
```

| Property            | Modifiers | Type                                                                                                                                            | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [chunkForSymbol](#) |           | (symbolName: string, chunk: string \| null) =&gt; readonly \[symbol: string, chunk: string\] \| undefined                                       | <p>Retrieve chunk name for the symbol.</p><p>When the application is running on the server the symbols may be imported from different files (as server build is typically a single javascript chunk.) For this reason, it is necessary to convert the chunks from server format to client (browser) format. This is done by looking up symbols (which are globally unique) in the manifest. (Manifest is the mapping of symbols to the client chunk names.)</p>                                                                                                                                    |
| [importSymbol](#)   |           | (containerEl: Element \| undefined, url: string \| URL \| undefined \| null, symbol: string) =&gt; [ValueOrPromise](#valueorpromise)&lt;any&gt; | <p>Retrieve a symbol value from QRL.</p><p>Qwik needs to lazy load data and closures. For this Qwik uses QRLs that are serializable references of resources that are needed. The QRLs contain all the information necessary to retrieved the reference using <code>importSymbol</code>.</p><p>Why not use <code>import()</code>? Because <code>import()</code> is relative to the current file, and the current file is always the Qwik framework. So QRLs have additional information that allows them to serialize imports relative to application base rather than the Qwik framework file.</p> |
| [isServer](#)       |           | boolean                                                                                                                                         | True of running on the server platform.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| [nextTick](#)       |           | (fn: () =&gt; any) =&gt; Promise&lt;any&gt;                                                                                                     | Perform operation on next tick.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [raf](#)            |           | (fn: () =&gt; any) =&gt; Promise&lt;any&gt;                                                                                                     | Perform operation on next request-animation-frame.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/platform/types.ts" target="_blanks">Edit this section</a></p>

<h2 id="createcontextid" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#createcontextid"><span class="icon icon-link"></span></a>createContextId </h2>

Create a context ID to be used in your application. The name should be written with no spaces.

Context is a way to pass stores to the child components without prop-drilling.

Use `createContextId()` to create a `ContextId`. A `ContextId` is just a serializable identifier for the context. It is not the context value itself. See `useContextProvider()` and `useContext()` for the values. Qwik needs a serializable ID for the context so that the it can track context providers and consumers in a way that survives resumability.

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

```typescript
createContextId: <STATE = unknown>(name: string) => ContextId<STATE>;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-context.ts" target="_blanks">Edit this section</a></p>

<h2 id="domattributes" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#domattributes"><span class="icon icon-link"></span></a>DOMAttributes </h2>

```typescript
export interface DOMAttributes<T> extends QwikProps<T>, QwikEvents<T>
```

**Extends:** QwikProps&lt;T&gt;, QwikEvents&lt;T&gt;

| Property       | Modifiers | Type                                  | Description  |
| -------------- | --------- | ------------------------------------- | ------------ |
| [children?](#) |           | [JSXChildren](#jsxchildren)           | _(Optional)_ |
| [key?](#)      |           | string \| number \| null \| undefined | _(Optional)_ |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-attributes.ts" target="_blanks">Edit this section</a></p>

<h2 id="eagernessoptions" data-kind="type-alias" data-kind-label="T"><a aria-hidden="true" tabindex="-1" href="#eagernessoptions"><span class="icon icon-link"></span></a>EagernessOptions </h2>

```typescript
export type EagernessOptions = "visible" | "load" | "idle";
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts" target="_blanks">Edit this section</a></p>

<h2 id="h-jsx-element" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#h-jsx-element"><span class="icon icon-link"></span></a>Element </h2>

```typescript
interface Element extends QwikJSX.Element
```

**Extends:** [QwikJSX.Element](#)

<h2 id="h-jsx-elementchildrenattribute" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#h-jsx-elementchildrenattribute"><span class="icon icon-link"></span></a>ElementChildrenAttribute </h2>

```typescript
interface ElementChildrenAttribute
```

| Property       | Modifiers | Type | Description  |
| -------------- | --------- | ---- | ------------ |
| [children?](#) |           | any  | _(Optional)_ |

<h2 id="errorboundarystore" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#errorboundarystore"><span class="icon icon-link"></span></a>ErrorBoundaryStore </h2>

```typescript
export interface ErrorBoundaryStore
```

| Property   | Modifiers | Type             | Description |
| ---------- | --------- | ---------------- | ----------- |
| [error](#) |           | any \| undefined |             |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/error-handling.ts" target="_blanks">Edit this section</a></p>

<h2 id="event_" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#event_"><span class="icon icon-link"></span></a>event$ </h2>

```typescript
event$: <T>(first: T) => QRL<T>;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/qrl/qrl.public.ts" target="_blanks">Edit this section</a></p>

<h2 id="eventqrl" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#eventqrl"><span class="icon icon-link"></span></a>eventQrl </h2>

```typescript
eventQrl: <T>(qrl: QRL<T>) => QRL<T>;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/qrl/qrl.public.ts" target="_blanks">Edit this section</a></p>

<h2 id="fragment" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#fragment"><span class="icon icon-link"></span></a>Fragment </h2>

```typescript
Fragment: FunctionComponent<{
  children?: any;
  key?: string | number | null;
}>;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/jsx-runtime.ts" target="_blanks">Edit this section</a></p>

<h2 id="functioncomponent" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#functioncomponent"><span class="icon icon-link"></span></a>FunctionComponent </h2>

```typescript
export interface FunctionComponent<P = Record<string, any>>
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-node.ts" target="_blanks">Edit this section</a></p>

<h2 id="qrl-getcaptured" data-kind="method-signature" data-kind-label="M"><a aria-hidden="true" tabindex="-1" href="#qrl-getcaptured"><span class="icon icon-link"></span></a>getCaptured </h2>

```typescript
getCaptured(): any[] | null;
```

**Returns:**

any\[\] \| null

<h2 id="qrl-gethash" data-kind="method-signature" data-kind-label="M"><a aria-hidden="true" tabindex="-1" href="#qrl-gethash"><span class="icon icon-link"></span></a>getHash </h2>

```typescript
getHash(): string;
```

**Returns:**

string

<h2 id="qwikkeyboardevent-getmodifierstate" data-kind="method-signature" data-kind-label="M"><a aria-hidden="true" tabindex="-1" href="#qwikkeyboardevent-getmodifierstate"><span class="icon icon-link"></span></a>getModifierState </h2>

See \[DOM Level 3 Events spec\](https://www.w3.org/TR/uievents-key/\#keys-modifier). for a list of valid (case-sensitive) arguments to this method.

```typescript
getModifierState(key: string): boolean;
```

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| key       | string |             |

**Returns:**

boolean

<h2 id="getplatform" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#getplatform"><span class="icon icon-link"></span></a>getPlatform </h2>

Retrieve the `CorePlatform`.

The `CorePlatform` is also responsible for retrieving the Manifest, that contains mappings from symbols to javascript import chunks. For this reason, `CorePlatform` can't be global, but is specific to the application currently running. On server it is possible that many different applications are running in a single server instance, and for this reason the `CorePlatform` is associated with the application document.

```typescript
getPlatform: () => CorePlatform;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/platform/platform.ts" target="_blanks">Edit this section</a></p>

<h2 id="qrl-getsymbol" data-kind="method-signature" data-kind-label="M"><a aria-hidden="true" tabindex="-1" href="#qrl-getsymbol"><span class="icon icon-link"></span></a>getSymbol </h2>

```typescript
getSymbol(): string;
```

**Returns:**

string

<h2 id="h" data-kind="function" data-kind-label="F"><a aria-hidden="true" tabindex="-1" href="#h"><span class="icon icon-link"></span></a>h </h2>

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

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/factory.ts" target="_blanks">Edit this section</a></p>

<h2 id="h" data-kind="namespace" data-kind-label="N"><a aria-hidden="true" tabindex="-1" href="#h"><span class="icon icon-link"></span></a>h </h2>

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

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/factory.ts" target="_blanks">Edit this section</a></p>

<h2 id="htmlattributes" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#htmlattributes"><span class="icon icon-link"></span></a>HTMLAttributes </h2>

```typescript
export interface HTMLAttributes<T> extends AriaAttributes, DOMAttributes<T>
```

**Extends:** [AriaAttributes](#ariaattributes), [DOMAttributes](#domattributes)&lt;T&gt;

| Property              | Modifiers | Type                                                                                             | Description                                                                                                        |
| --------------------- | --------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| [about?](#)           |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [accessKey?](#)       |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [autoCapitalize?](#)  |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [autoCorrect?](#)     |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [autoSave?](#)        |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [color?](#)           |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [contentEditable?](#) |           | 'true' \| 'false' \| 'inherit' \| undefined                                                      | _(Optional)_                                                                                                       |
| [contextMenu?](#)     |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [datatype?](#)        |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [dir?](#)             |           | 'ltr' \| 'rtl' \| 'auto' \| undefined                                                            | _(Optional)_                                                                                                       |
| [draggable?](#)       |           | boolean \| undefined                                                                             | _(Optional)_                                                                                                       |
| [hidden?](#)          |           | boolean \| 'hidden' \| 'until-found' \| undefined                                                | _(Optional)_                                                                                                       |
| [id?](#)              |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [inlist?](#)          |           | any                                                                                              | _(Optional)_                                                                                                       |
| [inputMode?](#)       |           | 'none' \| 'text' \| 'tel' \| 'url' \| 'email' \| 'numeric' \| 'decimal' \| 'search' \| undefined | _(Optional)_ Hints at the type of data that might be entered by the user while editing the element or its contents |
| [is?](#)              |           | string \| undefined                                                                              | _(Optional)_ Specify that a standard HTML element should behave like a defined custom built-in element             |
| [itemID?](#)          |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [itemProp?](#)        |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [itemRef?](#)         |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [itemScope?](#)       |           | boolean \| undefined                                                                             | _(Optional)_                                                                                                       |
| [itemType?](#)        |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [lang?](#)            |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [placeholder?](#)     |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [prefix?](#)          |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [property?](#)        |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [radioGroup?](#)      |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [resource?](#)        |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [results?](#)         |           | number \| undefined                                                                              | _(Optional)_                                                                                                       |
| [role?](#)            |           | [AriaRole](#ariarole) \| undefined                                                               | _(Optional)_                                                                                                       |
| [security?](#)        |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [slot?](#)            |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [spellcheck?](#)      |           | boolean \| undefined                                                                             | _(Optional)_                                                                                                       |
| [style?](#)           |           | Record&lt;string, string \| number \| undefined&gt; \| string \| undefined                       | _(Optional)_                                                                                                       |
| [tabIndex?](#)        |           | number \| undefined                                                                              | _(Optional)_                                                                                                       |
| [title?](#)           |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [translate?](#)       |           | 'yes' \| 'no' \| undefined                                                                       | _(Optional)_                                                                                                       |
| [typeof?](#)          |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |
| [unselectable?](#)    |           | 'on' \| 'off' \| undefined                                                                       | _(Optional)_                                                                                                       |
| [vocab?](#)           |           | string \| undefined                                                                              | _(Optional)_                                                                                                       |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-generated.ts" target="_blanks">Edit this section</a></p>

<h2 id="implicit_firstarg" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#implicit_firstarg"><span class="icon icon-link"></span></a>implicit$FirstArg </h2>

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
    fn: (first: QRL<FIRST>, ...rest: REST) => RET
  ) =>
  (first: FIRST, ...rest: REST) =>
    RET;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/util/implicit_dollar.ts" target="_blanks">Edit this section</a></p>

<h2 id="h-jsx-intrinsicattributes" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#h-jsx-intrinsicattributes"><span class="icon icon-link"></span></a>IntrinsicAttributes </h2>

```typescript
interface IntrinsicAttributes extends QwikJSX.IntrinsicAttributes
```

**Extends:** [QwikJSX.IntrinsicAttributes](#)

<h2 id="h-jsx-intrinsicelements" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#h-jsx-intrinsicelements"><span class="icon icon-link"></span></a>IntrinsicElements </h2>

```typescript
interface IntrinsicElements extends QwikJSX.IntrinsicElements
```

**Extends:** [QwikJSX.IntrinsicElements](#)

<h2 id="jsx" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#jsx"><span class="icon icon-link"></span></a>jsx </h2>

```typescript
jsx: <T extends string | FunctionComponent<any>>(
  type: T,
  props: T extends FunctionComponent<infer PROPS> ? PROPS : Record<string, any>,
  key?: string | number | null
) => JSXNode<T>;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/jsx-runtime.ts" target="_blanks">Edit this section</a></p>

<h2 id="h-jsx" data-kind="namespace" data-kind-label="N"><a aria-hidden="true" tabindex="-1" href="#h-jsx"><span class="icon icon-link"></span></a>JSX </h2>

```typescript
namespace JSX
```

| Interface                                                   | Description |
| ----------------------------------------------------------- | ----------- |
| [Element](#h-jsx-element)                                   |             |
| [ElementChildrenAttribute](#h-jsx-elementchildrenattribute) |             |
| [IntrinsicAttributes](#h-jsx-intrinsicattributes)           |             |
| [IntrinsicElements](#h-jsx-intrinsicelements)               |             |

<h2 id="jsxchildren" data-kind="type-alias" data-kind-label="T"><a aria-hidden="true" tabindex="-1" href="#jsxchildren"><span class="icon icon-link"></span></a>JSXChildren </h2>

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

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-attributes.ts" target="_blanks">Edit this section</a></p>

<h2 id="jsxdev" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#jsxdev"><span class="icon icon-link"></span></a>jsxDEV </h2>

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

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/jsx-runtime.ts" target="_blanks">Edit this section</a></p>

<h2 id="jsxnode" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#jsxnode"><span class="icon icon-link"></span></a>JSXNode </h2>

```typescript
export interface JSXNode<T = string | FunctionComponent>
```

| Property            | Modifiers | Type                                                                                             | Description  |
| ------------------- | --------- | ------------------------------------------------------------------------------------------------ | ------------ |
| [children](#)       |           | any \| null                                                                                      |              |
| [dev?](#)           |           | DevJSX                                                                                           | _(Optional)_ |
| [flags](#)          |           | number                                                                                           |              |
| [immutableProps](#) |           | Record&lt;string, any&gt; \| null                                                                |              |
| [key](#)            |           | string \| null                                                                                   |              |
| [props](#)          |           | T extends [FunctionComponent](#functioncomponent)&lt;infer B&gt; ? B : Record&lt;string, any&gt; |              |
| [type](#)           |           | T                                                                                                |              |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-node.ts" target="_blanks">Edit this section</a></p>

<h2 id="jsxtagname" data-kind="type-alias" data-kind-label="T"><a aria-hidden="true" tabindex="-1" href="#jsxtagname"><span class="icon icon-link"></span></a>JSXTagName </h2>

```typescript
export type JSXTagName =
  | keyof HTMLElementTagNameMap
  | Omit<string, keyof HTMLElementTagNameMap>;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-attributes.ts" target="_blanks">Edit this section</a></p>

<h2 id="nativeanimationevent" data-kind="type-alias" data-kind-label="T"><a aria-hidden="true" tabindex="-1" href="#nativeanimationevent"><span class="icon icon-link"></span></a>NativeAnimationEvent </h2>

```typescript
export type NativeAnimationEvent = AnimationEvent;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts" target="_blanks">Edit this section</a></p>

<h2 id="nativeclipboardevent" data-kind="type-alias" data-kind-label="T"><a aria-hidden="true" tabindex="-1" href="#nativeclipboardevent"><span class="icon icon-link"></span></a>NativeClipboardEvent </h2>

```typescript
export type NativeClipboardEvent = ClipboardEvent;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts" target="_blanks">Edit this section</a></p>

<h2 id="nativecompositionevent" data-kind="type-alias" data-kind-label="T"><a aria-hidden="true" tabindex="-1" href="#nativecompositionevent"><span class="icon icon-link"></span></a>NativeCompositionEvent </h2>

```typescript
export type NativeCompositionEvent = CompositionEvent;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts" target="_blanks">Edit this section</a></p>

<h2 id="nativedragevent" data-kind="type-alias" data-kind-label="T"><a aria-hidden="true" tabindex="-1" href="#nativedragevent"><span class="icon icon-link"></span></a>NativeDragEvent </h2>

```typescript
export type NativeDragEvent = DragEvent;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts" target="_blanks">Edit this section</a></p>

<h2 id="nativefocusevent" data-kind="type-alias" data-kind-label="T"><a aria-hidden="true" tabindex="-1" href="#nativefocusevent"><span class="icon icon-link"></span></a>NativeFocusEvent </h2>

```typescript
export type NativeFocusEvent = FocusEvent;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts" target="_blanks">Edit this section</a></p>

<h2 id="nativekeyboardevent" data-kind="type-alias" data-kind-label="T"><a aria-hidden="true" tabindex="-1" href="#nativekeyboardevent"><span class="icon icon-link"></span></a>NativeKeyboardEvent </h2>

```typescript
export type NativeKeyboardEvent = KeyboardEvent;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts" target="_blanks">Edit this section</a></p>

<h2 id="nativemouseevent" data-kind="type-alias" data-kind-label="T"><a aria-hidden="true" tabindex="-1" href="#nativemouseevent"><span class="icon icon-link"></span></a>NativeMouseEvent </h2>

```typescript
export type NativeMouseEvent = MouseEvent;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts" target="_blanks">Edit this section</a></p>

<h2 id="nativepointerevent" data-kind="type-alias" data-kind-label="T"><a aria-hidden="true" tabindex="-1" href="#nativepointerevent"><span class="icon icon-link"></span></a>NativePointerEvent </h2>

```typescript
export type NativePointerEvent = PointerEvent;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts" target="_blanks">Edit this section</a></p>

<h2 id="nativetouchevent" data-kind="type-alias" data-kind-label="T"><a aria-hidden="true" tabindex="-1" href="#nativetouchevent"><span class="icon icon-link"></span></a>NativeTouchEvent </h2>

```typescript
export type NativeTouchEvent = TouchEvent;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts" target="_blanks">Edit this section</a></p>

<h2 id="nativetransitionevent" data-kind="type-alias" data-kind-label="T"><a aria-hidden="true" tabindex="-1" href="#nativetransitionevent"><span class="icon icon-link"></span></a>NativeTransitionEvent </h2>

```typescript
export type NativeTransitionEvent = TransitionEvent;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts" target="_blanks">Edit this section</a></p>

<h2 id="nativeuievent" data-kind="type-alias" data-kind-label="T"><a aria-hidden="true" tabindex="-1" href="#nativeuievent"><span class="icon icon-link"></span></a>NativeUIEvent </h2>

```typescript
export type NativeUIEvent = UIEvent;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts" target="_blanks">Edit this section</a></p>

<h2 id="nativewheelevent" data-kind="type-alias" data-kind-label="T"><a aria-hidden="true" tabindex="-1" href="#nativewheelevent"><span class="icon icon-link"></span></a>NativeWheelEvent </h2>

```typescript
export type NativeWheelEvent = WheelEvent;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts" target="_blanks">Edit this section</a></p>

<h2 id="noserialize" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#noserialize"><span class="icon icon-link"></span></a>noSerialize </h2>

Marks a property on a store as non-serializable.

At times it is necessary to store values on a store that are non-serializable. Normally this is a runtime error as Store wants to eagerly report when a non-serializable property is assigned to it.

You can use `noSerialize()` to mark a value as non-serializable. The value is persisted in the Store but does not survive serialization. The implication is that when your application is resumed, the value of this object will be `undefined`. You will be responsible for recovering from this.

See: \[noSerialize Tutorial\](http://qwik.builder.io/tutorial/store/no-serialize)

```typescript
noSerialize: <T extends object | undefined>(input: T) => NoSerialize<T>;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/state/common.ts" target="_blanks">Edit this section</a></p>

<h2 id="noserialize" data-kind="type-alias" data-kind-label="T"><a aria-hidden="true" tabindex="-1" href="#noserialize"><span class="icon icon-link"></span></a>NoSerialize </h2>

Marks a property on a store as non-serializable.

At times it is necessary to store values on a store that are non-serializable. Normally this is a runtime error as Store wants to eagerly report when a non-serializable property is assigned to it.

You can use `noSerialize()` to mark a value as non-serializable. The value is persisted in the Store but does not survive serialization. The implication is that when your application is resumed, the value of this object will be `undefined`. You will be responsible for recovering from this.

See: \[noSerialize Tutorial\](http://qwik.builder.io/tutorial/store/no-serialize)

```typescript
noSerialize: <T extends object | undefined>(input: T) => NoSerialize<T>;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/state/common.ts" target="_blanks">Edit this section</a></p>

<h2 id="onrenderfn" data-kind="type-alias" data-kind-label="T"><a aria-hidden="true" tabindex="-1" href="#onrenderfn"><span class="icon icon-link"></span></a>OnRenderFn </h2>

```typescript
export type OnRenderFn<PROPS> = (props: PROPS) => JSXNode<any> | null;
```

**References:** [JSXNode](#jsxnode)

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/component/component.public.ts" target="_blanks">Edit this section</a></p>

<h2 id="onvisibletaskoptions" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#onvisibletaskoptions"><span class="icon icon-link"></span></a>OnVisibleTaskOptions </h2>

```typescript
export interface OnVisibleTaskOptions
```

| Property       | Modifiers | Type                                        | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------- | --------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [strategy?](#) |           | [VisibleTaskStrategy](#visibletaskstrategy) | <p>_(Optional)_ The strategy to use to determine when the "VisibleTask" should first execute.</p><p>- <code>intersection-observer</code>: the task will first execute when the element is visible in the viewport, under the hood it uses the IntersectionObserver API. - <code>document-ready</code>: the task will first execute when the document is ready, under the hood it uses the document <code>load</code> event. - <code>document-idle</code>: the task will first execute when the document is idle, under the hood it uses the requestIdleCallback API.</p> |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts" target="_blanks">Edit this section</a></p>

<h2 id="propfninterface" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#propfninterface"><span class="icon icon-link"></span></a>PropFnInterface </h2>

```typescript
export interface PropFnInterface<ARGS extends any[], RET>
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/qrl/qrl.public.ts" target="_blanks">Edit this section</a></p>

<h2 id="propfunction" data-kind="type-alias" data-kind-label="T"><a aria-hidden="true" tabindex="-1" href="#propfunction"><span class="icon icon-link"></span></a>PropFunction </h2>

```typescript
export type PropFunction<T extends Function> = T extends (
  ...args: infer ARGS
) => infer RET
  ? PropFnInterface<ARGS, RET>
  : never;
```

**References:** [PropFnInterface](#propfninterface)

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/qrl/qrl.public.ts" target="_blanks">Edit this section</a></p>

<h2 id="propsof" data-kind="type-alias" data-kind-label="T"><a aria-hidden="true" tabindex="-1" href="#propsof"><span class="icon icon-link"></span></a>PropsOf </h2>

Infers `Props` from the component.

```typescript
export const OtherComponent = component$(() => {
  return $(() => <Counter value={100} />);
});
```

```typescript
export type PropsOf<COMP extends Component<any>> = COMP extends Component<
  infer PROPS
>
  ? NonNullable<PROPS>
  : never;
```

**References:** [Component](#component)

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/component/component.public.ts" target="_blanks">Edit this section</a></p>

<h2 id="publicprops" data-kind="type-alias" data-kind-label="T"><a aria-hidden="true" tabindex="-1" href="#publicprops"><span class="icon icon-link"></span></a>PublicProps </h2>

Extends the defined component PROPS, adding the default ones (children and q:slot)..

```typescript
export type PublicProps<PROPS extends {}> = TransformProps<PROPS> &
  ComponentBaseProps &
  ComponentChildren<PROPS>;
```

**References:** [ComponentBaseProps](#componentbaseprops)

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/component/component.public.ts" target="_blanks">Edit this section</a></p>

<h2 id="qrl" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#qrl"><span class="icon icon-link"></span></a>qrl </h2>

Used by Qwik Optimizer to point to lazy-loaded resources.

This function should be used by the Qwik Optimizer only. The function should not be directly referred to in the source code of the application.

```typescript
qrl: <T = any>(
  chunkOrFn: string | (() => Promise<any>),
  symbol: string,
  lexicalScopeCapture?: any[],
  stackOffset?: number
) => QRL<T>;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/qrl/qrl.ts" target="_blanks">Edit this section</a></p>

<h2 id="qrl" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#qrl"><span class="icon icon-link"></span></a>QRL </h2>

Used by Qwik Optimizer to point to lazy-loaded resources.

This function should be used by the Qwik Optimizer only. The function should not be directly referred to in the source code of the application.

```typescript
qrl: <T = any>(
  chunkOrFn: string | (() => Promise<any>),
  symbol: string,
  lexicalScopeCapture?: any[],
  stackOffset?: number
) => QRL<T>;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/qrl/qrl.public.ts" target="_blanks">Edit this section</a></p>

<h2 id="qwikanimationevent" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#qwikanimationevent"><span class="icon icon-link"></span></a>QwikAnimationEvent </h2>

```typescript
export interface QwikAnimationEvent<T = Element> extends SyntheticEvent<T, NativeAnimationEvent>
```

**Extends:** SyntheticEvent&lt;T, [NativeAnimationEvent](#nativeanimationevent)&gt;

| Property           | Modifiers | Type   | Description |
| ------------------ | --------- | ------ | ----------- |
| [animationName](#) |           | string |             |
| [elapsedTime](#)   |           | number |             |
| [pseudoElement](#) |           | string |             |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts" target="_blanks">Edit this section</a></p>

<h2 id="qwikchangeevent" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#qwikchangeevent"><span class="icon icon-link"></span></a>QwikChangeEvent </h2>

```typescript
export interface QwikChangeEvent<T = Element> extends SyntheticEvent<T>
```

**Extends:** SyntheticEvent&lt;T&gt;

| Property    | Modifiers | Type                | Description |
| ----------- | --------- | ------------------- | ----------- |
| [target](#) |           | EventTarget &amp; T |             |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts" target="_blanks">Edit this section</a></p>

<h2 id="qwikclipboardevent" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#qwikclipboardevent"><span class="icon icon-link"></span></a>QwikClipboardEvent </h2>

```typescript
export interface QwikClipboardEvent<T = Element> extends SyntheticEvent<T, NativeClipboardEvent>
```

**Extends:** SyntheticEvent&lt;T, [NativeClipboardEvent](#nativeclipboardevent)&gt;

| Property           | Modifiers | Type         | Description |
| ------------------ | --------- | ------------ | ----------- |
| [clipboardData](#) |           | DataTransfer |             |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts" target="_blanks">Edit this section</a></p>

<h2 id="qwikcompositionevent" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#qwikcompositionevent"><span class="icon icon-link"></span></a>QwikCompositionEvent </h2>

```typescript
export interface QwikCompositionEvent<T = Element> extends SyntheticEvent<T, NativeCompositionEvent>
```

**Extends:** SyntheticEvent&lt;T, [NativeCompositionEvent](#nativecompositionevent)&gt;

| Property  | Modifiers | Type   | Description |
| --------- | --------- | ------ | ----------- |
| [data](#) |           | string |             |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts" target="_blanks">Edit this section</a></p>

<h2 id="qwikdomattributes" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#qwikdomattributes"><span class="icon icon-link"></span></a>QwikDOMAttributes </h2>

```typescript
export interface QwikDOMAttributes extends DOMAttributes<any>
```

**Extends:** [DOMAttributes](#domattributes)&lt;any&gt;

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik.ts" target="_blanks">Edit this section</a></p>

<h2 id="qwikdragevent" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#qwikdragevent"><span class="icon icon-link"></span></a>QwikDragEvent </h2>

```typescript
export interface QwikDragEvent<T = Element> extends QwikMouseEvent<T, NativeDragEvent>
```

**Extends:** [QwikMouseEvent](#qwikmouseevent)&lt;T, [NativeDragEvent](#nativedragevent)&gt;

| Property          | Modifiers | Type         | Description |
| ----------------- | --------- | ------------ | ----------- |
| [dataTransfer](#) |           | DataTransfer |             |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts" target="_blanks">Edit this section</a></p>

<h2 id="qwikfocusevent" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#qwikfocusevent"><span class="icon icon-link"></span></a>QwikFocusEvent </h2>

```typescript
export interface QwikFocusEvent<T = Element> extends SyntheticEvent<T, NativeFocusEvent>
```

**Extends:** SyntheticEvent&lt;T, [NativeFocusEvent](#nativefocusevent)&gt;

| Property           | Modifiers | Type                | Description |
| ------------------ | --------- | ------------------- | ----------- |
| [relatedTarget](#) |           | EventTarget \| null |             |
| [target](#)        |           | EventTarget &amp; T |             |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts" target="_blanks">Edit this section</a></p>

<h2 id="qwikintrinsicelements" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#qwikintrinsicelements"><span class="icon icon-link"></span></a>QwikIntrinsicElements </h2>

```typescript
export interface QwikIntrinsicElements extends IntrinsicHTMLElements
```

**Extends:** IntrinsicHTMLElements

| Property    | Modifiers | Type                                              | Description |
| ----------- | --------- | ------------------------------------------------- | ----------- |
| [script](#) |           | QwikScriptHTMLAttributes&lt;HTMLScriptElement&gt; |             |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-elements.ts" target="_blanks">Edit this section</a></p>

<h2 id="qwikinvalidevent" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#qwikinvalidevent"><span class="icon icon-link"></span></a>QwikInvalidEvent </h2>

```typescript
export interface QwikInvalidEvent<T = Element> extends SyntheticEvent<T>
```

**Extends:** SyntheticEvent&lt;T&gt;

| Property    | Modifiers | Type                | Description |
| ----------- | --------- | ------------------- | ----------- |
| [target](#) |           | EventTarget &amp; T |             |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts" target="_blanks">Edit this section</a></p>

<h2 id="qwikjsx" data-kind="namespace" data-kind-label="N"><a aria-hidden="true" tabindex="-1" href="#qwikjsx"><span class="icon icon-link"></span></a>QwikJSX </h2>

```typescript
export declare namespace QwikJSX
```

| Interface                     | Description |
| ----------------------------- | ----------- |
| [Element](#)                  |             |
| [ElementChildrenAttribute](#) |             |
| [IntrinsicAttributes](#)      |             |
| [IntrinsicElements](#)        |             |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik.ts" target="_blanks">Edit this section</a></p>

<h2 id="qwikkeyboardevent" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#qwikkeyboardevent"><span class="icon icon-link"></span></a>QwikKeyboardEvent </h2>

```typescript
export interface QwikKeyboardEvent<T = Element> extends SyntheticEvent<T, NativeKeyboardEvent>
```

**Extends:** SyntheticEvent&lt;T, [NativeKeyboardEvent](#nativekeyboardevent)&gt;

| Property      | Modifiers | Type    | Description                                                                                                               |
| ------------- | --------- | ------- | ------------------------------------------------------------------------------------------------------------------------- |
| [altKey](#)   |           | boolean |                                                                                                                           |
| [charCode](#) |           | number  |                                                                                                                           |
| [ctrlKey](#)  |           | boolean |                                                                                                                           |
| [key](#)      |           | string  | See the \[DOM Level 3 Events spec\](https://www.w3.org/TR/uievents-key/\#named-key-attribute-values). for possible values |
| [keyCode](#)  |           | number  |                                                                                                                           |
| [locale](#)   |           | string  |                                                                                                                           |
| [location](#) |           | number  |                                                                                                                           |
| [metaKey](#)  |           | boolean |                                                                                                                           |
| [repeat](#)   |           | boolean |                                                                                                                           |
| [shiftKey](#) |           | boolean |                                                                                                                           |
| [which](#)    |           | number  |                                                                                                                           |

| Method                                                       | Description                                                                                                                                         |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| [getModifierState(key)](#qwikkeyboardevent-getmodifierstate) | See \[DOM Level 3 Events spec\](https://www.w3.org/TR/uievents-key/\#keys-modifier). for a list of valid (case-sensitive) arguments to this method. |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts" target="_blanks">Edit this section</a></p>

<h2 id="qwikmouseevent" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#qwikmouseevent"><span class="icon icon-link"></span></a>QwikMouseEvent </h2>

```typescript
export interface QwikMouseEvent<T = Element, E = NativeMouseEvent> extends SyntheticEvent<T, E>
```

**Extends:** SyntheticEvent&lt;T, E&gt;

| Property           | Modifiers | Type                | Description |
| ------------------ | --------- | ------------------- | ----------- |
| [altKey](#)        |           | boolean             |             |
| [button](#)        |           | number              |             |
| [buttons](#)       |           | number              |             |
| [clientX](#)       |           | number              |             |
| [clientY](#)       |           | number              |             |
| [ctrlKey](#)       |           | boolean             |             |
| [metaKey](#)       |           | boolean             |             |
| [movementX](#)     |           | number              |             |
| [movementY](#)     |           | number              |             |
| [pageX](#)         |           | number              |             |
| [pageY](#)         |           | number              |             |
| [relatedTarget](#) |           | EventTarget \| null |             |
| [screenX](#)       |           | number              |             |
| [screenY](#)       |           | number              |             |
| [shiftKey](#)      |           | boolean             |             |
| [x](#)             |           | number              |             |
| [y](#)             |           | number              |             |

| Method                     | Description                                                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| [getModifierState(key)](#) | See \[DOM Level 3 Events spec\](https://www.w3.org/TR/uievents-key/\#keys-modifier). for a list of valid (case-sensitive) arguments to this method. |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts" target="_blanks">Edit this section</a></p>

<h2 id="qwikpointerevent" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#qwikpointerevent"><span class="icon icon-link"></span></a>QwikPointerEvent </h2>

```typescript
export interface QwikPointerEvent<T = Element> extends QwikMouseEvent<T, NativePointerEvent>
```

**Extends:** [QwikMouseEvent](#qwikmouseevent)&lt;T, [NativePointerEvent](#nativepointerevent)&gt;

| Property         | Modifiers | Type                        | Description |
| ---------------- | --------- | --------------------------- | ----------- |
| [height](#)      |           | number                      |             |
| [isPrimary](#)   |           | boolean                     |             |
| [pointerId](#)   |           | number                      |             |
| [pointerType](#) |           | 'mouse' \| 'pen' \| 'touch' |             |
| [pressure](#)    |           | number                      |             |
| [tiltX](#)       |           | number                      |             |
| [tiltY](#)       |           | number                      |             |
| [width](#)       |           | number                      |             |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts" target="_blanks">Edit this section</a></p>

<h2 id="qwiksubmitevent" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#qwiksubmitevent"><span class="icon icon-link"></span></a>QwikSubmitEvent </h2>

```typescript
export interface QwikSubmitEvent<T = Element> extends SyntheticEvent<T>
```

**Extends:** SyntheticEvent&lt;T&gt;

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts" target="_blanks">Edit this section</a></p>

<h2 id="qwiktouchevent" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#qwiktouchevent"><span class="icon icon-link"></span></a>QwikTouchEvent </h2>

```typescript
export interface QwikTouchEvent<T = Element> extends SyntheticEvent<T, NativeTouchEvent>
```

**Extends:** SyntheticEvent&lt;T, [NativeTouchEvent](#nativetouchevent)&gt;

| Property            | Modifiers | Type      | Description |
| ------------------- | --------- | --------- | ----------- |
| [altKey](#)         |           | boolean   |             |
| [changedTouches](#) |           | TouchList |             |
| [ctrlKey](#)        |           | boolean   |             |
| [metaKey](#)        |           | boolean   |             |
| [shiftKey](#)       |           | boolean   |             |
| [targetTouches](#)  |           | TouchList |             |
| [touches](#)        |           | TouchList |             |

| Method                     | Description                                                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| [getModifierState(key)](#) | See \[DOM Level 3 Events spec\](https://www.w3.org/TR/uievents-key/\#keys-modifier). for a list of valid (case-sensitive) arguments to this method. |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts" target="_blanks">Edit this section</a></p>

<h2 id="qwiktransitionevent" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#qwiktransitionevent"><span class="icon icon-link"></span></a>QwikTransitionEvent </h2>

```typescript
export interface QwikTransitionEvent<T = Element> extends SyntheticEvent<T, NativeTransitionEvent>
```

**Extends:** SyntheticEvent&lt;T, [NativeTransitionEvent](#nativetransitionevent)&gt;

| Property           | Modifiers | Type   | Description |
| ------------------ | --------- | ------ | ----------- |
| [elapsedTime](#)   |           | number |             |
| [propertyName](#)  |           | string |             |
| [pseudoElement](#) |           | string |             |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts" target="_blanks">Edit this section</a></p>

<h2 id="qwikuievent" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#qwikuievent"><span class="icon icon-link"></span></a>QwikUIEvent </h2>

```typescript
export interface QwikUIEvent<T = Element> extends SyntheticEvent<T, NativeUIEvent>
```

**Extends:** SyntheticEvent&lt;T, [NativeUIEvent](#nativeuievent)&gt;

| Property    | Modifiers | Type         | Description |
| ----------- | --------- | ------------ | ----------- |
| [detail](#) |           | number       |             |
| [view](#)   |           | AbstractView |             |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts" target="_blanks">Edit this section</a></p>

<h2 id="qwikwheelevent" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#qwikwheelevent"><span class="icon icon-link"></span></a>QwikWheelEvent </h2>

```typescript
export interface QwikWheelEvent<T = Element> extends QwikMouseEvent<T, NativeWheelEvent>
```

**Extends:** [QwikMouseEvent](#qwikmouseevent)&lt;T, [NativeWheelEvent](#nativewheelevent)&gt;

| Property       | Modifiers | Type   | Description |
| -------------- | --------- | ------ | ----------- |
| [deltaMode](#) |           | number |             |
| [deltaX](#)    |           | number |             |
| [deltaY](#)    |           | number |             |
| [deltaZ](#)    |           | number |             |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/types/jsx-qwik-events.ts" target="_blanks">Edit this section</a></p>

<h2 id="render" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#render"><span class="icon icon-link"></span></a>render </h2>

Render JSX.

Use this method to render JSX. This function does reconciling which means it always tries to reuse what is already in the DOM (rather then destroy and recreate content.) It returns a cleanup function you could use for cleaning up subscriptions.

```typescript
render: (
  parent: Element | Document,
  jsxNode: JSXNode | FunctionComponent<any>,
  opts?: RenderOptions
) => Promise<RenderResult>;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/dom/render.public.ts" target="_blanks">Edit this section</a></p>

<h2 id="renderonce" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#renderonce"><span class="icon icon-link"></span></a>RenderOnce </h2>

```typescript
RenderOnce: FunctionComponent<{
  children?: any;
  key?: string | number | null | undefined;
}>;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/jsx-runtime.ts" target="_blanks">Edit this section</a></p>

<h2 id="renderoptions" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#renderoptions"><span class="icon icon-link"></span></a>RenderOptions </h2>

```typescript
export interface RenderOptions
```

| Property         | Modifiers | Type                      | Description  |
| ---------------- | --------- | ------------------------- | ------------ |
| [serverData?](#) |           | Record&lt;string, any&gt; | _(Optional)_ |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/dom/render.public.ts" target="_blanks">Edit this section</a></p>

<h2 id="renderresult" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#renderresult"><span class="icon icon-link"></span></a>RenderResult </h2>

```typescript
export interface RenderResult
```

| Method                             | Description |
| ---------------------------------- | ----------- |
| [cleanup()](#renderresult-cleanup) |             |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/dom/render.public.ts" target="_blanks">Edit this section</a></p>

<h2 id="renderssroptions" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#renderssroptions"><span class="icon icon-link"></span></a>RenderSSROptions </h2>

```typescript
export interface RenderSSROptions
```

| Property                 | Modifiers | Type                                                                                                                        | Description  |
| ------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------- | ------------ |
| [base?](#)               |           | string                                                                                                                      | _(Optional)_ |
| [beforeClose?](#)        |           | (contexts: QContext\[\], containerState: ContainerState, containsDynamic: boolean) =&gt; Promise&lt;[JSXNode](#jsxnode)&gt; | _(Optional)_ |
| [beforeContent?](#)      |           | [JSXNode](#jsxnode)&lt;string&gt;\[\]                                                                                       | _(Optional)_ |
| [containerAttributes](#) |           | Record&lt;string, string&gt;                                                                                                |              |
| [containerTagName](#)    |           | string                                                                                                                      |              |
| [serverData?](#)         |           | Record&lt;string, any&gt;                                                                                                   | _(Optional)_ |
| [stream](#)              |           | [StreamWriter](#streamwriter)                                                                                               |              |
| [url?](#)                |           | string                                                                                                                      | _(Optional)_ |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/ssr/render-ssr.ts" target="_blanks">Edit this section</a></p>

<h2 id="qrl-resolve" data-kind="method-signature" data-kind-label="M"><a aria-hidden="true" tabindex="-1" href="#qrl-resolve"><span class="icon icon-link"></span></a>resolve </h2>

Resolve the QRL and return the actual value.

```typescript
resolve(): Promise<TYPE>;
```

**Returns:**

Promise&lt;TYPE&gt;

<h2 id="resource" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#resource"><span class="icon icon-link"></span></a>Resource </h2>

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

```typescript
Resource: <T>(props: ResourceProps<T>) => JSXNode;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-resource.ts" target="_blanks">Edit this section</a></p>

<h2 id="resourcectx" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#resourcectx"><span class="icon icon-link"></span></a>ResourceCtx </h2>

```typescript
export interface ResourceCtx<T>
```

| Property      | Modifiers | Type                | Description |
| ------------- | --------- | ------------------- | ----------- |
| [previous](#) |           | T \| undefined      |             |
| [track](#)    |           | [Tracker](#tracker) |             |

| Method                                            | Description |
| ------------------------------------------------- | ----------- |
| [cache(policyOrMilliseconds)](#resourcectx-cache) |             |
| [cleanup(callback)](#)                            |             |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts" target="_blanks">Edit this section</a></p>

<h2 id="resourcefn" data-kind="type-alias" data-kind-label="T"><a aria-hidden="true" tabindex="-1" href="#resourcefn"><span class="icon icon-link"></span></a>ResourceFn </h2>

```typescript
export type ResourceFn<T> = (ctx: ResourceCtx<T>) => ValueOrPromise<T>;
```

**References:** [ResourceCtx](#resourcectx), [ValueOrPromise](#valueorpromise)

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts" target="_blanks">Edit this section</a></p>

<h2 id="resourceoptions" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#resourceoptions"><span class="icon icon-link"></span></a>ResourceOptions </h2>

Options to pass to `useResource$()`

```typescript
export interface ResourceOptions
```

| Property      | Modifiers | Type   | Description                                                                                                                                         |
| ------------- | --------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| [timeout?](#) |           | number | _(Optional)_ Timeout in milliseconds. If the resource takes more than the specified millisecond, it will timeout. Resulting on a rejected resource. |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-resource.ts" target="_blanks">Edit this section</a></p>

<h2 id="resourcepending" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#resourcepending"><span class="icon icon-link"></span></a>ResourcePending </h2>

```typescript
export interface ResourcePending<T>
```

| Property     | Modifiers             | Type             | Description |
| ------------ | --------------------- | ---------------- | ----------- |
| [loading](#) | <code>readonly</code> | boolean          |             |
| [value](#)   | <code>readonly</code> | Promise&lt;T&gt; |             |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts" target="_blanks">Edit this section</a></p>

<h2 id="resourceprops" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#resourceprops"><span class="icon icon-link"></span></a>ResourceProps </h2>

```typescript
export interface ResourceProps<T>
```

| Property         | Modifiers             | Type                                                                                                             | Description  |
| ---------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------ |
| [onPending?](#)  |                       | () =&gt; [JSXNode](#jsxnode)                                                                                     | _(Optional)_ |
| [onRejected?](#) |                       | (reason: any) =&gt; [JSXNode](#jsxnode)                                                                          | _(Optional)_ |
| [onResolved](#)  |                       | (value: T) =&gt; [JSXNode](#jsxnode)                                                                             |              |
| [value](#)       | <code>readonly</code> | [ResourceReturn](#resourcereturn)&lt;T&gt; \| [Signal](#signal)&lt;Promise&lt;T&gt; \| T&gt; \| Promise&lt;T&gt; |              |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-resource.ts" target="_blanks">Edit this section</a></p>

<h2 id="resourcerejected" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#resourcerejected"><span class="icon icon-link"></span></a>ResourceRejected </h2>

```typescript
export interface ResourceRejected<T>
```

| Property     | Modifiers             | Type             | Description |
| ------------ | --------------------- | ---------------- | ----------- |
| [loading](#) | <code>readonly</code> | boolean          |             |
| [value](#)   | <code>readonly</code> | Promise&lt;T&gt; |             |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts" target="_blanks">Edit this section</a></p>

<h2 id="resourceresolved" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#resourceresolved"><span class="icon icon-link"></span></a>ResourceResolved </h2>

```typescript
export interface ResourceResolved<T>
```

| Property     | Modifiers             | Type             | Description |
| ------------ | --------------------- | ---------------- | ----------- |
| [loading](#) | <code>readonly</code> | boolean          |             |
| [value](#)   | <code>readonly</code> | Promise&lt;T&gt; |             |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts" target="_blanks">Edit this section</a></p>

<h2 id="resourcereturn" data-kind="type-alias" data-kind-label="T"><a aria-hidden="true" tabindex="-1" href="#resourcereturn"><span class="icon icon-link"></span></a>ResourceReturn </h2>

```typescript
export type ResourceReturn<T> =
  | ResourcePending<T>
  | ResourceResolved<T>
  | ResourceRejected<T>;
```

**References:** [ResourcePending](#resourcepending), [ResourceResolved](#resourceresolved), [ResourceRejected](#resourcerejected)

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts" target="_blanks">Edit this section</a></p>

<h2 id="setplatform" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#setplatform"><span class="icon icon-link"></span></a>setPlatform </h2>

Sets the `CorePlatform`.

This is useful to override the platform in tests to change the behavior of, `requestAnimationFrame`, and import resolution.

```typescript
setPlatform: (plt: CorePlatform) => CorePlatform;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/platform/platform.ts" target="_blanks">Edit this section</a></p>

<h2 id="signal" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#signal"><span class="icon icon-link"></span></a>Signal </h2>

```typescript
export interface Signal<T = any>
```

| Property   | Modifiers | Type | Description |
| ---------- | --------- | ---- | ----------- |
| [value](#) |           | T    |             |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/state/signal.ts" target="_blanks">Edit this section</a></p>

<h2 id="skiprender" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#skiprender"><span class="icon icon-link"></span></a>SkipRender </h2>

```typescript
SkipRender: JSXNode;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/utils.public.ts" target="_blanks">Edit this section</a></p>

<h2 id="slot" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#slot"><span class="icon icon-link"></span></a>Slot </h2>

Allows to project the children of the current component. can only be used within the context of a component defined with `component$`.

```typescript
Slot: FunctionComponent<{
  name?: string;
}>;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/slot.public.ts" target="_blanks">Edit this section</a></p>

<h2 id="snapshotlistener" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#snapshotlistener"><span class="icon icon-link"></span></a>SnapshotListener </h2>

```typescript
export interface SnapshotListener
```

| Property | Modifiers | Type                   | Description |
| -------- | --------- | ---------------------- | ----------- |
| [el](#)  |           | Element                |             |
| [key](#) |           | string                 |             |
| [qrl](#) |           | [QRL](#qrl)&lt;any&gt; |             |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/container/container.ts" target="_blanks">Edit this section</a></p>

<h2 id="snapshotmeta" data-kind="type-alias" data-kind-label="T"><a aria-hidden="true" tabindex="-1" href="#snapshotmeta"><span class="icon icon-link"></span></a>SnapshotMeta </h2>

```typescript
export type SnapshotMeta = Record<string, SnapshotMetaValue>;
```

**References:** [SnapshotMetaValue](#snapshotmetavalue)

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/container/container.ts" target="_blanks">Edit this section</a></p>

<h2 id="snapshotmetavalue" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#snapshotmetavalue"><span class="icon icon-link"></span></a>SnapshotMetaValue </h2>

```typescript
export interface SnapshotMetaValue
```

| Property | Modifiers | Type   | Description  |
| -------- | --------- | ------ | ------------ |
| [c?](#)  |           | string | _(Optional)_ |
| [h?](#)  |           | string | _(Optional)_ |
| [s?](#)  |           | string | _(Optional)_ |
| [w?](#)  |           | string | _(Optional)_ |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/container/container.ts" target="_blanks">Edit this section</a></p>

<h2 id="snapshotresult" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#snapshotresult"><span class="icon icon-link"></span></a>SnapshotResult </h2>

```typescript
export interface SnapshotResult
```

| Property       | Modifiers | Type                                  | Description |
| -------------- | --------- | ------------------------------------- | ----------- |
| [funcs](#)     |           | string\[\]                            |             |
| [mode](#)      |           | 'render' \| 'listeners' \| 'static'   |             |
| [objs](#)      |           | any\[\]                               |             |
| [qrls](#)      |           | [QRL](#qrl)\[\]                       |             |
| [resources](#) |           | ResourceReturnInternal&lt;any&gt;\[\] |             |
| [state](#)     |           | [SnapshotState](#snapshotstate)       |             |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/container/container.ts" target="_blanks">Edit this section</a></p>

<h2 id="snapshotstate" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#snapshotstate"><span class="icon icon-link"></span></a>SnapshotState </h2>

```typescript
export interface SnapshotState
```

| Property  | Modifiers | Type                          | Description |
| --------- | --------- | ----------------------------- | ----------- |
| [ctx](#)  |           | [SnapshotMeta](#snapshotmeta) |             |
| [objs](#) |           | any\[\]                       |             |
| [refs](#) |           | Record&lt;string, string&gt;  |             |
| [subs](#) |           | any\[\]                       |             |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/container/container.ts" target="_blanks">Edit this section</a></p>

<h2 id="ssrcomment" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#ssrcomment"><span class="icon icon-link"></span></a>SSRComment </h2>

```typescript
SSRComment: FunctionComponent<{
  data: string;
}>;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/utils.public.ts" target="_blanks">Edit this section</a></p>

<h2 id="ssrhint" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#ssrhint"><span class="icon icon-link"></span></a>SSRHint </h2>

```typescript
SSRHint: FunctionComponent<SSRHintProps>;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/utils.public.ts" target="_blanks">Edit this section</a></p>

<h2 id="ssrhintprops" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#ssrhintprops"><span class="icon icon-link"></span></a>SSRHintProps </h2>

```typescript
export interface SSRHintProps
```

| Property      | Modifiers | Type    | Description  |
| ------------- | --------- | ------- | ------------ |
| [dynamic?](#) |           | boolean | _(Optional)_ |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/utils.public.ts" target="_blanks">Edit this section</a></p>

<h2 id="ssrraw" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#ssrraw"><span class="icon icon-link"></span></a>SSRRaw </h2>

```typescript
SSRRaw: FunctionComponent<{
  data: string;
}>;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/utils.public.ts" target="_blanks">Edit this section</a></p>

<h2 id="ssrstream" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#ssrstream"><span class="icon icon-link"></span></a>SSRStream </h2>

```typescript
SSRStream: FunctionComponent<SSRStreamProps>;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/utils.public.ts" target="_blanks">Edit this section</a></p>

<h2 id="ssrstreamblock" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#ssrstreamblock"><span class="icon icon-link"></span></a>SSRStreamBlock </h2>

```typescript
SSRStreamBlock: FunctionComponent<{
  children?: any;
}>;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/utils.public.ts" target="_blanks">Edit this section</a></p>

<h2 id="ssrstreamprops" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#ssrstreamprops"><span class="icon icon-link"></span></a>SSRStreamProps </h2>

```typescript
export interface SSRStreamProps
```

| Property      | Modifiers | Type                                                                                                                                                                                                           | Description |
| ------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| [children](#) |           | AsyncGenerator&lt;[JSXChildren](#jsxchildren), void, any&gt; \| ((stream: [StreamWriter](#streamwriter)) =&gt; Promise&lt;void&gt;) \| (() =&gt; AsyncGenerator&lt;[JSXChildren](#jsxchildren), void, any&gt;) |             |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/jsx/utils.public.ts" target="_blanks">Edit this section</a></p>

<h2 id="streamwriter" data-kind="type-alias" data-kind-label="T"><a aria-hidden="true" tabindex="-1" href="#streamwriter"><span class="icon icon-link"></span></a>StreamWriter </h2>

```typescript
export type StreamWriter = {
  write: (chunk: string) => void;
};
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/render/ssr/render-ssr.ts" target="_blanks">Edit this section</a></p>

<h2 id="taskctx" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#taskctx"><span class="icon icon-link"></span></a>TaskCtx </h2>

```typescript
export interface TaskCtx
```

| Property   | Modifiers | Type                | Description |
| ---------- | --------- | ------------------- | ----------- |
| [track](#) |           | [Tracker](#tracker) |             |

| Method                 | Description |
| ---------------------- | ----------- |
| [cleanup(callback)](#) |             |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts" target="_blanks">Edit this section</a></p>

<h2 id="taskfn" data-kind="type-alias" data-kind-label="T"><a aria-hidden="true" tabindex="-1" href="#taskfn"><span class="icon icon-link"></span></a>TaskFn </h2>

```typescript
export type TaskFn = (ctx: TaskCtx) => ValueOrPromise<void | (() => void)>;
```

**References:** [TaskCtx](#taskctx), [ValueOrPromise](#valueorpromise)

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts" target="_blanks">Edit this section</a></p>

<h2 id="tracker" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#tracker"><span class="icon icon-link"></span></a>Tracker </h2>

Used to signal to Qwik which state should be watched for changes.

The `Tracker` is passed into the `taskFn` of `useTask`. It is intended to be used to wrap state objects in a read proxy which signals to Qwik which properties should be watched for changes. A change to any of the properties causes the `taskFn` to rerun.

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

```typescript
export interface Tracker
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts" target="_blanks">Edit this section</a></p>

<h2 id="untrack" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#untrack"><span class="icon icon-link"></span></a>untrack </h2>

```typescript
untrack: <T>(fn: () => T) => T;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-core.ts" target="_blanks">Edit this section</a></p>

<h2 id="usecomputed_" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#usecomputed_"><span class="icon icon-link"></span></a>useComputed$ </h2>

```typescript
useComputed$: Computed;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts" target="_blanks">Edit this section</a></p>

<h2 id="usecomputedqrl" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#usecomputedqrl"><span class="icon icon-link"></span></a>useComputedQrl </h2>

```typescript
useComputedQrl: ComputedQRL;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts" target="_blanks">Edit this section</a></p>

<h2 id="usecontext" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#usecontext"><span class="icon icon-link"></span></a>useContext </h2>

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

```typescript
useContext: UseContext;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-context.ts" target="_blanks">Edit this section</a></p>

<h2 id="usecontextprovider" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#usecontextprovider"><span class="icon icon-link"></span></a>useContextProvider </h2>

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

```typescript
useContextProvider: <STATE extends object>(context: ContextId<STATE>, newValue: STATE) => void
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-context.ts" target="_blanks">Edit this section</a></p>

<h2 id="useerrorboundary" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#useerrorboundary"><span class="icon icon-link"></span></a>useErrorBoundary </h2>

```typescript
useErrorBoundary: () => Readonly<ErrorBoundaryStore>;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-error-boundary.ts" target="_blanks">Edit this section</a></p>

<h2 id="useid" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#useid"><span class="icon icon-link"></span></a>useId </h2>

```typescript
useId: () => string;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-id.ts" target="_blanks">Edit this section</a></p>

<h2 id="useon" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#useon"><span class="icon icon-link"></span></a>useOn </h2>

Register a listener on the current component's host element.

Used to programmatically add event listeners. Useful from custom `use*` methods, which do not have access to the JSX. Otherwise, it's adding a JSX listener in the `<div>` is a better idea.

```typescript
useOn: (event: string | string[], eventQrl: QRL<(ev: Event) => void>) => void
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-on.ts" target="_blanks">Edit this section</a></p>

<h2 id="useondocument" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#useondocument"><span class="icon icon-link"></span></a>useOnDocument </h2>

Register a listener on `document`.

Used to programmatically add event listeners. Useful from custom `use*` methods, which do not have access to the JSX.

```typescript
useOnDocument: (event: string | string[], eventQrl: QRL<(ev: Event) => void>) => void
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-on.ts" target="_blanks">Edit this section</a></p>

<h2 id="useonwindow" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#useonwindow"><span class="icon icon-link"></span></a>useOnWindow </h2>

Register a listener on `window`.

Used to programmatically add event listeners. Useful from custom `use*` methods, which do not have access to the JSX.

```typescript
useOnWindow: (event: string | string[], eventQrl: QRL<(ev: Event) => void>) => void
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-on.ts" target="_blanks">Edit this section</a></p>

<h2 id="useresource_" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#useresource_"><span class="icon icon-link"></span></a>useResource$ </h2>

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

```typescript
useResource$: <T>(generatorFn: ResourceFn<T>, opts?: ResourceOptions) =>
  ResourceReturn<T>;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-resource.ts" target="_blanks">Edit this section</a></p>

<h2 id="useresourceqrl" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#useresourceqrl"><span class="icon icon-link"></span></a>useResourceQrl </h2>

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

```typescript
useResourceQrl: <T>(qrl: QRL<ResourceFn<T>>, opts?: ResourceOptions) =>
  ResourceReturn<T>;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-resource.ts" target="_blanks">Edit this section</a></p>

<h2 id="useserverdata" data-kind="function" data-kind-label="F"><a aria-hidden="true" tabindex="-1" href="#useserverdata"><span class="icon icon-link"></span></a>useServerData </h2>

```typescript
export declare function useServerData<T>(key: string): T | undefined;
```

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| key       | string |             |

**Returns:**

T \| undefined

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-env-data.ts" target="_blanks">Edit this section</a></p>

<h2 id="usesignal" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#usesignal"><span class="icon icon-link"></span></a>useSignal </h2>

```typescript
useSignal: UseSignal;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-signal.ts" target="_blanks">Edit this section</a></p>

<h2 id="usesignal" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#usesignal"><span class="icon icon-link"></span></a>UseSignal </h2>

```typescript
useSignal: UseSignal;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-signal.ts" target="_blanks">Edit this section</a></p>

<h2 id="usestore" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#usestore"><span class="icon icon-link"></span></a>useStore </h2>

Creates an object that Qwik can track across serializations.

Use `useStore` to create a state for your application. The returned object is a proxy that has a unique ID. The ID of the object is used in the `QRL`s to refer to the store.

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

```typescript
useStore: <STATE extends object>(
  initialState: STATE | (() => STATE),
  opts?: UseStoreOptions
) => STATE;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-store.public.ts" target="_blanks">Edit this section</a></p>

<h2 id="usestoreoptions" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#usestoreoptions"><span class="icon icon-link"></span></a>UseStoreOptions </h2>

```typescript
export interface UseStoreOptions
```

| Property       | Modifiers | Type    | Description                                                                                                                  |
| -------------- | --------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [deep?](#)     |           | boolean | _(Optional)_ If <code>true</code> then all nested objects and arrays will be tracked as well. Default is <code>false</code>. |
| [reactive?](#) |           | boolean | _(Optional)_ If <code>false</code> then the object will not be tracked for changes. Default is <code>true</code>.            |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-store.public.ts" target="_blanks">Edit this section</a></p>

<h2 id="usestyles_" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#usestyles_"><span class="icon icon-link"></span></a>useStyles$ </h2>

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

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-styles.ts" target="_blanks">Edit this section</a></p>

<h2 id="usestylesqrl" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#usestylesqrl"><span class="icon icon-link"></span></a>useStylesQrl </h2>

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

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-styles.ts" target="_blanks">Edit this section</a></p>

<h2 id="usestylesscoped" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#usestylesscoped"><span class="icon icon-link"></span></a>UseStylesScoped </h2>

```typescript
export interface UseStylesScoped
```

| Property     | Modifiers | Type   | Description |
| ------------ | --------- | ------ | ----------- |
| [scopeId](#) |           | string |             |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-styles.ts" target="_blanks">Edit this section</a></p>

<h2 id="usestylesscoped_" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#usestylesscoped_"><span class="icon icon-link"></span></a>useStylesScoped$ </h2>

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

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-styles.ts" target="_blanks">Edit this section</a></p>

<h2 id="usestylesscopedqrl" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#usestylesscopedqrl"><span class="icon icon-link"></span></a>useStylesScopedQrl </h2>

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

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-styles.ts" target="_blanks">Edit this section</a></p>

<h2 id="usetask_" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#usetask_"><span class="icon icon-link"></span></a>useTask$ </h2>

Reruns the `taskFn` when the observed inputs change.

Use `useTask` to observe changes on a set of inputs, and then re-execute the `taskFn` when those inputs change.

The `taskFn` only executes if the observed inputs change. To observe the inputs, use the `obs` function to wrap property reads. This creates subscriptions that will trigger the `taskFn` to rerun.

```typescript
useTask$: (first: TaskFn, opts?: UseTaskOptions | undefined) => void
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts" target="_blanks">Edit this section</a></p>

<h2 id="usetaskoptions" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#usetaskoptions"><span class="icon icon-link"></span></a>UseTaskOptions </h2>

```typescript
export interface UseTaskOptions
```

| Property        | Modifiers | Type                                  | Description                                                                                                                                                |
| --------------- | --------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [eagerness?](#) |           | [EagernessOptions](#eagernessoptions) | _(Optional)_ - <code>visible</code>: run the effect when the element is visible. - <code>load</code>: eagerly run the effect when the application resumes. |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts" target="_blanks">Edit this section</a></p>

<h2 id="usetaskqrl" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#usetaskqrl"><span class="icon icon-link"></span></a>useTaskQrl </h2>

Reruns the `taskFn` when the observed inputs change.

Use `useTask` to observe changes on a set of inputs, and then re-execute the `taskFn` when those inputs change.

The `taskFn` only executes if the observed inputs change. To observe the inputs, use the `obs` function to wrap property reads. This creates subscriptions that will trigger the `taskFn` to rerun.

```typescript
useTaskQrl: (qrl: QRL<TaskFn>, opts?: UseTaskOptions) => void
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts" target="_blanks">Edit this section</a></p>

<h2 id="usevisibletask_" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#usevisibletask_"><span class="icon icon-link"></span></a>useVisibleTask$ </h2>

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

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts" target="_blanks">Edit this section</a></p>

<h2 id="usevisibletaskqrl" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#usevisibletaskqrl"><span class="icon icon-link"></span></a>useVisibleTaskQrl </h2>

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

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts" target="_blanks">Edit this section</a></p>

<h2 id="valueorpromise" data-kind="type-alias" data-kind-label="T"><a aria-hidden="true" tabindex="-1" href="#valueorpromise"><span class="icon icon-link"></span></a>ValueOrPromise </h2>

Type representing a value which is either resolve or a promise.

```typescript
export type ValueOrPromise<T> = T | Promise<T>;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/util/types.ts" target="_blanks">Edit this section</a></p>

<h2 id="version" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#version"><span class="icon icon-link"></span></a>version </h2>

QWIK_VERSION

```typescript
version: string;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/version.ts" target="_blanks">Edit this section</a></p>

<h2 id="visibletaskstrategy" data-kind="type-alias" data-kind-label="T"><a aria-hidden="true" tabindex="-1" href="#visibletaskstrategy"><span class="icon icon-link"></span></a>VisibleTaskStrategy </h2>

```typescript
export type VisibleTaskStrategy =
  | "intersection-observer"
  | "document-ready"
  | "document-idle";
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/core/use/use-task.ts" target="_blanks">Edit this section</a></p>
