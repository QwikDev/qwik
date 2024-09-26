# Qwik v2

So this started as a rewrite of the serialization mechanism of Qwik. But then it turned into a rewrite of the Qwik runtime. The reason is that the serialization mechanism is so tightly integrated into the rest of the Qwik that it is impossible to separate it out.

**What this code touches:**

- SSR (Server Side Rendering)
  - SSR Serialization mechanism: See: [Even more efficient Qwik v2](https://www.notion.so/builderio/Towards-Qwik-2-0-Even-More-Efficient-f9a2887415984897b858feeb78aab227).
- CSR (Client Side Rendering)
  - Complete rewrite how the internal state is stored in memory.
  - vDOM diffing

**Reasoning/Goals:**

- Improve the serialization mechanism:
  - decrease the size of the HTML payload.
  - move the serialization content to the end of HTML to improve the content to user speed.
- Improve the runtime:
  - Decrease memory pressure.
  - Greatly simplifies the mental model of the runtime.
- Testing
  - Make it easier to write tests
  - Make it possible to write integration tests between SSR and CSR (showing resumability) without relying on e2e tests which are slow and brittle.

> **NOTE:**
>
> An important goal of this rewrite is to simplify the codebase and make it easier to understand so that it can encourage OSS contributions.
>
> Writing something second time is always easier, as ones understand of the problem domain is much better.

## Contributing

As of right now, the code base is mostly separate from the v1 codebase. There is no way to just run the application in v2 mode. Instead, we are focusing on creating featured base tests which will be used to drive the development of the v2 codebase.

In the current directory, you will find files such as `projection.spec.tsx`, `use-signal.spec.tsx`, and so on. Each of these tests is meant to fully describe a feature of the framework. These tests typically run in both pure CSR as well as SSR -> CSR resume mode to demonstrate that the feature works in both modes.

### How to contribute

Here are ways to contribute in the order of time commitment:

1. Review the existing code and point out what is not clear or needs more documentation.
2. Create small fixes against the `build/v2` branch.
3. Add missing tests to the `build/v2` branch showcasing the missing features.
4. Attempt to implement the features in the `build/v2` branch.

**IMPORTANT START HERE:** We have created a special unit test: [`README.spec.tsx`](./README.spec.tsx). The purpose of this unit test is to:

1. Explain how to run tests
2. Explain how to debug tests
3. Explain how v2 serializes data into HTML.

Starts by playing with these tests to better understand the system. Then move on to other tests.

### How to run the tests

To run all tests:

```bash
npm run vitest packages/qwik/src/core/v2
```

To run specific test:

```bash
npm run vitest packages/qwik/src/core/v2/README.spec.tsx
```

## Architecture

There are few key concepts in the v2 architecture which when understood will make the rest of the codebase easier to understand.

### `VNode`

**Problem:** When the framework executes it often time needs to create virtual nodes. Examples of virtual nodes are component boundaries, projection boundaries, Text nodes bound to signals, or just a `<Fragment>` JSX node. This information MUST be preserved between the SSR and CSR. The issue is that HTML does not have a way to preserve this information. In v1 Qwik used comment nodes in HTML to do that, but it turns out there are efficiency issues with that approach (see: [Even more efficient Qwik v2](https://www.notion.so/builderio/Towards-Qwik-2-0-Even-More-Efficient-f9a2887415984897b858feeb78aab227)).

VNode is a layer on top of DOM that reconstructs the virtual Nodes from the HTML + the content of `<script type="qwik/vnode">`. The result is a tree of `VNode` objects that can be used to manipulate the DOM as if it understood the virtual nodes.

> **NOTE:**
>
> `vNode` should really be called `vDOM` but that name is already taken and so we are creating a new name here.

**Design Decisions:**

- `VNode` tree is lazy materialized from DOM + the content of `<script type="qwik/vnode">`. This is done so that the Qwik does not have to allocate memory structures for the entire tree because Qwik tries to be as lazy as possible.
- `VNode` is represented as an array. This may seem confusing but it is the most efficient way to:
  - Encode all of the data such as: DOM node, children, parents, siblings, etc.
  - Arrays are easily expandable so VNode can encode attributes and props of the VNode.
    Arrays have predictable access cost and don't suffer from [megamorphic property access](https://www.builder.io/blog/monomorphic-javascript). This means that traversal is very efficient. - For example, JSXNodes have props. Iterating over the props is very slow as it causes megamorphic property access. Instead, we store the props in an array so that we can sequentially read them.

### `VirtualVNode`

`VirtualVNode` is a special kind of `VNode` that can store properties that can be serialized. This makes it easy to understand which virtual nodes are component binderies. (This removes the need for complex `QContext` object in v1.)

`VirtualVNode` is used for:

- Component boundaries:
  - `q:renderFn` - stores component QRL
  - `q:props` - stores component props
  - `q:seq` - stores component hook sequence number
  - `<name>` - stores projection slot names
- Projection boundaries:
  - `:` - stores projection slot parent

### `Serialization`

**Problem:** in v1 there are three issues with serialization:

1. The serialization format is very confusing as different parts of the system are kept in different places.
2. The serialization format is not very efficient. This is because all deeply nested objects get flattened out into a single array to prevent circular references. This creates a lot of bloat.
3. The deserialization often time has to deserialize a whole subtree before it can be used.

The new system is designed to address all of these issues.

1. All of the data is stored in a single flat array. This makes it easy to understand what is being serialized.
2. Deep objects are NOT flattened unless a circular reference is detected. This makes the serialization much more efficient. This makes the cost of reference cheaper as we pay them only when we need to.
3. The deserialized state is stored behind a proxy, which lazily materializes the data from the store. Only the data which is actively traversed by the client code is deserialized. This makes Qwik even more lazy than it was before.
