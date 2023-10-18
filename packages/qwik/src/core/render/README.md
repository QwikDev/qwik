# `render` sub-system

Rendering sub-system of `Qwik`. Currently, only `JSX` implementation is present, but the system is designed to support other rendering systems provided that they abide by these rules:

- Must be able to render by reusing existing DOM nodes (rather than replace existing DOM nodes).
- Must have a mechanism for rendering `Qwik` special attributes.

## DOM structure

Everything managed by Qwik is inside a container. This is a DOM element with the attribute `q:container`. For Qwik-City applications, this is normally the `<html>` element.

Every Qwik component renders a pair of comments and then its contents. The open comment is `<!--qv ...-->` with extra metadata encoded, and the closing comment is `<!--/qv-->`.

The contents are `<q-template />` elements that are waiting for their slot to become available, `<style />` elements, and the actual content of the component.

## Rendering

Rendering happens in multple phases:

- During compilations, the embedded `<Tag />` blocks are converted to nested `jsx(componentFn, props)` calls, with the children given as the `children` entry in `props`. (The optimizer converts those `jsx()` calls into `_jsxS()`, `_jsxC()` and `_jsxQ()` depending on the situation for performance reasons)
- At runtime, the `jsx()` calls are executed, and the result is a `JSXNode` object. The deepest children are executed first, and the result is passed as `props.children` to the parent, which is then executed, and so on until the root component is reached.
- Then, the `JSXNode` objects are converted to DOM nodes, starting at the root, and inserted into the DOM.

The conversion from `JSXNode` to DOM nodes uses multiple contexts to keep track of the current state. These are different from the context managed with `useContext()`. The contexts are:

- `QContext`: the component's context
- `RenderContext`: the rendering state, shared between nodes in a subtree
- `SSRContext`: global state during SSR
- `InvokeContext`: used for `invoke()` calls, allowing tracking signal listeners etc

There are 2 kinds of components, Qwik and inline. An inline component is a function of the form `(props) => JsxNode`. A Qwik component is an inline component that was wrapped in `component$`.

Only Qwik components are allowed to use hooks. To allow this, they are internally converted to `<Virtual onRenderFn={componentFn} props={componentProps}>{componentProps.children}</Virtual>`. This `Virtual` component is treated specially during render to set up the contexts that allow tracking hooks.

Qwik components do not get their children; instead, they have to render `<Slot />` in their JsxNode subtree, which acts as a placeholder.

This means the abovementioned `<Virtual/>` component has to keep track of 2 sets of children: The result of the `componentFn` and the children that were passed to the component. Those latter are assigned to slots stored in `$projectedChildren$` and when a `<Slot />` is encountered they are used, otherwise they're rendered invisibly into a `<q:template />` DOM element.
