# Glossary

When reading source-code it is useful to understand these terms.

## Component

Component refers to `component$()` or just inline-component. Usually unless specified otherwise, it refers to `component$()`

## Host

A host refers to a vNode of the `component$()`. Typically host is used in the context of signals. For example if a signal changes, which component should be re-rendered.

## Logical vs Render Tree

- Logical Tree: The tree of components.
- Render Tree: The actual DOM render representation taking projection into account.

Logical description:

```typescript
const Child = component$(()=> {
  return (
    <p>
      <Slot/>
    </p>
})

const Parent = component$(()=> {
  return (
    <div>
      <Child>
        <span>Hello</span>
      </Child>
    </div>
})
```

Render Tree:

```html
<div>
  <p>
    <span>Hello</span>
  </p>
</div>
```

Notice that from `Parent`'s point of view `<span>` is a child of `<Child/>` but from the render tree point of view `<span>` is a child of `<p>`. The render tree is interleaved results of the logical tree.

## Inline-Component

Inline-component is a function that represents a component. However unlike a `component$()` the inline-component host is not the component itself but rather the closest `component$` parent.

## VNode

> Should really be called vDOM, but that term is already taken.

Here is the basic flow of data: JSX -> vDOM -> `vnode_diff` -> VNode -> DOM

- JSX: The actual source code that is written by the developer. ie. `<div>hello</div>`
- vDOM: The runtime representation of the JSX. vDOM follows the logic tree.
- `vnode_diff`: The algorithm that compares two vDOMs and produces a list of changes.
- VNode: A layer on top of DOM which can be deserialized from SSR, and which understands Virtual Nodes and properties on those nodes.
- DOM: The actual browser DOM.
