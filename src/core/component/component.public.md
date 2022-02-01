# `component`

Declare a Qwik component that can be used to create UI.

Use `component` (and `component$`) to declare a Qwik component. A Qwik component is a special kind of component that allows the Qwik framework to lazy load and execute the component independently of other Qwik components as well as lazy load the component's life-cycle hooks and event handlers.

Side note: You can also declare regular (standard JSX) components that will have standard synchronous behavior.

Qwik component is a facade that describes how the component should be used without forcing the implementation of the component to be eagerly loaded. A minimum Qwik definition consists of:

- Component `onMount` method, which needs to return an
- `onRender` closure which constructs the component's JSX.

### Example:

An example showing how to create a counter component:

<docs code="./component.examples.tsx#component"/>

- `component$` is how a component gets declared.
- `{ value?: number; step?: number }` declares the public (props) interface of the component.
- `{ count: number }` declares the private (state) interface of the component.
- `onMount` closure: is used to create the data store (see: `useStore`);
- `onRender$`: is the required hook for rendering the component.
- `$`: mark which parts of the component will be lazy-loaded. (see `$` for details.)

The above can than be used like so:

<docs code="./component.examples.tsx#component-usage"/>

See also: `component`, `onRender`, `onUnmount`, `onHydrate`, `onDehydrate`, `onHalt`, `onResume`, `on`, `onDocument`, `onWindow`, `withStyles`, `withScopedStyles`

@param tagName - Optional element tag-name to be used for the component's host element.
@param onMount - Initialization closure used when the component is first created.

@public

# `onRender`

A lazy-loadable reference to a component's render hook.

See: `component`

@public

### Example

<docs code="./component.examples.tsx#on-render"/>

@public

# `onUnmount`

A lazy-loadable reference to a component's destroy hook.

Invoked when the component is destroyed (removed from render tree).

@public

# `onDehydrate`

A lazy-loadable reference to a component's on dehydrate hook.

Invoked when the component's state is being serialized (dehydrated) into the DOM. This allows the component to do last-minute clean-up before its state is serialized.

Typically used with transient state.

@public

# `onHydrate`

A lazy-loadable reference to a component's on hydrate hook.

Invoked when the component's state is re-hydrated from serialization. This allows the component to do any work to re-activate itself.

@public

# `onResume`

A lazy-loadable reference to a component's on resume hook.

The hook is eagerly invoked when the application resumes on the client. Because it is called eagerly, this allows the component to hydrate even if no user interaction has taken place.

@public

# `styles`

A lazy-loadable reference to a component's styles.

Component styles allow Qwik to lazy load the style information for the component only when needed. (And avoid double loading it in case of SSR hydration.)

@public

# `on`

Register a listener on the current component's host element.

Used to programmatically add event listeners. Useful from custom `use*` methods, which do not have access to the JSX.

See: `on`, `onWindow`, `onDocument`.

@public

# `onWindow`

Register a listener on `window`.

Used to programmatically add event listeners. Useful from custom `use*` methods, which do not have access to the JSX.

See: `on`, `onWindow`, `onDocument`.

@public

# `onDocument`

Register a listener on `document`.

Used to programmatically add event listeners. Useful from custom `use*` methods, which do not have access to the JSX.

See: `on`, `onWindow`, `onDocument`.

@public

# `withStyles`

@alpha

# `withScopedStyles`

@alpha

# `PropsOf`

Infers `Props` from the component.

<docs code="./component.examples.tsx#component-usage"/>

@public
