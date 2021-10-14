## Component

Components are the basic building blocks of Qwik applications. Qwik asks you to breaks up the component into three parts:

1. **view**: Contains the JSX code which renders the visual portion of the component.
2. **state** factory: Contains code that creates a new component state.
3. event **handlers**: Contains code used for component behavior/user interactions.

## Why break up components into three parts?

Most frameworks keep view, state, and handler code together. Here is an example of how a pseudo framework might achieve this:

```typescript
export function Counter(props: {step?:number}) {
 const [count, setCount] = useState({count: 50});
 const step = props.step || 1;
 return (
   <div>
     <button onclick={() => setCount(count - step)}>-</botton>
     <span>{count}</span>
     <button onclick={() => setCount(count + step)}>+</botton>
   </div>
 )
}
```

Note that the components view, state, and handler are all inlined together. The implication is that all of these parts (view, state, and handler) have to be downloaded, parsed, and executed together. This severely limits our lazy loading capability.

The example above might be trivial, but imagine a more complex version of the above, which requires many KB worth of code to be downloaded, parsed, and executed together. In such a case, requiring the view, state, and handler to be eagerly loaded together might be a problem. Let's look at some common user usage patterns to get a better idea as to why this is an issue:

**User interacts with a component by clicking on it:**

- some of the `handler`s are needed: Only the specific handler which is triggered needs to be downloaded. All other handlers are not needed.
- `view` is **not needed**: View may not be needed because the handler may not cause a re-render on may cause a re-render of a different component.
- `state factory` is **not needed**: The component is being rehydrated and so no state initialization code is needed.

**Component state is mutated:**

- `handler`s are **not needed**: No handlers need to execute.
- `view` is needed: View is needed because the component needs to be rerendered.
- `state factory` is **not needed**: The component is being rehydrated and so no state initialization code is needed.

**New component is created by the parent:**

- `handler`s are **not needed**: No handlers need to execute.
- `view` is needed: View is needed because the component needs to be rendered.
- `state factory` is needed: The component is being created and so state initialization code is needed.

What the above demonstrates is that in each use-case only part of the view, state, handler information is required. The problem is that we have three distinct pieces of information which are all inlined together, but we only need to use them at different times of the component lifecycle. To achieve the optimal performance we need a way to download and execute the component in parts, based on what the component needs to do. The above code, as it is written, is permanently bound together.

## Breaking up is easy to do

Qwik solves this by only downloading and executing the code that is needed for the task at hand. Keep in mind that while the example above is simple, the complexity of the code is significantly larger in real-world scenarios. Furthermore, more complex code oftentimes contains more imports (which in turn have imports of their own), that adds even more code to the component.

It is not possible to "tool" our way out of this. It isn’t possible to write a statically analyzable tool that can separate these pieces into parts that can then be lazy loaded as needed. The developer must break up the component into the corresponding parts to allow fine-grain lazy loading.

Qwik has `qrlOnRender`, `qrlOnMount` and `qrlHandler` marker functions for this purpose.

**file:** `my-counter.tsx`

```typescript
import { QComponent, qComponent, qrlOnRender, qrlHandler, qrlOnMount } from '@builder.io/qwik';

// Declare the component type, defining prop and state shape.
export type Counter = QComponent<{ step?: number }, { count: number }>;

// Declare the component's initialization hook. This will be used
// when new component is being created to initialize the state.
// (It will not be used on rehydration.)
export const onMount = qrlOnMount<Counter>(() => {
  return { count: 0 };
});

// Define the component's view used for rendering the component.
export const onRender = qrlOnRender<Counter>(({ props, state }) => {
  return (
    <div>
      <button on:click={update.with({ direction: -1 })}>-</button>
      <span>{state.count}</span>
      <button on:click={update.with({ direction: 1 })}>+</button>
    </div>
  );
});

// Component view may need handlers describing behavior.
export const update = qrlHandler<Counter, { direction: number }>(({ props, state, params }) => {
  state.count += params.direction * (props.step || 1);
});

// Finally tie it all together into a component.
export const Counter = qComponent<Counter>({ onMount, onRender });
```

Compared to other frameworks, the above is wordier. However, the cost of the explicit break up of components into their parts gives us the benefit of fine-grained lazy loading.

- Keep in mind that this is a relatively fixed DevExp overhead per component. As the component complexity increases, the added overhead becomes less of an issue.
- The benefit of this is that tooling now has the freedom to package up the component in multiple chunks which can be lazy loaded as needed.

## What happens behind the scenes

`qrlOnMount`, `qrlHandler`, `qrlOnRender` are all markers for Qwik Optimizer, which tell the tooling that it needs to transform any reference to it into a QRL. The resulting files can be seen here:

**File:** `my-counter.js`

```typescript
import {qComponent, qrlOnRender, qrlHandler, qrlOnMount} from '@builder.io/qwik';

export const onMount = qrlOnMount(() => ({ count: 0 }));

export const onRender = qrlOnRender(({props, state}) => {
 return (
   <div>
     <button on:click="/chunk-pqr#update?direction=-1">
       //              ^^^^^^^^^^^ OPTIMIZER ^^^^^^^^^^
       -
     </button>
     <span>{state.count}</span>
     <button on:click="/chunk-pqr#update?direction=1">
       //              ^^^^^^^^^^^ OPTIMIZER ^^^^^^^^^^
       +
     </button>
   </div>
 );
});

export const update = qrlHandler(
  (props, state, params) => {
         state.count += params.direction * (props.step || 1);
);


export const Counter = qComponent({
  onMount: '/chunk-cde#onMount',   // <<=== OPTIMIZER
  onRender: '/chunk-abc#onRender', // <<=== OPTIMIZER
});
```

In addition to the source file transformation, the optimizer removed any static references between the view, state, and handlers. Optimizer also generates entry point files for the rollup. These entry points match the QRLs above.

**File:** `chunk-abc.js`

```typescript
export { onRender } from './my-counter';
```

**File:** `chunk-pqr.js`

```typescript
export { update } from './my-counter';
```

**File:** `chunk-cde.js`

```typescript
export { onMount } from './my-counter';
```

The important thing to note is that Qwik has great freedom on how many entry files should be generated, as well as which export goes into which entry file. This is because the developer never specified where the lazy loading boundaries are. Instead, the framework guided the developer to write code in a way that introduced many lazy loading boundaries in the codebase. This gives Qwik the power to generate optimal file distribution based on actual application usage. For small applications, Qwik can generate a single file. As the application size grows, more entry files can be generated. If a particular feature is rarely used, it can be placed in its own bundle.

Once Rollup processes the entry files, the resulting files are as seen below:

**File:** `chunk-abc.js`

```typescript
import { qrlOnMount } from '@builder.io/qwik';

export const onRender = qrlOnMount(() => ({ count: 0 }));
```

**File:** `chunk-pqr.js`

```typescript
import { qrlHandler} from '@builder.io/qwik';

export const update = qrlHandler(
  ({props, state, params}) => {
         state.count += params.direction * (props.step || 1);
);
```

**File:** `chunk-cde.js`

```typescript
import { qrlOnRender } from '@builder.io/qwik';

export const onRender = qrlOnRender(({ props, state }) => {
  return (
    <div>
      <button on:click="/chunk-pqr#update?direction=-1">-</button>
      <span>{state.count}</span>
      <button on:click="/chunk-pqr#update?direction=1">+</button>
    </div>
  );
});
```

Notice that Rollup flattened the contents of files into the entry files and removed any unneeded code, resulting in ideally sized bundles.

### Constraints

In order for the tooling to be able to move `qrlOnRender`, `qrlOnMount`, `qrlHandler` around the usage of these methods is restricted. (Not every valid JS program is a valid Qwik program.) The constraint is that all of the marker functions must be a top-level function that is `export`ed.

Examples of invalid code:

```typescript
import { someFn } from './some-place';

function main() {
  const MyStateFactory = qrlOnMount(() => ({})); // INVALID not top level
}
```

## Tooling has choices

It is possible (and all too common) to break up an application into too many small files, which negatively impacts download performance. For this reason, the tooling may choose to merge files together and over-bundle. This is desirable behavior. If your entire application is relatively small (less than 50KB) then breaking it up into hundreds of files would be counterproductive.

If your code structure is fine-grained, the tooling can always choose to create larger (and fewer) bundles. The opposite is not true. If your code structure is coarse, there is nothing the tooling can do to break it up. Qwik guides the developer to break up the application into the smallest possible chunks, and then rely on tooling to find the optimal bundle chunks. This way Qwik can provide optimal performance for applications of all sizes.
