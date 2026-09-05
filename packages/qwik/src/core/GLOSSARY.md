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

vNodes are Qwik's translation layer between your JSX and the actual HTML. They act like sticky notes, helping Qwik track and manage changes efficiently.

```tsx
<Component>
  <button />
</Component>
```

`Component` and `Signal` are examples of these sticky notes. Signal vNodes are particularly interesting as they create boundaries between normal text nodes, marking regions that can change.

When Qwik updates your UI, it follows these steps:

1. First, it looks at your sticky notes (vNodes) to see the current state
2. Then, it compares this with your desired changes (JSX)
3. Finally, it records the necessary changes in a journal, which will be applied to the HTML in a separate step

## How the Diff Works

The diff process uses two key pieces:

- `jsxNode`: What you want your component to look like (input)
- `vStartNode`: A snapshot of what your component currently looks like (output)

> The diff only looks at the specific component or signal being updated, not the entire page.

During this process, Qwik:

1. Compares the current vNodes with your desired changes
2. Records updates, additions, or removals in a change journal
3. Handles cleanup of any removed elements
4. Later applies these changes to ensure the final HTML matches what you wanted

> On the server, Qwik only generates SSR nodes to create the initial HTML - vNodes only exist on the client where reconciliation is needed.

### How Qwik handles props

Qwik optimizes prop handling by distinguishing between two types:

#### constProps (like JavaScript's `const`)

The prop reference remains constant, though deep changes to objects/arrays are still possible through reactivity. For example, with a signal, the signal instance is constant, but its value can change.

#### varProps (like JavaScript's `let`)

The prop reference itself can change over time

```tsx
// constProp example with signal
const count = useSignal(0);
<Counter count={count} />; // signal instance is constant, but value changes

// varProp example with store
const store = useStore({ text: 'hello' });
<Button text={store.text} />; // store property reference can change
```

For performance, the vNode Tree primarily focuses on `varProps` since they represent the dynamic aspects that need reconciliation. Deep changes in `constProps` are handled through Qwik's reactivity system rather than the diffing process.

> For efficient diffing, Qwik converts props into [monomorphic data structures](https://www.builder.io/blog/monomorphic-javascript). This avoids the expensive cost of iterating over dynamic objects.

### Structural changes

Qwik optimizes for stable DOM structures and tries to minimize re-renders. However, sometimes structural changes are necessary.

A structural change occurs when you modify the shape or hierarchy of your JSX tree by:

- Adding or removing elements
- Changing element types (e.g., `div` → `span`)
- Reordering elements
- Modifying the number of children
- Adding or removing components conditionally

For example, this adds a new element, triggering a structural change:

```tsx
// Before
<div>
  <span>Hello</span>
</div>

// After
<div>
  <span>Hello</span>
  <p>World</p>  // Structural change: new element added
</div>
```
