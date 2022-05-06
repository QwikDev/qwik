# API DOCS for: `component.public.ts`

---

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
- `$`: mark which parts of the component will be lazy-loaded. (see `$` for details.)

The above can then be used like so:

<docs code="./component.examples.tsx#component-usage"/>

See also: `component`, `useCleanup`, `onResume`, `onPause`, `useOn`, `useOnDocument`, `useOnWindow`, `useStyles`, `useScopedStyles`

@param onMount - Initialization closure used when the component is first created.
@param tagName - Optional components options. It can be used to set a custom tag-name to be used for the component's host element.

@public

# `useCleanup`

A lazy-loadable reference to a component's destroy hook.

Invoked when the component is destroyed (removed from render tree).

@public

# `usePause`

A lazy-loadable reference to a component's on pause hook.

Invoked when the component's state is being serialized (dehydrated) into the DOM. This allows the component to do last-minute clean-up before its state is serialized.

Typically used with transient state.

@public

# `useResume`

A lazy-loadable reference to a component's on resume hook.

The hook is eagerly invoked when the application resumes on the client. Because it is called eagerly, this allows the component to resume even if no user interaction has taken place.

@public

# `useVisible`

A lazy-loadable reference to a component's on visible hook.

The hook is lazily invoked when the component becomes visible.

@public

# `styles`

A lazy-loadable reference to a component's styles.

Component styles allow Qwik to lazy load the style information for the component only when needed. (And avoid double loading it in case of SSR hydration.)

@public

# `useOn`

Register a listener on the current component's host element.

Used to programmatically add event listeners. Useful from custom `use*` methods, which do not have access to the JSX.

See: `on`, `onWindow`, `onDocument`.

@public

# `useOnWindow`

Register a listener on `window`.

Used to programmatically add event listeners. Useful from custom `use*` methods, which do not have access to the JSX.

See: `on`, `onWindow`, `onDocument`.

@public

# `useOnDocument`

Register a listener on `document`.

Used to programmatically add event listeners. Useful from custom `use*` methods, which do not have access to the JSX.

See: `on`, `onWindow`, `onDocument`.

@public

# `useStyles`

Refer to component styles.

@alpha

# `useScopedStyles`

@alpha

# `PropsOf`

Infers `Props` from the component.

<docs code="./component.examples.tsx#component-usage"/>

@public
