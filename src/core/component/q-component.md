Create a Qwik component that can be used in JSX.

Use `qComponent` to declare a Qwik component. `QComponent` is a special kind of component that allows the Qwik framework to lazy load and executed the component independently of other `QComponent`s on the page as well as lazy load the `QComponent`s life-cycle hooks and event handlers.

Side note: You can also declare regular (standard JSX) components that will have standard synchronous behavior.

`QComponent` is a facade that describes how the component should be used without forcing the implementation of the component to be eagerly loaded. The definition of `QComponent` the definition consists of:

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
