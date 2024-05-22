# API DOCS for: `component.public.ts`

---

# `component`

Declare a Qwik component that can be used to create UI.

Use `component$` to declare a Qwik component. A Qwik component is a special kind of component that allows the Qwik framework to lazy load and execute the component independently of other Qwik components as well as lazy load the component's life-cycle hooks and event handlers.

Side note: You can also declare regular (standard JSX) components that will have standard synchronous behavior.

Qwik component is a facade that describes how the component should be used without forcing the implementation of the component to be eagerly loaded. A minimum Qwik definition consists of:

### Example

An example showing how to create a counter component:

<docs code="./examples.tsx#component"/>

- `component$` is how a component gets declared.
- `{ value?: number; step?: number }` declares the public (props) interface of the component.
- `{ count: number }` declares the private (state) interface of the component.

The above can then be used like so:

<docs code="./examples.tsx#component-usage"/>

See also: `component`, `useCleanup`, `onResume`, `onPause`, `useOn`, `useOnDocument`, `useOnWindow`, `useStyles`

@public

# `useStore`

Creates an object that Qwik can track across serializations.

Use `useStore` to create a state for your application. The returned object is a proxy that has a unique ID. The ID of the object is used in the `QRL`s to refer to the store.

### Example

Example showing how `useStore` is used in Counter example to keep track of the count.

<docs code="./examples.tsx#use-store"/>

@public

# `useResource`

This method works like an async memoized function that runs whenever some tracked value changes and returns some data.

`useResource` however returns immediate a `ResourceReturn` object that contains the data and a state that indicates if the data is available or not.

The status can be one of the following:

- `pending` - the data is not yet available.
- `resolved` - the data is available.
- `rejected` - the data is not available due to an error or timeout.

Avoid using a `try/catch` statement in `useResource$`. If you catch the error instead of passing it, the resource status will never be `rejected`.

### Example

Example showing how `useResource` to perform a fetch to request the weather, whenever the input city name changes.

<docs code="./examples.tsx#use-resource"/>

@see Resource
@see ResourceReturn

@public

# `useTask`

Reruns the `taskFn` when the observed inputs change.

Use `useTask` to observe changes on a set of inputs, and then re-execute the `taskFn` when those inputs change.

The `taskFn` only executes if the observed inputs change. To observe the inputs, use the `obs` function to wrap property reads. This creates subscriptions that will trigger the `taskFn` to rerun.

@see `Tracker`

@public

### Example

The `useTask` function is used to observe the `store.count` property. Any changes to the `store.count` cause the `taskFn` to execute which in turn updates the `store.doubleCount` to the double of `store.count`.

<docs code="./examples.tsx#use-task"/>

@param task - Function which should be re-executed when changes to the inputs are detected
@public

# `useVisibleTask`

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

@public

# `Tracker`

Used to signal to Qwik which state should be watched for changes.

The `Tracker` is passed into the `taskFn` of `useTask`. It is intended to be used to wrap state objects in a read proxy which signals to Qwik which properties should be watched for changes. A change to any of the properties causes the `taskFn` to rerun.

### Example

The `obs` passed into the `taskFn` is used to mark `state.count` as a property of interest. Any changes to the `state.count` property will cause the `taskFn` to rerun.

<docs code="./examples.tsx#use-task-simple"/>

@see `useTask`

@public

# `useStyles`

A lazy-loadable reference to a component's styles.

Component styles allow Qwik to lazy load the style information for the component only when needed. (And avoid double loading it in case of SSR hydration.)

<docs code="./examples.tsx#use-styles"/>

@see `useStylesScoped`

@public

# `useStylesScoped`

A lazy-loadable reference to a component's styles, that is scoped to the component.

Component styles allow Qwik to lazy load the style information for the component only when needed. (And avoid double loading it in case of SSR hydration.)

<docs code="./examples.tsx#use-styles-scoped"/>

@see `useStyles`

@public

# `useOn`

Register a listener on the current component's host element.

Used to programmatically add event listeners. Useful from custom `use*` methods, which do not have access to the JSX. Otherwise, it's adding a JSX listener in the `<div>` is a better idea.

@see `useOn`, `useOnWindow`, `useOnDocument`.

@public

# `useOnWindow`

Register a listener on `window`.

Used to programmatically add event listeners. Useful from custom `use*` methods, which do not have access to the JSX.

@see `useOn`, `useOnWindow`, `useOnDocument`.

<docs code="./examples.tsx#use-on-window"/>

@public

# `useOnDocument`

Register a listener on `document`.

Used to programmatically add event listeners. Useful from custom `use*` methods, which do not have access to the JSX.

@see `useOn`, `useOnWindow`, `useOnDocument`.

<docs code="./examples.tsx#use-on-document"/>

@public

# `noSerialize`

Marks a property on a store as non-serializable.

At times it is necessary to store values on a store that are non-serializable. Normally this is a runtime error as Store wants to eagerly report when a non-serializable property is assigned to it.

You can use `noSerialize()` to mark a value as non-serializable. The value is persisted in the Store but does not survive serialization. The implication is that when your application is resumed, the value of this object will be `undefined`. You will be responsible for recovering from this.

See: [noSerialize Tutorial](http://qwik.dev/tutorial/store/no-serialize)

@public

# `useLexicalScope`

Used by the Qwik Optimizer to restore the lexically scoped variables.

This method should not be present in the application source code.

NOTE: `useLexicalScope` method can only be used in the synchronous portion of the callback (before any `await` statements.)

@internal

# `QRL`

The `QRL` type represents a lazy-loadable AND serializable resource.

QRL stands for Qwik URL.

Use `QRL` when you want to refer to a lazy-loaded resource. `QRL`s are most often used for code (functions) but can also be used for other resources such as `string`s in the case of styles.

`QRL` is an opaque token that is generated by the Qwik Optimizer. (Do not rely on any properties in `QRL` as it may change between versions.)

## Creating `QRL` references

Creating `QRL` is done using `$(...)` function. `$(...)` is a special marker for the Qwik Optimizer that marks that the code should be extracted into a lazy-loaded symbol.

<docs code="./examples.tsx#qrl-usage-$"/>

In the above code, the Qwik Optimizer detects `$(...)` and transforms the code as shown below:

<docs code="./examples.tsx#qrl-usage-$-optimized"/>

NOTE: `qrl(...)` is a result of Qwik Optimizer transformation. You should never have to invoke this function directly in your application. The `qrl(...)` function should be invoked only after the Qwik Optimizer transformation.

## Using `QRL`s

Use `QRL` type in your application when you want to get a lazy-loadable reference to a resource (most likely a function).

<docs code="./examples.tsx#qrl-usage-type"/>

In the above example, the way to think about the code is that you are not asking for a callback function but rather a reference to a lazy-loadable callback function. Specifically, the function loading should be delayed until it is actually needed. In the above example, the function would not load until after a `mousemove` event on `document` fires.

## Resolving `QRL` references

At times it may be necessary to resolve a `QRL` reference to the actual value. This can be performed using `QRL.resolve(..)` function.

<docs code="./examples.tsx#qrl-usage-import"/>

NOTE: `element` is needed because `QRL`s are relative and need a base location to resolve against. The base location is encoded in the HTML in the form of `<div q:base="/url">`.

## `QRL.resolved`

Once `QRL.resolve()` returns, the value is stored under `QRL.resolved`. This allows the value to be used without having to await `QRL.resolve()` again.

## Question: Why not just use `import()`?

At first glance, `QRL` serves the same purpose as `import()`. However, there are three subtle differences that need to be taken into account.

1. `QRL`s must be serializable into HTML.
2. `QRL`s must be resolved by framework relative to `q:base`.
3. `QRL`s must be able to capture lexically scoped variables.
4. `QRL`s encapsulate the difference between running with and without Qwik Optimizer.
5. `QRL`s allow expressing lazy-loaded boundaries without thinking about chunk and symbol names.

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

1. Notice there is no easy way to extract chunk (`./chunk-abc.js`) and symbol (`onClick`) into HTML.
2. Notice that even if you could extract it, the `import('./chunk-abc.js')` would become relative to where the `import()` file is declared. Because it is our framework doing the load, the `./chunk-abc.js` would become relative to the framework file. This is not correct, as it should be relative to the original file generated by the bundler.
3. Next, the framework needs to resolve the `./chunk-abc.js` and needs a base location that is encoded in the HTML.
4. The QRL needs to be able to capture lexically scoped variables. (`import()` only allows loading top-level symbols which don't capture variables.)
5. As a developer, you don't want to think about `import` and naming the chunks and symbols. You just want to say: "this should be lazy."

These are the main reasons why Qwik introduces its own concept of `QRL`.

@see `$`

@public

# `$`

Qwik Optimizer marker function.

Use `$(...)` to tell Qwik Optimizer to extract the expression in `$(...)` into a lazy-loadable resource referenced by `QRL`.

@see `implicit$FirstArg` for additional `____$(...)` rules.

In this example, `$(...)` is used to capture the callback function of `onmousemove` into a lazy-loadable reference. This allows the code to refer to the function without actually loading the function. In this example, the callback function does not get loaded until `mousemove` event fires.

<docs code="./examples.tsx#qrl-usage-$"/>

In this code, the Qwik Optimizer detects `$(...)` and transforms the code into:

<docs code="./examples.tsx#qrl-usage-$-optimized"/>

## Special Rules

The Qwik Optimizer places special rules on functions that can be lazy-loaded.

1. The expression of the `$(expression)` function must be importable by the system. (expression shows up in `import` or has `export`)
2. If inlined function, then all lexically captured values must be:
   - importable (vars show up in `import`s or `export`s)
   - const (The capturing process differs from JS capturing in that writing to captured variables does not update them, and therefore writes are forbidden. The best practice is that all captured variables are constants.)
   - Must be runtime serializable.

<docs code="./examples.tsx#qrl-capturing-rules"/>

@param expression - Expression which should be lazy loaded
@public

# `implicit$FirstArg`

Create a `____$(...)` convenience method from `___(...)`.

It is very common for functions to take a lazy-loadable resource as a first argument. For this reason, the Qwik Optimizer automatically extracts the first argument from any function which ends in `$`.

This means that `foo$(arg0)` and `foo($(arg0))` are equivalent with respect to Qwik Optimizer. The former is just a shorthand for the latter.

For example, these function calls are equivalent:

- `component$(() => {...})` is same as `component($(() => {...}))`

<docs code="./examples.tsx#implicit$FirstArg"/>

@param fn - a function that should have its first argument automatically `$`.
@public

# `qrl`

Used by Qwik Optimizer to point to lazy-loaded resources.

This function should be used by the Qwik Optimizer only. The function should not be directly referred to in the source code of the application.

@see `QRL`, `$(...)`

@param chunkOrFn - Chunk name (or function which is stringified to extract chunk name)
@param symbol - Symbol to lazy load
@param lexicalScopeCapture - a set of lexically scoped variables to capture.
@public

# `useDocument`

Retrieves the document of the current element. It's important to use this method instead of accessing `document` directly because during SSR, the global document might not exist.

NOTE: `useDocument` method can only be used in the synchronous portion of the callback (before any `await` statements.)

@public

# `ContextId`

ContextId is a typesafe ID for your context.

Context is a way to pass stores to the child components without prop-drilling.

Use `createContextId()` to create a `ContextId`. A `ContextId` is just a serializable identifier for the context. It is not the context value itself. See `useContextProvider()` and `useContext()` for the values. Qwik needs a serializable ID for the context so that the it can track context providers and consumers in a way that survives resumability.

### Example

<docs code="./examples.tsx#context"/>
@public

# `createContextId`

Create a context ID to be used in your application.
The name should be written with no spaces.

Context is a way to pass stores to the child components without prop-drilling.

Use `createContextId()` to create a `ContextId`. A `ContextId` is just a serializable identifier for the context. It is not the context value itself. See `useContextProvider()` and `useContext()` for the values. Qwik needs a serializable ID for the context so that the it can track context providers and consumers in a way that survives resumability.

### Example

<docs code="./examples.tsx#context"/>
@param name - The name of the context.
@public

# `useContextProvider`

Assign a value to a Context.

Use `useContextProvider()` to assign a value to a context. The assignment happens in the component's function. Once assigned, use `useContext()` in any child component to retrieve the value.

Context is a way to pass stores to the child components without prop-drilling.

### Example

<docs code="./examples.tsx#context"/>
@param context - The context to assign a value to.
@param value - The value to assign to the context.
@public

# `useContext`

Retrieve Context value.

Use `useContext()` to retrieve the value of context in a component. To retrieve a value a parent component needs to invoke `useContextProvider()` to assign a value.

### Example

<docs code="./examples.tsx#context"/>
@param context - The context to retrieve a value from.
@public
