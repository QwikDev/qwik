# `qComponent`

Create a Qwik component that can be used in JSX.

Use `qComponent` to declare a Qwik component. `QComponent` is a special kind of component that allows the Qwik framework to lazy load and executed the component independently of other `QComponent`s on the page as well as lazy load the `QComponent`s life-cycle hooks and event handlers.

Side note: You can also declare regular (standard JSX) components that will have standard synchronous behavior.

`QComponent` is a facade that describes how the component should be used without forcing the implementation of the component to be eagerly loaded. The definition consists of:

- Component definition (`qComponent`) a description of the public (props) and private (state) interface of a component.
- a set of life-cycle hooks. (`onRender` is the only required hook).
- `tag`/`props`: an optional tag and props to be placed on the host element of the component.

### Example:

Example showing how to create a counter component.

<docs code="./q-component.docs.tsx#component"/>

- `qComponent` is how a component gets declared.
- `{ value?: number; step?: number }` declares the public (props) interface of the component.
- `{ count: number }` declares the private (state) interface of the component.
- `onMount`: is used to initialize the private state.
- `onRender`: is required hook for rendering the component.
- `qHook`: mark which parts of the component will be lazy-loaded. (see `qHook` for details.)

The above can than be used like so:

<docs code="./q-component.docs.tsx#component-usage"/>

@public

# `qComponent.onRender`

A lazy-loadable `QHook` reference to a component's render hook.

NOTE: This is the only required lifecycle hook for `QComponent`.

### Example

<docs code="./q-component.docs.tsx#on-render"/>

# `qComponent.tagName`

HTML tag to be used for the component's host-element (defaults to `div`.)

Component host-element must be inserted synchronously during rendering. However, the component's view is inserted asynchronously. When inserting the host-element it usually looks something like this:

```html
<div on:q-render="..." on:q-init="..." ...></div>
```

A lot of developers like to stick to `<div>` as the host element, but
one can choose any name they find helpful, such as `my-component`, to make
the DOM more readable.

```html
<my-component on:q-render="..." on:q-init="..." ...></my-component>
```

# `qComponent.onMount`

A lazy-loadable `QHook` reference to a component's initialization hook.

`OnMount` is invoked when the component is first created and before the component is rendered. `OnMount`s primary purpose is to create component's state. Typically the `OnRender` will use the state for rendering.

`OnMount` invokes on `QComponent` creation, but not after rehydration. When performing SSR, the `OnMount` will invoke on the server because that is where the component is created. The server then dehydrates the application and sends it to the client. On the client, the `QComponent` may be rehydrated. Rehydration does not cause a second `OnMount` invocation. (Only one invocation per component instance, regardless if the lifespan of the component starts on the server and continues on the client.)

NOTE: All lifecycle hooks can be synchronous or asynchronous.

See: `OnMount` for details.

### Example

<docs code="./q-component.docs.tsx#on-mount"/>

# `qComponent.onUnmount`

A lazy-loadable `QHook` reference to a component's destroy hook.

Invoked when the component is destroyed (removed from render tree).

# `qComponent.onDehydrate`

A lazy-loadable `QHook` reference to a component's on dehydrate hook.

Invoked when the component's state is being serialized (dehydrated) into the DOM. This allows the component to do last-minute clean-up before its state is serialized.

# `qComponent.onHydrate`

A lazy-loadable `QHook` reference to a component's on hydrate hook.

Invoked when the component's state is re-hydrated from serialization. This allows the component to do any work to re-activate itself.

# `qComponent.onResume`

A lazy-loadable `QHook` reference to a component's on resume hook.

The hook is eagerly invoked when the application resumes on the client. Because it is called eagerly, this allows the component to hydrate even if no user interaction has taken place.

# `qComponent.styles`

A lazy-loadable reference to a component styles.

Component styles allow Qwik to lazy load the style information for the component only when needed. (And avoid double loading it in case of SSR hydration.)

# `qComponent.props`

A set of props to be automatically added to the host-element.

Useful when the component needs to have a set of attributes present in the dom before the `OnRender` executes.

### Example

<docs code="./q-component.docs.tsx#props"/>

When rendered as:

```html
<MyComp label="myLabel" name="World" />
```

Would result in:

```html
<my-comp label="myLabel" name="World" title="MyTitle"></my-comp>
```

Notice that `props` provides default values that will be auto-added to the component props (unless the component instantiation props override them.)

# `QComponent`

Defines `QComponent` type definition.

`QComponent` is a type returned by the `qComponent` method and is used to verify type-safety throughout the component definition.

`QComponent` contains type information about:

- `PROPS` public interfaces for props (to be used in `<MyComponent propA ...>`)
- `STATE` private state. This will be serialized into HTML on dehydration, therefore it must be JSON serializable. (`OnRender` typically uses both `PROPS` and `STATE`.)

### Example

A simple example with no `STATE` only `PROPS`

<docs code="./q-component.docs.tsx#component"/>

The above allows one to use `Counter` like so:

<docs code="./q-component.docs.tsx#component-usage"/>

## Referring to types

Normally `QComponent` is used in the application for type-safety as is. At times it is required to refer to the types of `PROPS` and, `STATE`directly. In such a case, one can use `PropsOf` and `StateOf`.

See: `PropsOf`, `StateOf`.

@public

# `PropsOf`

Infers `Props` from `QComponent`.

Given:

```
type MyComponent = qComponent<{propA: string}>({...});
```

Then:

```
const myProps: PropsOf<typeof MyComponent> = ...; // Same as `{propA: string}`
```

@public

# `StateOf`

Infers `State` from `QComponent`.

Given:

```
type MyComponent = qComponent<{}, {propA: string}>({...});
```

Then:

```
const myState: StateOf<typeof MyComponent> = ...; // Same as `{propA: string}`
```

@public
