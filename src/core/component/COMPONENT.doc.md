[![hackmd-github-sync-badge](https://hackmd.io/Ge5Y6es0TbmFAEROhnhLkQ/badge)](https://hackmd.io/Ge5Y6es0TbmFAEROhnhLkQ)

# Component

Components are the basic building blocks of Qwik applications. Qwik asks you to breaks up the component into three parts:

1. **view**: Contains the JSX code which renders the visual portion of the component.
2. **state** factory: Contains code that creates a new component state.
3. event **handlers**: Contains code used for component behavior/user interactions.

## Why break up components into three parts?

Most frameworks keep view, state, and handler code together. Here is an example of how a pseudo framework might achieve this:

```typescript
export function Counter(props: {step?:number}) {
 const [count, setCount] = useState(50);
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

Note that the components view, state, and handler are all inlined together and heavily rely on closing over variables in the parent scope. The implication is that all of these parts (view, state, and handler) have to be downloaded, parsed, and executed together. This severely limits our lazy loading capability.

The example above may be trivial, but imagine a more complex version of the above, which requires many KB worth of code to be downloaded, parsed, and executed together. In such a case, requiring the view, state, and handler to be eagerly loaded together is a problem. Let's look at some common user usage patterns to get a better idea as to why this is an issue:

**User interacts with a component by clicking on it:**

- some of the `handler`s are needed: Only the specific handler which is triggered needs to be downloaded. All other handlers are not needed.
- `view` is **not needed**: View may not be needed because the handler may not cause a re-render or may cause a re-render of a different component.
- `state factory` is **not needed**: The component is being rehydrated and so no state initialization code is needed.

**Component state is mutated:**

- `handler`s are **not needed**: No handlers need to execute.
- `view` is needed: View is needed because the component needs to be rerendered.
- `state factory` is **not needed**: The component is being rehydrated and so no state initialization code is needed.

**New component is created by the parent:**

- `handler`s are **not needed**: No handlers need to execute.
- `view` is needed: View is needed because the component needs to be rendered.
- `state factory` is needed: The component is being created and so state initialization code is needed.

What the above demonstrates is that in each use-case only part of the view, state, handler information is required. The problem is that we have three distinct pieces of information which are all inlined together, but we only need to use them at different times of the component lifecycle. To achieve optimal performance we need a way to download and execute the component in parts, based on what the component needs to do. The above code, as it is written, is permanently bound together.

## Breaking up is easy to do

Qwik solves this by only downloading and executing the code that is needed for the task at hand. Keep in mind that while the example above is simple, the complexity of the code is significantly larger in real-world scenarios. Furthermore, more complex code oftentimes contains more imports (which in turn have imports of their own), which adds even more code to the component.

It is not possible to "tool" our way out of this. It isn’t possible to write a statically analyzable tool that can separate these pieces into parts that can then be lazy-loaded as needed. The developer must break up the component into the corresponding parts to allow fine-grain lazy loading.

Qwik has `qHook` marker functions for this purpose.

**file:** `my-counter.tsx`

```typescript
import { component, qHook } from '@builder.io/qwik';

export const Counter = component<{ value?: number; step?: number }, { count: number }>({
  onMount: qHook((props) => ({ count: props.value || 0 })),
  onRender: qHook((props, state) => (
    <div>
      <span>{state.count}</span>
      <button
        on:click={qHook<typeof Counter>((props, state) => {
          state.count += props.step || 1;
        })}
      >
        +
      </button>
    </div>
  )),
});
```

Compared to other frameworks, the above is a bit wordier. However, the cost of the explicit break up of components into their parts gives us the benefit of fine-grained lazy loading.

- Keep in mind that this is a relatively fixed DevExp overhead per component. As the component complexity increases, the added overhead becomes less of an issue.
- The benefit of this is that tooling now has the freedom to package up the component in multiple chunks which can be lazy-loaded as needed.

## What happens behind the scenes

`qHook` is a marker for Qwik Optimizer, which tells the tooling that it needs to transform any reference to it into a QRL. The resulting files can be seen here:

**File:** `my-counter.js`

```typescript
import { component, qHook } from '@builder.io/qwik';

export const Counter = component<{ value?: number; step?: number }, { count: number }>({
  onMount: qHook('entry-cde#Counter_onMount'),
  onRender: qHook('entry-abc#Counter_onRender'),
});
```

In addition to the source file transformation, the optimizer transformed references between the view, state, and handlers into QRLs. Qwik Optimizer also generates entry point files for the rollup. These entry points match the QRLs above.

**File:** `entry-abc.js`

```typescript
import { qHook } from '@builder.io/qwik';

export const Counter_onRender = qHook((props, state) => (
  <div>
    <span>{state.count}</span>
    <button on:click={qHook<typeof Counter>('entry-pqr#Counter_onClick')}>+</button>
  </div>
));
```

**File:** `entry-pqr.js`

```typescript=
import { qHook } from '@builder.io/qwik';
import type { Counter } from './my-counter';

export const Counter_onClick = qHook<typeof Counter>((props, state) => {
  state.count += props.step || 1;
});
```

**File:** `entry-cde.js`

```typescript
import { qHook } from '@builder.io/qwik';

export const Counter_onMount = qHook((props) => ({ count: props.value || 0 }));
```

The important thing to note is that Qwik has great freedom on how many entry files should be generated, as well as which export goes into which entry file. This is because the developer never specified where the lazy loading boundaries are. Instead, the framework guided the developer to write code in a way that introduced many lazy loading boundaries in the codebase. This gives Qwik the power to generate optimal file distribution based on actual application usage. For small applications, Qwik can generate a single file. As the application size grows, more entry files can be generated. If a particular feature is rarely used, it can be placed in its own bundle.

### Constraints

In order for the tooling to be able to move `qrlOnRender`, `qrlOnMount`, `qrlHandler` around the usage of these methods is restricted. (Not every valid JS program is a valid Qwik program.) The constraint is that all functions which are enclosed in `qHook` must be moveable into different files. In practice this means that functions can only close over symbols which are:

1. `import`able (i.e. the symbol was `import`ed.)
2. `export`ed (i.e. the symbol is already exported so that it can be imported from the entry file.)

## Tooling has choices

It is possible (and all too common) to break up an application into too many small files, which negatively impacts download performance. For this reason, the tooling may choose to merge files together and over-bundle. This is desirable behavior. If your entire application is relatively small (less than 50KB) then breaking it up into hundreds of files would be counterproductive.

If your code structure is fine-grained, the tooling can always choose to create larger (and fewer) bundles. The opposite is not true. If your code structure is coarse, there is nothing the tooling can do to break it up. Qwik guides the developer to break up the application into the smallest possible chunks, and then rely on tooling to find the optimal bundle chunks. This way Qwik can provide optimal performance for applications of all sizes.
