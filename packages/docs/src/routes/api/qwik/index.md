---
title: \@qwik.dev/qwik API Reference
---

# [API](/api) &rsaquo; @qwik.dev/qwik

## "q:slot"

```typescript
'q:slot'?: string;
```

## $

Qwik Optimizer marker function.

Use `$(...)` to tell Qwik Optimizer to extract the expression in `$(...)` into a lazy-loadable resource referenced by `QRL`.

```typescript
$: <T>(expression: T) => QRL<T>;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

expression

</td><td>

T

</td><td>

Expression which should be lazy loaded

</td></tr>
</tbody></table>
**Returns:**

[QRL](#qrl)&lt;T&gt;

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/qrl/qrl.public.ts)

## cache

```typescript
cache(policyOrMilliseconds: number | 'immutable'): void;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

policyOrMilliseconds

</td><td>

number \| 'immutable'

</td><td>

</td></tr>
</tbody></table>
**Returns:**

void

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

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-attributes.ts)

## cleanup

```typescript
cleanup(): void;
```

**Returns:**

void

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
export type Component<PROPS = unknown> = FunctionComponent<PublicProps<PROPS>>;
```

**References:** [FunctionComponent](#functioncomponent), [PublicProps](#publicprops)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/component.public.ts)

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
component$: <PROPS = unknown>(onMount: OnRenderFn<PROPS>) => Component<PROPS>;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

onMount

</td><td>

[OnRenderFn](#onrenderfn)&lt;PROPS&gt;

</td><td>

</td></tr>
</tbody></table>
**Returns:**

[Component](#component)&lt;PROPS&gt;

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/component.public.ts)

## ComponentBaseProps

```typescript
export interface ComponentBaseProps
```

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

["q:slot"?](#componentbaseprops-_q_slot_)

</td><td>

</td><td>

string

</td><td>

_(Optional)_

</td></tr>
<tr><td>

[key?](#)

</td><td>

</td><td>

string \| number \| null \| undefined

</td><td>

_(Optional)_

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-attributes.ts)

## ComputedFn

```typescript
export type ComputedFn<T> = () => T;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-computed.ts)

## ComputedSignal

A computed signal is a signal which is calculated from other signals. When the signals change, the computed signal is recalculated, and if the result changed, all tasks which are tracking the signal will be re-run and all components that read the signal will be re-rendered.

```typescript
export interface ComputedSignal<T> extends ReadonlySignal<T>
```

**Extends:** [ReadonlySignal](#readonlysignal)&lt;T&gt;

<table><thead><tr><th>

Method

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[force()](#computedsignal-force)

</td><td>

Use this to force recalculation and running subscribers, for example when the calculated value mutates but remains the same object. Useful for third-party libraries.

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/signal/signal.public.ts)

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

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[\_\_brand_context_type\_\_](#)

</td><td>

`readonly`

</td><td>

STATE

</td><td>

Design-time property to store type information for the context.

</td></tr>
<tr><td>

[id](#)

</td><td>

`readonly`

</td><td>

string

</td><td>

A unique ID for the context.

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-context.ts)

## CorePlatform

Low-level API for platform abstraction.

Different platforms (browser, node, service workers) may have different ways of handling things such as `requestAnimationFrame` and imports. To make Qwik platform-independent Qwik uses the `CorePlatform` API to access the platform API.

`CorePlatform` also is responsible for importing symbols. The import map is different on the client (browser) then on the server. For this reason, the server has a manifest that is used to map symbols to javascript chunks. The manifest is encapsulated in `CorePlatform`, for this reason, the `CorePlatform` can't be global as there may be multiple applications running at server concurrently.

This is a low-level API and there should not be a need for you to access this.

```typescript
export interface CorePlatform
```

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[chunkForSymbol](#)

</td><td>

</td><td>

(symbolName: string, chunk: string \| null, parent?: string) =&gt; readonly [symbol: string, chunk: string] \| undefined

</td><td>

Retrieve chunk name for the symbol.

When the application is running on the server the symbols may be imported from different files (as server build is typically a single javascript chunk.) For this reason, it is necessary to convert the chunks from server format to client (browser) format. This is done by looking up symbols (which are globally unique) in the manifest. (Manifest is the mapping of symbols to the client chunk names.)

</td></tr>
<tr><td>

[importSymbol](#)

</td><td>

</td><td>

(containerEl: Element \| undefined, url: string \| URL \| undefined \| null, symbol: string) =&gt; [ValueOrPromise](#valueorpromise)&lt;any&gt;

</td><td>

Retrieve a symbol value from QRL.

Qwik needs to lazy load data and closures. For this Qwik uses QRLs that are serializable references of resources that are needed. The QRLs contain all the information necessary to retrieve the reference using `importSymbol`.

Why not use `import()`? Because `import()` is relative to the current file, and the current file is always the Qwik framework. So QRLs have additional information that allows them to serialize imports relative to application base rather than the Qwik framework file.

</td></tr>
<tr><td>

[isServer](#)

</td><td>

</td><td>

boolean

</td><td>

True of running on the server platform.

</td></tr>
<tr><td>

[nextTick](#)

</td><td>

</td><td>

(fn: () =&gt; any) =&gt; Promise&lt;any&gt;

</td><td>

Perform operation on next tick.

</td></tr>
<tr><td>

[raf](#)

</td><td>

</td><td>

(fn: () =&gt; any) =&gt; Promise&lt;any&gt;

</td><td>

Perform operation on next request-animation-frame.

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/platform/types.ts)

## CorrectedToggleEvent

This corrects the TS definition for ToggleEvent

```typescript
export interface CorrectedToggleEvent extends Event
```

**Extends:** Event

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[newState](#)

</td><td>

`readonly`

</td><td>

'open' \| 'closed'

</td><td>

</td></tr>
<tr><td>

[prevState](#)

</td><td>

`readonly`

</td><td>

'open' \| 'closed'

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-attributes.ts)

## createComputed$

Create a computed signal which is calculated from the given QRL. A computed signal is a signal which is calculated from other signals. When the signals change, the computed signal is recalculated.

The QRL must be a function which returns the value of the signal. The function must not have side effects, and it must be synchronous.

If you need the function to be async, use `useSignal` and `useTask$` instead.

```typescript
createComputed$: <T>(qrl: () => T) => T extends Promise<any> ? never : ComputedSignal<T>
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

qrl

</td><td>

() =&gt; T

</td><td>

</td></tr>
</tbody></table>
**Returns:**

T extends Promise&lt;any&gt; ? never : [ComputedSignal](#computedsignal)&lt;T&gt;

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/signal/signal.public.ts)

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

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

name

</td><td>

string

</td><td>

The name of the context.

</td></tr>
</tbody></table>
**Returns:**

[ContextId](#contextid)&lt;STATE&gt;

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-context.ts)

## createSerialized$

Create a signal that holds a custom serializable value. See [useSerialized$](#useserialized_) for more details.

```typescript
createSerialized$: <T extends CustomSerializable<any, S>, S = T extends {
    [SerializerSymbol]: (obj: any) => infer U;
} ? U : unknown>(qrl: (data: S | undefined) => T) => T extends Promise<any> ? never : SerializedSignal<T>
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

qrl

</td><td>

(data: S \| undefined) =&gt; T

</td><td>

</td></tr>
</tbody></table>
**Returns:**

T extends Promise&lt;any&gt; ? never : SerializedSignal&lt;T&gt;

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/signal/signal.public.ts)

## createSignal

Creates a Signal with the given value. If no value is given, the signal is created with `undefined`.

```typescript
createSignal: {
    <T>(): Signal<T | undefined>;
    <T>(value: T): Signal<T>;
}
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/signal/signal.public.ts)

## CSSProperties

```typescript
export interface CSSProperties extends CSS.Properties<string | number>, CSS.PropertiesHyphen<string | number>
```

**Extends:** CSS.Properties&lt;string \| number&gt;, CSS.PropertiesHyphen&lt;string \| number&gt;

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-generated.ts)

## DevJSX

```typescript
export interface DevJSX
```

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[columnNumber](#)

</td><td>

</td><td>

number

</td><td>

</td></tr>
<tr><td>

[fileName](#)

</td><td>

</td><td>

string

</td><td>

</td></tr>
<tr><td>

[lineNumber](#)

</td><td>

</td><td>

number

</td><td>

</td></tr>
<tr><td>

[stack?](#)

</td><td>

</td><td>

string

</td><td>

_(Optional)_

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-node.ts)

## DOMAttributes

The Qwik-specific attributes that DOM elements accept

```typescript
export interface DOMAttributes<EL extends Element> extends DOMAttributesBase<EL>, QwikEvents<EL>
```

**Extends:** DOMAttributesBase&lt;EL&gt;, QwikEvents&lt;EL&gt;

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[class?](#)

</td><td>

</td><td>

[ClassList](#classlist) \| [Signal](#signal)&lt;[ClassList](#classlist)&gt; \| undefined

</td><td>

_(Optional)_

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-attributes.ts)

## EagernessOptions

```typescript
export type EagernessOptions = "visible" | "load" | "idle";
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-task.ts)

## Element

```typescript
type Element = JSXOutput;
```

**References:** [JSXOutput](#jsxoutput)

## ElementChildrenAttribute

```typescript
interface ElementChildrenAttribute
```

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[children](#)

</td><td>

</td><td>

[JSXChildren](#jsxchildren)

</td><td>

</td></tr>
</tbody></table>

## ElementType

```typescript
type ElementType = string | FunctionComponent<Record<any, any>>;
```

**References:** [FunctionComponent](#functioncomponent)

## ErrorBoundaryStore

```typescript
export interface ErrorBoundaryStore
```

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[error](#)

</td><td>

</td><td>

any \| undefined

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/error/error-handling.ts)

## event$

```typescript
event$: <T>(qrl: T) => import("./qrl.public").QRL<T>;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

qrl

</td><td>

T

</td><td>

</td></tr>
</tbody></table>
**Returns:**

import("./qrl.public").[QRL](#qrl)&lt;T&gt;

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/qrl/qrl.public.dollar.ts)

## EventHandler

A DOM event handler

```typescript
export type EventHandler<EV = Event, EL = Element> = {
  bivarianceHack(event: EV, element: EL): any;
}["bivarianceHack"];
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-attributes.ts)

## force

Use this to force recalculation and running subscribers, for example when the calculated value mutates but remains the same object. Useful for third-party libraries.

```typescript
force(): void;
```

**Returns:**

void

## Fragment

```typescript
Fragment: FunctionComponent<{
  children?: any;
  key?: string | number | null;
}>;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/jsx-runtime.ts)

## FunctionComponent

Any function taking a props object that returns JSXOutput.

The `key`, `flags` and `dev` parameters are for internal use.

```typescript
export type FunctionComponent<P = unknown> = {
  renderFn(
    props: P,
    key: string | null,
    flags: number,
    dev?: DevJSX,
  ): JSXOutput;
}["renderFn"];
```

**References:** [DevJSX](#devjsx), [JSXOutput](#jsxoutput)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-node.ts)

## getDomContainer

```typescript
export declare function getDomContainer(
  element: Element | VNode,
): IClientContainer;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

element

</td><td>

Element \| VNode

</td><td>

</td></tr>
</tbody></table>
**Returns:**

IClientContainer

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/client/dom-container.ts)

## getLocale

Retrieve the current locale.

If no current locale and there is no `defaultLocale` the function throws an error.

```typescript
export declare function getLocale(defaultLocale?: string): string;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

defaultLocale

</td><td>

string

</td><td>

_(Optional)_

</td></tr>
</tbody></table>
**Returns:**

string

The locale.

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-locale.ts)

## getPlatform

Retrieve the `CorePlatform`.

The `CorePlatform` is also responsible for retrieving the Manifest, that contains mappings from symbols to javascript import chunks. For this reason, `CorePlatform` can't be global, but is specific to the application currently running. On server it is possible that many different applications are running in a single server instance, and for this reason the `CorePlatform` is associated with the application document.

```typescript
getPlatform: () => CorePlatform;
```

**Returns:**

[CorePlatform](#coreplatform)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/platform/platform.ts)

## h

The legacy transform, used in special cases like `<div {...props} key="key" />`. Note that the children are spread arguments, instead of a prop like in jsx() calls.

Also note that this disables optimizations.

```typescript
export declare function h<
  TYPE extends string | FunctionComponent<PROPS>,
  PROPS extends {} = {},
>(type: TYPE, props?: PROPS | null, ...children: any[]): JSXNode<TYPE>;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

type

</td><td>

TYPE

</td><td>

</td></tr>
<tr><td>

props

</td><td>

PROPS \| null

</td><td>

_(Optional)_

</td></tr>
<tr><td>

children

</td><td>

any[]

</td><td>

</td></tr>
</tbody></table>
**Returns:**

[JSXNode](#jsxnode)&lt;TYPE&gt;

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/jsx-runtime.ts)

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
    fn: (qrl: QRL<FIRST>, ...rest: REST) => RET,
  ) =>
  (qrl: FIRST, ...rest: REST) =>
    RET;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

fn

</td><td>

(qrl: [QRL](#qrl)&lt;FIRST&gt;, ...rest: REST) =&gt; RET

</td><td>

A function that should have its first argument automatically `$`.

</td></tr>
</tbody></table>
**Returns:**

((qrl: FIRST, ...rest: REST) =&gt; RET)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/qrl/implicit_dollar.ts)

## IntrinsicAttributes

```typescript
interface IntrinsicAttributes extends QwikIntrinsicAttributes
```

**Extends:** QwikIntrinsicAttributes

## IntrinsicElements

```typescript
interface IntrinsicElements extends LenientQwikElements
```

**Extends:** LenientQwikElements

## isSignal

```typescript
isSignal: (value: any) => value is ISignal<unknown>
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

value

</td><td>

any

</td><td>

</td></tr>
</tbody></table>
**Returns:**

value is [ISignal](#signal)&lt;unknown&gt;

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/signal/signal.ts)

## jsx

Used by the JSX transpilers to create a JSXNode. Note that the optimizer will not use this, instead using \_jsxSplit and \_jsxSorted directly.

```typescript
jsx: <T extends string | FunctionComponent<any>>(
  type: T,
  props: T extends FunctionComponent<infer PROPS> ? PROPS : Props,
  key?: string | number | null,
) => JSXNode<T>;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

type

</td><td>

T

</td><td>

</td></tr>
<tr><td>

props

</td><td>

T extends [FunctionComponent](#functioncomponent)&lt;infer PROPS&gt; ? PROPS : Props

</td><td>

</td></tr>
<tr><td>

key

</td><td>

string \| number \| null

</td><td>

_(Optional)_

</td></tr>
</tbody></table>
**Returns:**

[JSXNode](#jsxnode)&lt;T&gt;

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/jsx-runtime.ts)

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

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-attributes.ts)

## jsxDEV

```typescript
jsxDEV: <T extends string | FunctionComponent<Props>>(
  type: T,
  props: T extends FunctionComponent<infer PROPS> ? PROPS : Props,
  key: string | number | null | undefined,
  _isStatic: boolean,
  opts: JsxDevOpts,
  _ctx: unknown,
) => JSXNode<T>;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

type

</td><td>

T

</td><td>

</td></tr>
<tr><td>

props

</td><td>

T extends [FunctionComponent](#functioncomponent)&lt;infer PROPS&gt; ? PROPS : Props

</td><td>

</td></tr>
<tr><td>

key

</td><td>

string \| number \| null \| undefined

</td><td>

</td></tr>
<tr><td>

\_isStatic

</td><td>

boolean

</td><td>

</td></tr>
<tr><td>

opts

</td><td>

JsxDevOpts

</td><td>

</td></tr>
<tr><td>

\_ctx

</td><td>

unknown

</td><td>

</td></tr>
</tbody></table>
**Returns:**

[JSXNode](#jsxnode)&lt;T&gt;

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/jsx-runtime.ts)

## JSXNode

A JSX Node, an internal structure. You probably want to use `JSXOutput` instead.

```typescript
export interface JSXNode<T extends string | FunctionComponent | unknown = unknown>
```

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[children](#)

</td><td>

</td><td>

[JSXChildren](#jsxchildren) \| null

</td><td>

</td></tr>
<tr><td>

[dev?](#)

</td><td>

</td><td>

[DevJSX](#devjsx)

</td><td>

_(Optional)_

</td></tr>
<tr><td>

[key](#)

</td><td>

</td><td>

string \| null

</td><td>

</td></tr>
<tr><td>

[props](#)

</td><td>

</td><td>

T extends [FunctionComponent](#functioncomponent)&lt;infer P&gt; ? P : Record&lt;any, unknown&gt;

</td><td>

</td></tr>
<tr><td>

[type](#)

</td><td>

</td><td>

T

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-node.ts)

## JSXOutput

Any valid output for a component

```typescript
export type JSXOutput =
  | JSXNode
  | string
  | number
  | boolean
  | null
  | undefined
  | JSXOutput[];
```

**References:** [JSXNode](#jsxnode), [JSXOutput](#jsxoutput)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-node.ts)

## JSXTagName

```typescript
export type JSXTagName =
  | keyof HTMLElementTagNameMap
  | Omit<string, keyof HTMLElementTagNameMap>;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-attributes.ts)

## KnownEventNames

The names of events that Qwik knows about. They are all lowercase, but on the JSX side, they are PascalCase for nicer DX. (`onAuxClick$` vs `onauxclick$`)

```typescript
export type KnownEventNames = LiteralUnion<AllEventKeys, string>;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-events.ts)

## NativeAnimationEvent

> Warning: This API is now obsolete.
>
> Use `AnimationEvent` and use the second argument to the handler function for the current event target

```typescript
export type NativeAnimationEvent = AnimationEvent;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-events.ts)

## NativeClipboardEvent

> Warning: This API is now obsolete.
>
> Use `ClipboardEvent` and use the second argument to the handler function for the current event target

```typescript
export type NativeClipboardEvent = ClipboardEvent;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-events.ts)

## NativeCompositionEvent

> Warning: This API is now obsolete.
>
> Use `CompositionEvent` and use the second argument to the handler function for the current event target

```typescript
export type NativeCompositionEvent = CompositionEvent;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-events.ts)

## NativeDragEvent

> Warning: This API is now obsolete.
>
> Use `DragEvent` and use the second argument to the handler function for the current event target

```typescript
export type NativeDragEvent = DragEvent;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-events.ts)

## NativeFocusEvent

> Warning: This API is now obsolete.
>
> Use `FocusEvent` and use the second argument to the handler function for the current event target

```typescript
export type NativeFocusEvent = FocusEvent;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-events.ts)

## NativeKeyboardEvent

> Warning: This API is now obsolete.
>
> Use `KeyboardEvent` and use the second argument to the handler function for the current event target

```typescript
export type NativeKeyboardEvent = KeyboardEvent;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-events.ts)

## NativeMouseEvent

> Warning: This API is now obsolete.
>
> Use `MouseEvent` and use the second argument to the handler function for the current event target

```typescript
export type NativeMouseEvent = MouseEvent;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-events.ts)

## NativePointerEvent

> Warning: This API is now obsolete.
>
> Use `PointerEvent` and use the second argument to the handler function for the current event target

```typescript
export type NativePointerEvent = PointerEvent;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-events.ts)

## NativeTouchEvent

> Warning: This API is now obsolete.
>
> Use `TouchEvent` and use the second argument to the handler function for the current event target

```typescript
export type NativeTouchEvent = TouchEvent;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-events.ts)

## NativeTransitionEvent

> Warning: This API is now obsolete.
>
> Use `TransitionEvent` and use the second argument to the handler function for the current event target

```typescript
export type NativeTransitionEvent = TransitionEvent;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-events.ts)

## NativeUIEvent

> Warning: This API is now obsolete.
>
> Use `UIEvent` and use the second argument to the handler function for the current event target

```typescript
export type NativeUIEvent = UIEvent;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-events.ts)

## NativeWheelEvent

> Warning: This API is now obsolete.
>
> Use `WheelEvent` and use the second argument to the handler function for the current event target

```typescript
export type NativeWheelEvent = WheelEvent;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-events.ts)

## noSerialize

Returned type of the `noSerialize()` function. It will be TYPE or undefined.

```typescript
export type NoSerialize<T> =
  | (T & {
      __no_serialize__: true;
    })
  | undefined;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/utils/serialize-utils.ts)

## NoSerialize

Returned type of the `noSerialize()` function. It will be TYPE or undefined.

```typescript
export type NoSerialize<T> =
  | (T & {
      __no_serialize__: true;
    })
  | undefined;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/utils/serialize-utils.ts)

## NoSerializeSymbol

If an object has this property, it will not be serialized

```typescript
NoSerializeSymbol: unique symbol
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/utils/serialize-utils.ts)

## OnRenderFn

```typescript
export type OnRenderFn<PROPS> = (props: PROPS) => JSXOutput;
```

**References:** [JSXOutput](#jsxoutput)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/component.public.ts)

## OnVisibleTaskOptions

```typescript
export interface OnVisibleTaskOptions
```

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[strategy?](#)

</td><td>

</td><td>

[VisibleTaskStrategy](#visibletaskstrategy)

</td><td>

_(Optional)_ The strategy to use to determine when the "VisibleTask" should first execute.

- `intersection-observer`: the task will first execute when the element is visible in the viewport, under the hood it uses the IntersectionObserver API. - `document-ready`: the task will first execute when the document is ready, under the hood it uses the document `load` event. - `document-idle`: the task will first execute when the document is idle, under the hood it uses the requestIdleCallback API.

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-visible-task.ts)

## PrefetchGraph

> This API is provided as a beta preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

Load the prefetch graph for the container.

Each Qwik container needs to include its own prefetch graph.

```typescript
PrefetchGraph: (opts?: {
  base?: string;
  manifestHash?: string;
  manifestURL?: string;
  nonce?: string;
}) => JSXOutput;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

opts

</td><td>

{ base?: string; manifestHash?: string; manifestURL?: string; nonce?: string; }

</td><td>

_(Optional)_ Options for the loading prefetch graph.

- `base` - Base of the graph. For a default installation this will default to the q:base value `/build/`. But if more than one MFE is installed on the page, then each MFE needs to have its own base. - `manifestHash` - Hash of the manifest file to load. If not provided the hash will be extracted from the container attribute `q:manifest-hash` and assume the default build file `${base}/q-bundle-graph-${manifestHash}.json`. - `manifestURL` - URL of the manifest file to load if non-standard bundle graph location name.

</td></tr>
</tbody></table>
**Returns:**

[JSXOutput](#jsxoutput)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/prefetch-service-worker/prefetch.ts)

## PrefetchServiceWorker

> This API is provided as a beta preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

Install a service worker which will prefetch the bundles.

There can only be one service worker per page. Because there can be many separate Qwik Containers on the page each container needs to load its prefetch graph using `PrefetchGraph` component.

```typescript
PrefetchServiceWorker: (opts: {
  base?: string;
  scope?: string;
  path?: string;
  verbose?: boolean;
  fetchBundleGraph?: boolean;
  nonce?: string;
}) => JSXOutput;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

opts

</td><td>

{ base?: string; scope?: string; path?: string; verbose?: boolean; fetchBundleGraph?: boolean; nonce?: string; }

</td><td>

Options for the prefetch service worker.

- `base` - Base URL for the service worker. Default is `import.meta.env.BASE_URL`, which is defined by Vite's `config.base` and defaults to `/`. - `scope` - Base URL for when the service-worker will activate. Default is `/` - `path` - Path to the service worker. Default is `qwik-prefetch-service-worker.js` unless you pass a path that starts with a `/` then the base is ignored. Default is `qwik-prefetch-service-worker.js` - `verbose` - Verbose logging for the service worker installation. Default is `false` - `nonce` - Optional nonce value for security purposes, defaults to `undefined`.

</td></tr>
</tbody></table>
**Returns:**

[JSXOutput](#jsxoutput)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/prefetch-service-worker/prefetch.ts)

## PropFunction

Alias for `QRL<T>`. Of historic relevance only.

```typescript
export type PropFunction<T> = QRL<T>;
```

**References:** [QRL](#qrl)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/qrl/qrl.public.ts)

## PropsOf

Infers `Props` from the component or tag.

```typescript
export type PropsOf<COMP> = COMP extends string
  ? COMP extends keyof QwikIntrinsicElements
    ? QwikIntrinsicElements[COMP]
    : QwikIntrinsicElements["span"]
  : NonNullable<COMP> extends never
    ? never
    : COMP extends FunctionComponent<infer PROPS>
      ? PROPS extends Record<any, infer V>
        ? IsAny<V> extends true
          ? never
          : ObjectProps<PROPS>
        : COMP extends Component<infer OrigProps>
          ? ObjectProps<OrigProps>
          : PROPS
      : never;
```

**References:** [QwikIntrinsicElements](#qwikintrinsicelements), [FunctionComponent](#functioncomponent), [Component](#component)

```tsx
const Desc = component$(
  ({ desc, ...props }: { desc: string } & PropsOf<"div">) => {
    return <div {...props}>{desc}</div>;
  },
);

const TitleBox = component$(
  ({ title, ...props }: { title: string } & PropsOf<Box>) => {
    return (
      <Box {...props}>
        <h1>{title}</h1>
      </Box>
    );
  },
);
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/component.public.ts)

## PublicProps

Extends the defined component PROPS, adding the default ones (children and q:slot) and allowing plain functions to QRL arguments.

```typescript
export type PublicProps<PROPS> = (PROPS extends Record<any, any>
  ? Omit<PROPS, `${string}$`> & _Only$<PROPS>
  : unknown extends PROPS
    ? {}
    : PROPS) &
  ComponentBaseProps &
  ComponentChildren<PROPS>;
```

**References:** [ComponentBaseProps](#componentbaseprops)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/component.public.ts)

## qrl

The `QRL` type represents a lazy-loadable AND serializable resource.

QRL stands for Qwik URL.

Use `QRL` when you want to refer to a lazy-loaded resource. `QRL`s are most often used for code (functions) but can also be used for other resources such as `string`s in the case of styles.

`QRL` is an opaque token that is generated by the Qwik Optimizer. (Do not rely on any properties in `QRL` as it may change between versions.)

\#\# Creating `QRL` references

Creating `QRL` is done using `$(...)` function. `$(...)` is a special marker for the Qwik Optimizer that marks that the code should be extracted into a lazy-loaded symbol.

```tsx
useOnDocument(
  "mousemove",
  $((event) => console.log("mousemove", event)),
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

\#\# Using `QRL`s

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

NOTE: `element` is needed because `QRL`s are relative and need a base location to resolve against. The base location is encoded in the HTML in the form of `<div q:base="/url">`.

\#\# `QRL.resolved`

Once `QRL.resolve()` returns, the value is stored under `QRL.resolved`. This allows the value to be used without having to await `QRL.resolve()` again.

\#\# Question: Why not just use `import()`?

At first glance, `QRL` serves the same purpose as `import()`. However, there are three subtle differences that need to be taken into account.

1. `QRL`s must be serializable into HTML. 2. `QRL`s must be resolved by framework relative to `q:base`. 3. `QRL`s must be able to capture lexically scoped variables. 4. `QRL`s encapsulate the difference between running with and without Qwik Optimizer. 5. `QRL`s allow expressing lazy-loaded boundaries without thinking about chunk and symbol names.

Let's assume that you intend to write code such as this:

```tsx
return <button onClick={() => (await import('./chunk-abc.js')).onClick}>
```

The above code needs to be serialized into DOM such as:

```
<div q:base="/build/">
  <button on:click="./chunk-abc.js#onClick">...</button>
</div>
```

1. Notice there is no easy way to extract chunk (`./chunk-abc.js`) and symbol (`onClick`) into HTML. 2. Notice that even if you could extract it, the `import('./chunk-abc.js')` would become relative to where the `import()` file is declared. Because it is our framework doing the load, the `./chunk-abc.js` would become relative to the framework file. This is not correct, as it should be relative to the original file generated by the bundler. 3. Next, the framework needs to resolve the `./chunk-abc.js` and needs a base location that is encoded in the HTML. 4. The QRL needs to be able to capture lexically scoped variables. (`import()` only allows loading top-level symbols which don't capture variables.) 5. As a developer, you don't want to think about `import` and naming the chunks and symbols. You just want to say: "this should be lazy."

These are the main reasons why Qwik introduces its own concept of `QRL`.

```typescript
export type QRL<TYPE = unknown> = {
  __qwik_serializable__?: any;
  __brand__QRL__: TYPE;
  resolve(): Promise<TYPE>;
  resolved: undefined | TYPE;
  getCaptured(): unknown[] | null;
  getSymbol(): string;
  getHash(): string;
  dev: QRLDev | null;
} & BivariantQrlFn<QrlArgs<TYPE>, QrlReturn<TYPE>>;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/qrl/qrl.ts)

## QRL

The `QRL` type represents a lazy-loadable AND serializable resource.

QRL stands for Qwik URL.

Use `QRL` when you want to refer to a lazy-loaded resource. `QRL`s are most often used for code (functions) but can also be used for other resources such as `string`s in the case of styles.

`QRL` is an opaque token that is generated by the Qwik Optimizer. (Do not rely on any properties in `QRL` as it may change between versions.)

\#\# Creating `QRL` references

Creating `QRL` is done using `$(...)` function. `$(...)` is a special marker for the Qwik Optimizer that marks that the code should be extracted into a lazy-loaded symbol.

```tsx
useOnDocument(
  "mousemove",
  $((event) => console.log("mousemove", event)),
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

\#\# Using `QRL`s

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

NOTE: `element` is needed because `QRL`s are relative and need a base location to resolve against. The base location is encoded in the HTML in the form of `<div q:base="/url">`.

\#\# `QRL.resolved`

Once `QRL.resolve()` returns, the value is stored under `QRL.resolved`. This allows the value to be used without having to await `QRL.resolve()` again.

\#\# Question: Why not just use `import()`?

At first glance, `QRL` serves the same purpose as `import()`. However, there are three subtle differences that need to be taken into account.

1. `QRL`s must be serializable into HTML. 2. `QRL`s must be resolved by framework relative to `q:base`. 3. `QRL`s must be able to capture lexically scoped variables. 4. `QRL`s encapsulate the difference between running with and without Qwik Optimizer. 5. `QRL`s allow expressing lazy-loaded boundaries without thinking about chunk and symbol names.

Let's assume that you intend to write code such as this:

```tsx
return <button onClick={() => (await import('./chunk-abc.js')).onClick}>
```

The above code needs to be serialized into DOM such as:

```
<div q:base="/build/">
  <button on:click="./chunk-abc.js#onClick">...</button>
</div>
```

1. Notice there is no easy way to extract chunk (`./chunk-abc.js`) and symbol (`onClick`) into HTML. 2. Notice that even if you could extract it, the `import('./chunk-abc.js')` would become relative to where the `import()` file is declared. Because it is our framework doing the load, the `./chunk-abc.js` would become relative to the framework file. This is not correct, as it should be relative to the original file generated by the bundler. 3. Next, the framework needs to resolve the `./chunk-abc.js` and needs a base location that is encoded in the HTML. 4. The QRL needs to be able to capture lexically scoped variables. (`import()` only allows loading top-level symbols which don't capture variables.) 5. As a developer, you don't want to think about `import` and naming the chunks and symbols. You just want to say: "this should be lazy."

These are the main reasons why Qwik introduces its own concept of `QRL`.

```typescript
export type QRL<TYPE = unknown> = {
  __qwik_serializable__?: any;
  __brand__QRL__: TYPE;
  resolve(): Promise<TYPE>;
  resolved: undefined | TYPE;
  getCaptured(): unknown[] | null;
  getSymbol(): string;
  getHash(): string;
  dev: QRLDev | null;
} & BivariantQrlFn<QrlArgs<TYPE>, QrlReturn<TYPE>>;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/qrl/qrl.public.ts)

## QRLEventHandlerMulti

An event handler for Qwik events, can be a handler QRL or an array of handler QRLs.

```typescript
export type QRLEventHandlerMulti<EV extends Event, EL> =
  | QRL<EventHandler<EV, EL>>
  | undefined
  | null
  | QRLEventHandlerMulti<EV, EL>[]
  | EventHandler<EV, EL>;
```

**References:** [QRL](#qrl), [EventHandler](#eventhandler), [QRLEventHandlerMulti](#qrleventhandlermulti)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-attributes.ts)

## QwikAnimationEvent

> Warning: This API is now obsolete.
>
> Use `AnimationEvent` and use the second argument to the handler function for the current event target

```typescript
export type QwikAnimationEvent<T = Element> = NativeAnimationEvent;
```

**References:** [NativeAnimationEvent](#nativeanimationevent)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-events.ts)

## QwikAttributes

The Qwik DOM attributes without plain handlers, for use as function parameters

```typescript
export interface QwikAttributes<EL extends Element> extends DOMAttributesBase<EL>, QwikEvents<EL, false>
```

**Extends:** DOMAttributesBase&lt;EL&gt;, QwikEvents&lt;EL, false&gt;

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[class?](#)

</td><td>

</td><td>

[ClassList](#classlist) \| undefined

</td><td>

_(Optional)_

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-attributes.ts)

## QwikChangeEvent

> Warning: This API is now obsolete.
>
> Use `Event` and use the second argument to the handler function for the current event target. Also note that in Qwik, onInput$ with the InputEvent is the event that behaves like onChange in React.

```typescript
export type QwikChangeEvent<T = Element> = Event;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-events.ts)

## QwikClipboardEvent

> Warning: This API is now obsolete.
>
> Use `ClipboardEvent` and use the second argument to the handler function for the current event target

```typescript
export type QwikClipboardEvent<T = Element> = NativeClipboardEvent;
```

**References:** [NativeClipboardEvent](#nativeclipboardevent)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-events.ts)

## QwikCompositionEvent

> Warning: This API is now obsolete.
>
> Use `CompositionEvent` and use the second argument to the handler function for the current event target

```typescript
export type QwikCompositionEvent<T = Element> = NativeCompositionEvent;
```

**References:** [NativeCompositionEvent](#nativecompositionevent)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-events.ts)

## QwikDOMAttributes

```typescript
export interface QwikDOMAttributes extends DOMAttributes<Element>
```

**Extends:** [DOMAttributes](#domattributes)&lt;Element&gt;

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik.ts)

## QwikDragEvent

> Warning: This API is now obsolete.
>
> Use `DragEvent` and use the second argument to the handler function for the current event target

```typescript
export type QwikDragEvent<T = Element> = NativeDragEvent;
```

**References:** [NativeDragEvent](#nativedragevent)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-events.ts)

## QwikFocusEvent

> Warning: This API is now obsolete.
>
> Use `FocusEvent` and use the second argument to the handler function for the current event target

```typescript
export type QwikFocusEvent<T = Element> = NativeFocusEvent;
```

**References:** [NativeFocusEvent](#nativefocusevent)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-events.ts)

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
};
```

**References:** [QwikAttributes](#qwikattributes)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-generated.ts)

## QwikIdleEvent

Emitted by qwik-loader on document when the document first becomes idle

```typescript
export type QwikIdleEvent = CustomEvent<{}>;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-events.ts)

## QwikInitEvent

Emitted by qwik-loader on document when the document first becomes interactive

```typescript
export type QwikInitEvent = CustomEvent<{}>;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-events.ts)

## QwikIntrinsicElements

The interface holds available attributes of both native DOM elements and custom Qwik elements. An example showing how to define a customizable wrapper component:

```tsx
import { component$, Slot, type QwikIntrinsicElements } from "@qwik.dev/core";

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

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-elements.ts)

## QwikInvalidEvent

> Warning: This API is now obsolete.
>
> Use `Event` and use the second argument to the handler function for the current event target

```typescript
export type QwikInvalidEvent<T = Element> = Event;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-events.ts)

## QwikJSX

```typescript
export declare namespace QwikJSX
```

<table><thead><tr><th>

Interface

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[ElementChildrenAttribute](#qwikjsx-elementchildrenattribute)

</td><td>

</td></tr>
<tr><td>

[IntrinsicAttributes](#qwikjsx-intrinsicattributes)

</td><td>

</td></tr>
<tr><td>

[IntrinsicElements](#qwikjsx-intrinsicelements)

</td><td>

</td></tr>
</tbody></table>

<table><thead><tr><th>

Type Alias

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[Element](#qwikjsx-element)

</td><td>

</td></tr>
<tr><td>

[ElementType](#qwikjsx-elementtype)

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik.ts)

## QwikKeyboardEvent

> Warning: This API is now obsolete.
>
> Use `KeyboardEvent` and use the second argument to the handler function for the current event target

```typescript
export type QwikKeyboardEvent<T = Element> = NativeKeyboardEvent;
```

**References:** [NativeKeyboardEvent](#nativekeyboardevent)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-events.ts)

## QwikMouseEvent

> Warning: This API is now obsolete.
>
> Use `MouseEvent` and use the second argument to the handler function for the current event target

```typescript
export type QwikMouseEvent<T = Element, E = NativeMouseEvent> = E;
```

**References:** [NativeMouseEvent](#nativemouseevent)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-events.ts)

## QwikPointerEvent

> Warning: This API is now obsolete.
>
> Use `PointerEvent` and use the second argument to the handler function for the current event target

```typescript
export type QwikPointerEvent<T = Element> = NativePointerEvent;
```

**References:** [NativePointerEvent](#nativepointerevent)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-events.ts)

## QwikSubmitEvent

> Warning: This API is now obsolete.
>
> Use `SubmitEvent` and use the second argument to the handler function for the current event target

```typescript
export type QwikSubmitEvent<T = Element> = SubmitEvent;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-events.ts)

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

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-generated.ts)

## QwikSymbolEvent

Emitted by qwik-loader when a module was lazily loaded

```typescript
export type QwikSymbolEvent = CustomEvent<{
  qBase: string;
  qManifest: string;
  qVersion: string;
  href: string;
  symbol: string;
  element: Element;
  reqTime: number;
}>;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-events.ts)

## QwikTouchEvent

> Warning: This API is now obsolete.
>
> Use `TouchEvent` and use the second argument to the handler function for the current event target

```typescript
export type QwikTouchEvent<T = Element> = NativeTouchEvent;
```

**References:** [NativeTouchEvent](#nativetouchevent)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-events.ts)

## QwikTransitionEvent

> Warning: This API is now obsolete.
>
> Use `TransitionEvent` and use the second argument to the handler function for the current event target

```typescript
export type QwikTransitionEvent<T = Element> = NativeTransitionEvent;
```

**References:** [NativeTransitionEvent](#nativetransitionevent)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-events.ts)

## QwikUIEvent

> Warning: This API is now obsolete.
>
> Use `UIEvent` and use the second argument to the handler function for the current event target

```typescript
export type QwikUIEvent<T = Element> = NativeUIEvent;
```

**References:** [NativeUIEvent](#nativeuievent)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-events.ts)

## QwikVisibleEvent

Emitted by qwik-loader when an element becomes visible. Used by `useVisibleTask$`

```typescript
export type QwikVisibleEvent = CustomEvent<IntersectionObserverEntry>;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-events.ts)

## QwikWheelEvent

> Warning: This API is now obsolete.
>
> Use `WheelEvent` and use the second argument to the handler function for the current event target

```typescript
export type QwikWheelEvent<T = Element> = NativeWheelEvent;
```

**References:** [NativeWheelEvent](#nativewheelevent)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/types/jsx-qwik-events.ts)

## ReadonlySignal

```typescript
export interface ReadonlySignal<T = unknown>
```

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[value](#)

</td><td>

`readonly`

</td><td>

T

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/signal/signal.public.ts)

## render

Render JSX.

Use this method to render JSX. This function does reconciling which means it always tries to reuse what is already in the DOM (rather then destroy and recreate content.) It returns a cleanup function you could use for cleaning up subscriptions.

```typescript
render: (
  parent: Element | Document,
  jsxNode: JSXOutput | FunctionComponent<any>,
  opts?: RenderOptions,
) => Promise<RenderResult>;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

parent

</td><td>

Element \| Document

</td><td>

Element which will act as a parent to `jsxNode`. When possible the rendering will try to reuse existing nodes.

</td></tr>
<tr><td>

jsxNode

</td><td>

[JSXOutput](#jsxoutput) \| [FunctionComponent](#functioncomponent)&lt;any&gt;

</td><td>

JSX to render

</td></tr>
<tr><td>

opts

</td><td>

[RenderOptions](#renderoptions)

</td><td>

_(Optional)_

</td></tr>
</tbody></table>
**Returns:**

Promise&lt;[RenderResult](#renderresult)&gt;

An object containing a cleanup function.

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/client/dom-render.ts)

## RenderOnce

```typescript
RenderOnce: FunctionComponent<{
  children?: unknown;
  key?: string | number | null | undefined;
}>;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/jsx-runtime.ts)

## RenderOptions

```typescript
export interface RenderOptions
```

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[serverData?](#)

</td><td>

</td><td>

Record&lt;string, any&gt;

</td><td>

_(Optional)_

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/client/types.ts)

## RenderResult

```typescript
export interface RenderResult
```

<table><thead><tr><th>

Method

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[cleanup()](#renderresult-cleanup)

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/client/types.ts)

## RenderSSROptions

```typescript
export interface RenderSSROptions
```

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[base?](#)

</td><td>

</td><td>

string

</td><td>

_(Optional)_

</td></tr>
<tr><td>

[containerAttributes](#)

</td><td>

</td><td>

Record&lt;string, string&gt;

</td><td>

</td></tr>
<tr><td>

[containerTagName](#)

</td><td>

</td><td>

string

</td><td>

</td></tr>
<tr><td>

[manifestHash](#)

</td><td>

</td><td>

string

</td><td>

</td></tr>
<tr><td>

[serverData?](#)

</td><td>

</td><td>

Record&lt;string, any&gt;

</td><td>

_(Optional)_

</td></tr>
<tr><td>

[stream](#)

</td><td>

</td><td>

StreamWriter

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/ssr/ssr-types.ts)

## Resource

This method works like an async memoized function that runs whenever some tracked value changes and returns some data.

`useResource` however returns immediate a `ResourceReturn` object that contains the data and a state that indicates if the data is available or not.

The status can be one of the following:

- `pending` - the data is not yet available. - `resolved` - the data is available. - `rejected` - the data is not available due to an error or timeout.

Be careful when using a `try/catch` statement in `useResource$`. If you catch the error and don't re-throw it (or a new Error), the resource status will never be `rejected`.

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
Resource: <T>(props: ResourceProps<T>) => JSXOutput;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

props

</td><td>

[ResourceProps](#resourceprops)&lt;T&gt;

</td><td>

</td></tr>
</tbody></table>
**Returns:**

[JSXOutput](#jsxoutput)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-resource.ts)

## ResourceCtx

```typescript
export interface ResourceCtx<T>
```

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[previous](#)

</td><td>

`readonly`

</td><td>

T \| undefined

</td><td>

</td></tr>
<tr><td>

[track](#)

</td><td>

`readonly`

</td><td>

[Tracker](#tracker)

</td><td>

</td></tr>
</tbody></table>

<table><thead><tr><th>

Method

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[cache(policyOrMilliseconds)](#resourcectx-cache)

</td><td>

</td></tr>
<tr><td>

[cleanup(callback)](#)

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-resource.ts)

## ResourceFn

```typescript
export type ResourceFn<T> = (ctx: ResourceCtx<unknown>) => ValueOrPromise<T>;
```

**References:** [ResourceCtx](#resourcectx), [ValueOrPromise](#valueorpromise)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-resource.ts)

## ResourceOptions

Options to pass to `useResource$()`

```typescript
export interface ResourceOptions
```

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[timeout?](#)

</td><td>

</td><td>

number

</td><td>

_(Optional)_ Timeout in milliseconds. If the resource takes more than the specified millisecond, it will timeout. Resulting on a rejected resource.

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-resource.ts)

## ResourcePending

```typescript
export interface ResourcePending<T>
```

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[loading](#)

</td><td>

`readonly`

</td><td>

boolean

</td><td>

</td></tr>
<tr><td>

[value](#)

</td><td>

`readonly`

</td><td>

Promise&lt;T&gt;

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-resource.ts)

## ResourceProps

```typescript
export interface ResourceProps<T>
```

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[onPending?](#)

</td><td>

</td><td>

() =&gt; [JSXOutput](#jsxoutput)

</td><td>

_(Optional)_

</td></tr>
<tr><td>

[onRejected?](#)

</td><td>

</td><td>

(reason: Error) =&gt; [JSXOutput](#jsxoutput)

</td><td>

_(Optional)_

</td></tr>
<tr><td>

[onResolved](#)

</td><td>

</td><td>

(value: T) =&gt; [JSXOutput](#jsxoutput)

</td><td>

</td></tr>
<tr><td>

[value](#)

</td><td>

`readonly`

</td><td>

[ResourceReturn](#resourcereturn)&lt;T&gt; \| [Signal](#signal)&lt;Promise&lt;T&gt; \| T&gt; \| Promise&lt;T&gt;

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-resource.ts)

## ResourceRejected

```typescript
export interface ResourceRejected<T>
```

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[loading](#)

</td><td>

`readonly`

</td><td>

boolean

</td><td>

</td></tr>
<tr><td>

[value](#)

</td><td>

`readonly`

</td><td>

Promise&lt;T&gt;

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-resource.ts)

## ResourceResolved

```typescript
export interface ResourceResolved<T>
```

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[loading](#)

</td><td>

`readonly`

</td><td>

boolean

</td><td>

</td></tr>
<tr><td>

[value](#)

</td><td>

`readonly`

</td><td>

Promise&lt;T&gt;

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-resource.ts)

## ResourceReturn

```typescript
export type ResourceReturn<T> =
  | ResourcePending<T>
  | ResourceResolved<T>
  | ResourceRejected<T>;
```

**References:** [ResourcePending](#resourcepending), [ResourceResolved](#resourceresolved), [ResourceRejected](#resourcerejected)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-resource.ts)

## SerializerSymbol

If an object has this property as a function, it will be called with the object and should return a serializable value.

This can be used to clean up etc.

```typescript
SerializerSymbol: unique symbol
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/utils/serialize-utils.ts)

## setPlatform

Sets the `CorePlatform`.

This is useful to override the platform in tests to change the behavior of, `requestAnimationFrame`, and import resolution.

```typescript
setPlatform: (plt: CorePlatform) => CorePlatform;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

plt

</td><td>

[CorePlatform](#coreplatform)

</td><td>

</td></tr>
</tbody></table>
**Returns:**

[CorePlatform](#coreplatform)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/platform/platform.ts)

## Signal

A signal is a reactive value which can be read and written. When the signal is written, all tasks which are tracking the signal will be re-run and all components that read the signal will be re-rendered.

Furthermore, when a signal value is passed as a prop to a component, the optimizer will automatically forward the signal. This means that `return <div title={signal.value}>hi</div>` will update the `title` attribute when the signal changes without having to re-render the component.

```typescript
export interface Signal<T = any> extends ReadonlySignal<T>
```

**Extends:** [ReadonlySignal](#readonlysignal)&lt;T&gt;

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[value](#)

</td><td>

</td><td>

T

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/signal/signal.public.ts)

## SkipRender

```typescript
SkipRender: JSXNode;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/utils.public.ts)

## Slot

Allows to project the children of the current component. <Slot/> can only be used within the context of a component defined with `component$`.

```typescript
Slot: FunctionComponent<{
  name?: string;
  children?: JSXChildren;
}>;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/slot.public.ts)

## SnapshotListener

```typescript
export interface SnapshotListener
```

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[el](#)

</td><td>

</td><td>

Element

</td><td>

</td></tr>
<tr><td>

[key](#)

</td><td>

</td><td>

string

</td><td>

</td></tr>
<tr><td>

[qrl](#)

</td><td>

</td><td>

[QRL](#qrl)&lt;any&gt;

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/ssr/ssr-types.ts)

## SnapshotMeta

```typescript
export type SnapshotMeta = Record<string, SnapshotMetaValue>;
```

**References:** [SnapshotMetaValue](#snapshotmetavalue)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/ssr/ssr-types.ts)

## SnapshotMetaValue

```typescript
export interface SnapshotMetaValue
```

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[c?](#)

</td><td>

</td><td>

string

</td><td>

_(Optional)_

</td></tr>
<tr><td>

[h?](#)

</td><td>

</td><td>

string

</td><td>

_(Optional)_

</td></tr>
<tr><td>

[s?](#)

</td><td>

</td><td>

string

</td><td>

_(Optional)_

</td></tr>
<tr><td>

[w?](#)

</td><td>

</td><td>

string

</td><td>

_(Optional)_

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/ssr/ssr-types.ts)

## SnapshotResult

```typescript
export interface SnapshotResult
```

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[funcs](#)

</td><td>

</td><td>

string[]

</td><td>

</td></tr>
<tr><td>

[mode](#)

</td><td>

</td><td>

'render' \| 'listeners' \| 'static'

</td><td>

</td></tr>
<tr><td>

[objs?](#)

</td><td>

</td><td>

any[]

</td><td>

_(Optional)_

</td></tr>
<tr><td>

[qrls](#)

</td><td>

</td><td>

[QRL](#qrl)[]

</td><td>

</td></tr>
<tr><td>

[resources](#)

</td><td>

</td><td>

ResourceReturnInternal&lt;any&gt;[]

</td><td>

</td></tr>
<tr><td>

[state?](#)

</td><td>

</td><td>

[SnapshotState](#snapshotstate)

</td><td>

_(Optional)_

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/ssr/ssr-types.ts)

## SnapshotState

> Warning: This API is now obsolete.
>
> not longer used in v2

```typescript
export interface SnapshotState
```

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[ctx](#)

</td><td>

</td><td>

[SnapshotMeta](#snapshotmeta)

</td><td>

</td></tr>
<tr><td>

[objs](#)

</td><td>

</td><td>

any[]

</td><td>

</td></tr>
<tr><td>

[refs](#)

</td><td>

</td><td>

Record&lt;string, string&gt;

</td><td>

</td></tr>
<tr><td>

[subs](#)

</td><td>

</td><td>

any[]

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/ssr/ssr-types.ts)

## SSRComment

```typescript
SSRComment: FunctionComponent<{
  data: string;
}>;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/utils.public.ts)

## SSRHintProps

```typescript
export type SSRHintProps = {
  dynamic?: boolean;
};
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/utils.public.ts)

## SSRRaw

```typescript
SSRRaw: FunctionComponent<{
  data: string;
}>;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/utils.public.ts)

## SSRStream

```typescript
SSRStream: FunctionComponent<SSRStreamProps>;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/utils.public.ts)

## SSRStreamBlock

```typescript
SSRStreamBlock: FunctionComponent<{
  children?: JSXOutput;
}>;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/utils.public.ts)

## SSRStreamChildren

```typescript
export type SSRStreamChildren =
  | AsyncGenerator<JSXChildren, void, any>
  | ((stream: StreamWriter) => Promise<void>)
  | (() => AsyncGenerator<JSXChildren, void, any>);
```

**References:** [JSXChildren](#jsxchildren)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/utils.public.ts)

## SSRStreamProps

```typescript
export type SSRStreamProps = {
  children: SSRStreamChildren;
};
```

**References:** [SSRStreamChildren](#ssrstreamchildren)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/jsx/utils.public.ts)

## sync$

Extract function into a synchronously loadable QRL.

NOTE: Synchronous QRLs functions can't close over any variables, including exports.

```typescript
sync$: <T extends Function>(fn: T) => SyncQRL<T>;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

fn

</td><td>

T

</td><td>

Function to extract.

</td></tr>
</tbody></table>
**Returns:**

[SyncQRL](#syncqrl)&lt;T&gt;

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/qrl/qrl.public.ts)

## SyncQRL

```typescript
export interface SyncQRL<TYPE extends Function = any> extends QRL<TYPE>
```

**Extends:** [QRL](#qrl)&lt;TYPE&gt;

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[\_\_brand\_\_SyncQRL\_\_](#)

</td><td>

</td><td>

TYPE

</td><td>

</td></tr>
<tr><td>

[dev](#)

</td><td>

</td><td>

QRLDev \| null

</td><td>

</td></tr>
<tr><td>

[resolved](#)

</td><td>

</td><td>

TYPE

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/qrl/qrl.public.ts)

## TaskCtx

```typescript
export interface TaskCtx
```

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[track](#)

</td><td>

</td><td>

[Tracker](#tracker)

</td><td>

</td></tr>
</tbody></table>

<table><thead><tr><th>

Method

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[cleanup(callback)](#)

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-task.ts)

## TaskFn

```typescript
export type TaskFn = (ctx: TaskCtx) => ValueOrPromise<void | (() => void)>;
```

**References:** [TaskCtx](#taskctx), [ValueOrPromise](#valueorpromise)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-task.ts)

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

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-task.ts)

## untrack

Don't track listeners for this callback

```typescript
untrack: <T>(fn: () => T) => T;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

fn

</td><td>

() =&gt; T

</td><td>

</td></tr>
</tbody></table>
**Returns:**

T

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-core.ts)

## unwrapStore

Get the original object that was wrapped by the store. Useful if you want to clone a store (structuredClone, IndexedDB,...)

```typescript
unwrapStore: <T>(value: T) => T;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

value

</td><td>

T

</td><td>

</td></tr>
</tbody></table>
**Returns:**

T

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/signal/store.ts)

## useComputed$

Creates a computed signal which is calculated from the given function. A computed signal is a signal which is calculated from other signals. When the signals change, the computed signal is recalculated, and if the result changed, all tasks which are tracking the signal will be re-run and all components that read the signal will be re-rendered.

The function must be synchronous and must not have any side effects.

```typescript
useComputed$: <T>(qrl: ComputedFn<T>) => T extends Promise<any> ? never : ReadonlySignal<T>
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

qrl

</td><td>

[ComputedFn](#computedfn)&lt;T&gt;

</td><td>

</td></tr>
</tbody></table>
**Returns:**

T extends Promise&lt;any&gt; ? never : [ReadonlySignal](#readonlysignal)&lt;T&gt;

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-computed.ts)

## useConstant

Stores a value which is retained for the lifetime of the component. Subsequent calls to `useConstant` will always return the first value given.

If the value is a function, the function is invoked once to calculate the actual value.

```typescript
useConstant: <T>(value: (() => T) | T) => T;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

value

</td><td>

(() =&gt; T) \| T

</td><td>

</td></tr>
</tbody></table>
**Returns:**

T

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-signal.ts)

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

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-context.ts)

## useContextProvider

Assign a value to a Context.

Use `useContextProvider()` to assign a value to a context. The assignment happens in the component's function. Once assigned, use `useContext()` in any child component to retrieve the value.

Context is a way to pass stores to the child components without prop-drilling. Note that scalar values are allowed, but for reactivity you need signals or stores.

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
useContextProvider: <STATE>(context: ContextId<STATE>, newValue: STATE) => void
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

context

</td><td>

[ContextId](#contextid)&lt;STATE&gt;

</td><td>

The context to assign a value to.

</td></tr>
<tr><td>

newValue

</td><td>

STATE

</td><td>

</td></tr>
</tbody></table>
**Returns:**

void

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-context.ts)

## useErrorBoundary

```typescript
useErrorBoundary: () => Readonly<ErrorBoundaryStore>;
```

**Returns:**

Readonly&lt;[ErrorBoundaryStore](#errorboundarystore)&gt;

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-error-boundary.ts)

## useId

```typescript
useId: () => string;
```

**Returns:**

string

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-id.ts)

## useOn

Register a listener on the current component's host element.

Used to programmatically add event listeners. Useful from custom `use*` methods, which do not have access to the JSX. Otherwise, it's adding a JSX listener in the `<div>` is a better idea.

```typescript
useOn: <T extends KnownEventNames>(event: T | T[], eventQrl: EventQRL<T>) => void
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

event

</td><td>

T \| T[]

</td><td>

</td></tr>
<tr><td>

eventQrl

</td><td>

EventQRL&lt;T&gt;

</td><td>

</td></tr>
</tbody></table>
**Returns:**

void

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-on.ts)

## useOnDocument

Register a listener on `document`.

Used to programmatically add event listeners. Useful from custom `use*` methods, which do not have access to the JSX.

```typescript
useOnDocument: <T extends KnownEventNames>(event: T | T[], eventQrl: EventQRL<T>) => void
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

event

</td><td>

T \| T[]

</td><td>

</td></tr>
<tr><td>

eventQrl

</td><td>

EventQRL&lt;T&gt;

</td><td>

</td></tr>
</tbody></table>
**Returns:**

void

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-on.ts)

## useOnWindow

Register a listener on `window`.

Used to programmatically add event listeners. Useful from custom `use*` methods, which do not have access to the JSX.

```typescript
useOnWindow: <T extends KnownEventNames>(event: T | T[], eventQrl: EventQRL<T>) => void
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

event

</td><td>

T \| T[]

</td><td>

</td></tr>
<tr><td>

eventQrl

</td><td>

EventQRL&lt;T&gt;

</td><td>

</td></tr>
</tbody></table>
**Returns:**

void

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-on.ts)

## useResource$

This method works like an async memoized function that runs whenever some tracked value changes and returns some data.

`useResource` however returns immediate a `ResourceReturn` object that contains the data and a state that indicates if the data is available or not.

The status can be one of the following:

- `pending` - the data is not yet available. - `resolved` - the data is available. - `rejected` - the data is not available due to an error or timeout.

Be careful when using a `try/catch` statement in `useResource$`. If you catch the error and don't re-throw it (or a new Error), the resource status will never be `rejected`.

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

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

generatorFn

</td><td>

[ResourceFn](#resourcefn)&lt;T&gt;

</td><td>

</td></tr>
<tr><td>

opts

</td><td>

[ResourceOptions](#resourceoptions)

</td><td>

_(Optional)_

</td></tr>
</tbody></table>
**Returns:**

[ResourceReturn](#resourcereturn)&lt;T&gt;

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-resource-dollar.ts)

## useSerialized$

Creates a signal which holds a custom serializable value. It requires that the value implements the `CustomSerializable` type, which means having a function under the `[SerializeSymbol]` property that returns a serializable value when called.

The `fn` you pass is called with the result of the serialization (in the browser, only when the value is needed), or `undefined` when not yet initialized. If you refer to other signals, `fn` will be called when those change just like computed signals, and then the argument will be the previous output, not the serialized result.

This is useful when using third party libraries that use custom objects that are not serializable.

Note that the `fn` is called lazily, so it won't impact container resume.

```typescript
useSerialized$: typeof createSerialized$;
```

```tsx
class MyCustomSerializable {
  constructor(public n: number) {}
  inc() {
    this.n++;
  }
  [SerializeSymbol]() {
    return this.n;
  }
}
const Cmp = component$(() => {
  const custom = useSerialized$<MyCustomSerializable, number>(
    (prev) =>
      new MyCustomSerializable(
        prev instanceof MyCustomSerializable ? prev : (prev ?? 3),
      ),
  );
  return <div onClick$={() => custom.value.inc()}>{custom.value.n}</div>;
});
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-serialized.ts)

## useServerData

```typescript
export declare function useServerData<T>(key: string): T | undefined;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

key

</td><td>

string

</td><td>

</td></tr>
</tbody></table>
**Returns:**

T \| undefined

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-env-data.ts)

## useSignal

```typescript
useSignal: UseSignal;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-signal.ts)

## UseSignal

```typescript
useSignal: UseSignal;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-signal.ts)

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

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

initialState

</td><td>

STATE \| (() =&gt; STATE)

</td><td>

</td></tr>
<tr><td>

opts

</td><td>

[UseStoreOptions](#usestoreoptions)

</td><td>

_(Optional)_

</td></tr>
</tbody></table>
**Returns:**

STATE

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-store.public.ts)

## UseStoreOptions

```typescript
export interface UseStoreOptions
```

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[deep?](#)

</td><td>

</td><td>

boolean

</td><td>

_(Optional)_ If `true` then all nested objects and arrays will be tracked as well. Default is `true`.

</td></tr>
<tr><td>

[reactive?](#)

</td><td>

</td><td>

boolean

</td><td>

_(Optional)_ If `false` then the object will not be tracked for changes. Default is `true`.

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-store.public.ts)

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
useStyles$: (qrl: string) => UseStyles;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

qrl

</td><td>

string

</td><td>

</td></tr>
</tbody></table>
**Returns:**

UseStyles

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-styles.ts)

## UseStylesScoped

```typescript
export interface UseStylesScoped
```

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[scopeId](#)

</td><td>

</td><td>

string

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-styles.ts)

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
useStylesScoped$: (qrl: string) => UseStylesScoped;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

qrl

</td><td>

string

</td><td>

</td></tr>
</tbody></table>
**Returns:**

[UseStylesScoped](#usestylesscoped)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-styles.ts)

## useTask$

Reruns the `taskFn` when the observed inputs change.

Use `useTask` to observe changes on a set of inputs, and then re-execute the `taskFn` when those inputs change.

The `taskFn` only executes if the observed inputs change. To observe the inputs, use the `obs` function to wrap property reads. This creates subscriptions that will trigger the `taskFn` to rerun.

```typescript
useTask$: (qrl: import("./use-task").TaskFn, opts?: import("./use-task").UseTaskOptions | undefined) => void
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

qrl

</td><td>

import("./use-task").[TaskFn](#taskfn)

</td><td>

</td></tr>
<tr><td>

opts

</td><td>

import("./use-task").[UseTaskOptions](#usetaskoptions) \| undefined

</td><td>

_(Optional)_

</td></tr>
</tbody></table>
**Returns:**

void

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-task-dollar.ts)

## UseTaskOptions

```typescript
export interface UseTaskOptions
```

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[eagerness?](#)

</td><td>

</td><td>

[EagernessOptions](#eagernessoptions)

</td><td>

_(Optional)_ - `visible`: run the effect when the element is visible. - `load`: eagerly run the effect when the application resumes.

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-task.ts)

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
useVisibleTask$: (qrl: import("./use-task").TaskFn, opts?: import("./use-visible-task").OnVisibleTaskOptions | undefined) => void
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

qrl

</td><td>

import("./use-task").[TaskFn](#taskfn)

</td><td>

</td></tr>
<tr><td>

opts

</td><td>

import("./use-visible-task").[OnVisibleTaskOptions](#onvisibletaskoptions) \| undefined

</td><td>

_(Optional)_

</td></tr>
</tbody></table>
**Returns:**

void

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-visible-task-dollar.ts)

## ValueOrPromise

Type representing a value which is either resolve or a promise.

```typescript
export type ValueOrPromise<T> = T | Promise<T>;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/shared/utils/types.ts)

## version

QWIK_VERSION

```typescript
version: string;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/version.ts)

## VisibleTaskStrategy

```typescript
export type VisibleTaskStrategy =
  | "intersection-observer"
  | "document-ready"
  | "document-idle";
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-visible-task.ts)

## withLocale

Override the `getLocale` with `lang` within the `fn` execution.

```typescript
export declare function withLocale<T>(locale: string, fn: () => T): T;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

locale

</td><td>

string

</td><td>

</td></tr>
<tr><td>

fn

</td><td>

() =&gt; T

</td><td>

</td></tr>
</tbody></table>
**Returns:**

T

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/core/use/use-locale.ts)
