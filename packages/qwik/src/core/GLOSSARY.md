# Glossary

When reading source-code it is useful to understand these terms.

## Component

Component refers to `component$()` or just inline-component. Usually unless specified otherwise, it refers to `component$()`

## Host

A host refers to a vNode of the `component$()`. Typically host is used in the context of signals. For example if a signal changes, which component should be re-rendered.

## Sparse components

The server only writes what the client needs to render a component again. A component that nothing can change leaves no trace on the client.

Take a component that can render again, because a handler can change state that it reads while rendering, with three static components nested below it:

| Component                                              | What the client has                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| Can render again                                       | host with render function, props and hook state                    |
| Its direct child component                             | host with render function, plus props and hook state if it has any |
| One level further down                                 | host with only a hash, so the diff recognizes it and skips it      |
| Deeper, or with nothing above it that can render again | no host: its output belongs to the nearest host above              |

When a parent renders again, the QRL and props of a child come from the parent's JSX, so those never have to be serialized. Hook state (`useSignal`, `useStore`, tasks) only comes from serialization. A host without it must not render again: its hooks would start over. And where there is no host, the diff mounts a new instance and replaces the DOM.

Dev mode serializes more than production does, so check this behavior in a production build.

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
