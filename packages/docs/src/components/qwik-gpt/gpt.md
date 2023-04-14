## Qwik Components

Qwik components are very similar to React components, they are functions that return JSX.

The main differences are:

- Components are always declared with the `component$` function.
- Components can use the `useSignal` hook to create reactive state.
- Event handlers are declared with the `$` suffix.
- For `<input>`, the `onChange` event is called `onInput$` in Qwik.
- JSX prefers HTML attributes. `class` instead of `className`. `for` instead of `htmlFor`.
- Conditional rendering is done with the ternary operator `?` and the `&&` operator, just like React.
- Lists are rendered using the `map` function, however every item must have a unique `key` property.
- Content projection is done by the `<Slot/>` component. Slots can be named, and can be projected into using the `q:slot` attribute.

```tsx
import { component$, useSignal, Slot, useVisibleTask$ } from '@builder.io/qwik';
import US_PRESIDENTS from './us-presidents.json';
import { MyOtherComponent } from './my-other-component';

// CSS modules are supported by default
import styles from './my-component.module.css';

interface MyComponentProps {
  step: number;
}

// Components are always declared with the `component$` function.
export const MyComponent = component$((props: MyComponentProps) => {
  // Components use the `useSignal` hook to create reactive state.
  const count = useSignal(0); // { value: 0 }

  useVisibleTask$(async (taskCtx) => {
    // `useVisibleTask$` runs only in the browser AFTER the component is first mounted in the DOM.
    // It's ok to inspect the DOM, or use browser APIS, initialize browser-only libraries, start an animation, or a timer...
    const timer = setInterval(() => {
      count.value = count.value + 1;
    }, 1000);
    taskCtx.onCleanup(() => {
      clearInterval(timer);
    });
  });
  return (
    <>
      <button
        class={styles.button}
        onClick$={() => {
          // Event handlers have the `$` suffix.
          count.value = count.value + props.step;
        }}
      >
        Increment by {props.step}
      </button>

      <main
        class={{
          conditionalClass: count.value % 2 === 0,
        }}
      >
        <h1>Count: {count.value}</h1>
        <MyOtherComponent>
          {count.value > 10 && <p>Count is greater than 10</p>}
        </MyOtherComponent>
        <ul>
          {US_PRESIDENTS.map((president) => (
            <li key={president.id}>
              {president.name}
            </li>
          ))}
        </ul>
      </main>
    </>
  );
});
```

## Routing

Qwik comes with a file-based router, which is similar to Next.js. The router is based on the file-system, creating a new `index.tsx` file in `src/routes/` will create a new route. For example, `src/routes/home/index.tsx` will create a route at `/home/`.

You can create dynamic routes by adding a folder with like `[param]` in the route path. For example, `src/routes/user/[id]/index.tsx` will create a route at `/user/:id/`. In order to access the route parameter, you can use the `useLocation` hook exported from `@builder.io/qwik-city`.

To link to other routes, you can use the `Link` component, it is like `<a>` but allows for SPA navigation.

```tsx title="src/routes/user/[userID]/index.tsx"
import { component$ } from '@builder.io/qwik';
import { useLocation, Link } from '@builder.io/qwik-city';

export default component$(() => {
  const loc = useLocation();
  return (
    <>
      <nav>
        <Link href="/about/">SPA navigate to /about/</Link>
        <a href="/about/">Full page navigate to /about/</a>
      </nav>
      <main>
        {loc.isNavigating && <div>Loading...</div>}
        <h1>User: {loc.params.userID}</h1>
        <div>Current URL: {loc.url.href}</div>
      </main>
    </>
  );
});
```