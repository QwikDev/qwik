# Qwik Framework - LLM Context Documentation

This documentation helps LLMs understand the Qwik framework's architecture, development patterns, and best practices for effective code generation and assistance. Be sure to include this documentation in the context of conversations.

Qwik is a modern web framework focused on instant-loading web applications with resumable server-side rendering and precision lazy-loading. It's designed to achieve the fastest possible page load times regardless of application complexity.

Its programming model is very similar to React, but with a few important differences that will be explained in this documentation.

Qwik Router (AKA qwik-city) is a full-stack meta-framework built on Qwik. It is designed to be used with Qwik, and it is the recommended way to build web applications with Qwik. It is a file-based router that is designed to be used with Qwik's server-side rendering.

## Core Concepts

- **Automatic Optimization**: Qwik is designed to be optimized automatically.
  - The developer should focus on writing code, and the framework will take care of the rest.
  - There is a build-time optimizer that is responsible for optimizing the application. It runs as a Vite plugin.
- **Resumable Server-side Rendering**: Unlike traditional frameworks that replay, Qwik resumes execution from where the server left off.
  - The result of SSR is called a **container** and it is generally a full HTML document, but it could also be a partial HTML document (e.g. a `<div>`), to be included in a larger HTML document.
  - SSR always succeeds, and there is never a mismatch between the server and client.
  - Application state is automatically tree-shaken, serialized and deserialized between the server and client. A state management framework is not needed.
  - There is _no_ single client entry point. The application does _not_ hydrate, it **resumes** from where the server left off.
  - No JavaScript is needed for initial page interactivity, except for the small, automatically added, `qwikloader` script.
- **Precision Lazy-loading**: Only necessary parts of the application load on-demand as users interact.
  - This is comparable to streaming a video, where only the segments that are needed are downloaded, as the user watches them.
  - Code is automatically split into the smallest possible **segments**.
  - This means that every event handler is a potential application entry point.
  - There is a `preloader` script that is automatically added to the page, which loads the most likely segments before they are needed.
- **Reactive State Management**: Qwik uses Signals and Stores to manage application state.
  - A **Signal** is an object with a `value` property, which automatically subscribes readers to changes.
  - A **Store** is an object with custom properties, which automatically subscribes readers to changes.
  - When a Signal or Store changes, the relevant parts of the application are automatically re-rendered. The optimizer ensures that changes only affect the smallest part of the application possible.

## Writing Code

- Write code in TypeScript.
- When creating a new component, use the `component$()` wrapper. Sometimes, you can use an "Inline Component" which is a non-wrapped Component. This removes access to hooks, and disables automatic code splitting.
- To store state, prefer using Signals over Stores.
- It is ok to destructure the `props` object, it will not interfere with optimization.

## Key Files

- `vite.config.ts` - The Vite configuration file, which includes the `qwikVite` and `qwikCity` plugins and their respective configurations.
- `src/root.tsx` - The root component of the application.
- `src/entry.server.tsx` - The server entry point of the application. It can also be called `src/entry.fastify.tsx` etc.
- `src/entry.ssr.tsx` - This exports a function that is called by the server to render the application.
- `src/components/` - The recommended place to put shared components.
- `public/` - Static assets. They will be copied as-is to the output directory. For example `robots.txt`, `favicon.ico` or `manifest.json`.

### Routing

- `src/routes/` - The routes of the application.
- `src/routes/**/layout.tsx` - The layout wrapping the route. It should export a default component that renders the `<Slot />` component. It can also contain handlers, routeLoaders and `head` declarations.
- `src/routes/**/index.tsx` - The page component of the route. It should export a default component that renders the page for the current route.
- `src/routes/**/*` - Supporting files for the current route.
- `src/routes/plugin@<name>.ts` - Middleware that can export handlers for the route. They will be called in alphabetical order of the file name.

## Architecture Patterns

Write code in TypeScript. Write types when they cannot be inferred.

For clarity, always dereference Signals when passing them to children. The optimizer will automatically proxy them for performance.

When something should only run on the client or server, guard the code with `if (isBrowser) { ... }` or `if (isServer) { ... }`. These are exported from `@builder.io/qwik`.

Server-side code:

- When you need to access the server, use `server$()`. Inside a server function, verify the used parameters as well as the any variables used from upper scopes, as they are provided by the calling client.
- Prefer using helper functions that are defined in separate files dedicated to server-side code.
- Avoid directly exposing database structures to the client, instead use wrapping functions that return the data in a format suitable for the client.

### Compared to React

Programming is very similar to React, but there are some important differences:

- There are no class components.
- An external state management library is not needed.
- Instead of `useState()`, use `useSignal()`.
- Instead of `useReducer()`, use `useSignal()` or `useStore()`.
- Instead of `useMemo()`, use `useComputed$()`.
- For context, use `createContextId()`, `useContextProvider()`, and `useContext()`. You can `useContext()` in the same component that first provides the context.
- Instead of `useEffect()` and `useLayoutEffect()`, use `useTask$()` or `useVisibleTask$()`.
- Instead of `useRef()` and `useImperativeHandle()`, use `useSignal()` and optionally put a function in the `ref` attribute.
- `useCallback()` is not needed, but you can wrap any function with `$()` to make it a single-instance lazy-loadable. When you pass a function to a child component into a prop ending in `$`, it will be wrapped with `$()` automatically.

Generally speaking, a component will only render once, unless its props change, or it uses reactive state in the render body. Reactive state in the JSX return will be proxied to the children or the DOM.

You can directly return Promises in JSX, but the render function itself should not be async because that interferes with reactivity detection.

### Component Structure

- Components are functions that return JSX, as defined in the type `JsxOutput`.
- Always use `component$()` wrapper.
  - This removes `children`, which you have to render instead by outputting the `<Slot />` component in the right place(s).
  - Exception: if you need to read `children` you can use an "Inline Component" which is a non-wrapped Component. This removes access to hooks, and disables automatic code splitting.
- Prefer to put the props type after the first argument of the component function, either inline or in a separate interface. This makes it easier to switch between inline and wrapped components.
- Event handlers always use `...$()` suffix for lazy loading. For example `onClick$={() => { ... }}`. In general, DOM events are to be handled with `onEventName$={(ev, el) => { ... }}`, where `ev` is the event object and `el` is the element that triggered the event.
- Event handlers are called async when they are not loaded yet and sync otherwise. This means that `ev.preventDefault()` will not always work. So instead, use the attributes `preventdefault:eventname` and `stoppropagation:eventname` to prevent the default behavior and stop the event from bubbling up. For example `preventdefault:click` to prevent the default click behavior and `stoppropagation:click` to stop the click event from bubbling up.

### State Management

- `useSignal()` - Reactive primitive values (string, number, boolean, etc.). **This is the preferred way to store state.**
  - Access and modify via `.value` property.
  - Re-renders only the parts of the UI that read this signal.
- `useStore()` - Reactive object store with **deep reactivity** for nested objects and arrays.
  - Mutate properties directly (e.g., `state.count++`, `state.items.push(...)`).
  - Do NOT replace the store object itself.
  - Use when you need reactivity on nested object properties or array mutations.
- `useComputed$()` - Reactive computed values. Automatically recomputes when dependencies change.
- `useResource$()` - Async data fetching that integrates with SSR and streaming.
- `useTask$()` - Side effects and lifecycle. **Prefer this over `useVisibleTask$`**.
  - Runs on both server (during SSR) and client (on signal changes).
  - Use for data fetching, syncing state, or other side effects.
- `useVisibleTask$()` - **⚠️ Use sparingly!** Runs only on the client after component becomes visible.
  - Forces eager JavaScript execution, defeating Qwik's lazy-loading benefits.
  - Only use for direct DOM manipulation (canvas, third-party libraries, focus management) that cannot be done declaratively.
  - Consider `{strategy: 'document-idle'}` to defer execution until after page load.

Note that a Store wraps and mutates the given object deeply, and it Qwik keeps a reverse mapping of the original object to the Store. If you create two Stores with the same initial object, they will be the same store.

Example of what not to do:

```ts
// DO NOT DO THIS
const initialState = { count: 0, address: { city: "New York" } };
// ...
const state = useStore(initialState);
const state2 = useStore(initialState);
```

Instead, create a new object, deeply cloning if needed:

```ts
// DO THIS INSTEAD, creating a deep clone of the initial state
const state = useStore(() => ({
  ...initialState,
  address: { ...initialState.address },
});
const state2 = useStore(() => ({
  ...initialState,
  address: { ...initialState.address },
});
```

#### Tasks

Tasks are run in the order of their declaration, and are not concurrent. As long as no Task returns a Promise, they will run during the render function.

However, once a Task returns a Promise, subsequent Tasks will wait for the Promise to resolve before running, and the render function will complete first.

You can have async Tasks that change state during SSR, and the server will wait for them to complete before sending the response. You cannot change the JSX of a parent component via state changes during SSR, because the parent component will already have started streaming out.

### Routing (Qwik City)

- File-based routing in `src/routes/`
- Layouts with `layout.tsx`. Make sure to render `<Slot />`.
- `server$()` automatically calls the server to execute the given function and returns the result. Use this where normally you would use an internal REST API.
  - **Important**: Always validate parameters, as they come from the client and can be tampered with.
- Loaders with `routeLoader$()` for data fetching. This data starts to be fetched before SSR starts, based on where in the routes the loader is exported.
  - Can use `zod$()` for input validation.
- Actions with `routeAction$()` for form handling.
  - Can use `zod$()` for automatic form validation.
  - Example with validation:
    ```ts
    import { routeAction$, zod$, z } from "@builder.io/qwik-city";
    export const useAddUser = routeAction$(
      async (data) => {
        // data is validated and typed
        await db.users.create(data);
        return { success: true };
      },
      zod$({
        name: z.string().min(1),
        email: z.string().email(),
      }),
    );
    ```
- Folder naming for routes, in order of precedence:
  - `(internalName)`: purely for code organization. The folder is read and becomes part of the current route
  - regular string: exact match for the given string
  - `[paramName]`: match any string up to the next `/`, and store it under `params[paramName]` of the request object (available in server functions) and `useLocation()`.
  - `[...restName]`: match any subpath

## Styling

Qwik supports multiple styling approaches:

- **Global CSS**: Import CSS files in `root.tsx` or route files.
- **Scoped Styles with `useStylesScoped$()`**: Automatically scopes styles to the component.
  ```ts
  import { component$, useStylesScoped$ } from '@builder.io/qwik';
  export default component$(() => {
    useStylesScoped$(`
      .container { background: blue; }
    `);
    return <div class="container">Styled!</div>;
  });
  ```
- **Module Styles with `useStyles$()`**: Loads styles once globally.
  ```ts
  import { component$, useStyles$ } from '@builder.io/qwik';
  import styles from './styles.css?inline';
  export default component$(() => {
    useStyles$(styles);
    return <div class="container">Styled!</div>;
  });
  ```
- **CSS Modules**: Import `.module.css` files for scoped class names.
  ```ts
  import styles from './component.module.css';
  export default component$(() => {
    return <div class={styles.container}>Styled!</div>;
  });
  ```
- **Tailwind CSS**: Fully supported. Configure in `tailwind.config.js` and import in `global.css`.
- **Inline Styles**: Use the `style` attribute with objects or strings.
  ```tsx
  <div style={{ color: 'red' }}>Red text</div>
  <div style="color: blue;">Blue text</div>
  ```

**Note**: Use `class` attribute, not `className`.

## Environment Variables

- **Client-side**: Access via `import.meta.env.PUBLIC_*`
  - Only variables prefixed with `PUBLIC_` are exposed to the client.
  - Example: `import.meta.env.PUBLIC_API_URL`
- **Server-side**: Access via `import.meta.env.*` or `requestEvent.env`
  - All environment variables are available on the server.
  - In loaders/actions: `requestEvent.env.get('SECRET_KEY')`
  - Note: `requestEvent.env` provides platform-specific access (Cloudflare, Vercel, etc.)

## Testing Strategy

- Unit tests with Vitest
- Component testing with @builder.io/qwik/testing
- E2E tests with Playwright
- Target 80% test coverage
- TDD approach recommended

## Code Style

- TypeScript strict mode enabled
- ESLint with custom Qwik rules
- Prettier for formatting
- JSDoc comments for public APIs
- Consistent file naming conventions

## API overview - Qwik

### Component Creation

- `component$(renderFn: (props: Props) => JSXOutput): Component`
  - Wraps a function component for Qwik's reactivity and lazy-loading.
  - Example:

    ```ts
    import { component$ } from '@builder.io/qwik';
    export const Hello = component$(({name}: { name: string }) => <div>Hello {name}</div>);
    ```

- `<Slot />` or `<Slot name="..." />`
  - Placeholder for the children passed to a component.
  - Example:

    ```ts
    import { component$, Slot } from '@builder.io/qwik';
    export default component$(() => (
      <div>
        <Slot />
      </div>
    ));
    ```

- `<Resource onResolve={...} onReject={...} onPending={...} />`
  - Renders a resource from `useResource$()`.
  - Example:

    ```ts
    import { component$, useResource$, Resource } from '@builder.io/qwik';
    export default component$(() => {
      const user = useResource$(async () => fetch('/api/user').then(r => r.json()));
      return <Resource value={user} onResolve={u => <div>{u.name}</div>} onPending={() => <div>Loading...</div>} onReject={e => <div>Error</div>} />;
    });
    ```

---

### Props Utility

- To extract the props type from a Qwik component:

  ```ts
  import type { PropsOf } from "@builder.io/qwik";
  type MyProps = PropsOf<typeof MyComponent>;
  ```

- To extract the props for an HTML tag:

  ```ts
  import type { Props } from "@builder.io/qwik";
  type ButtonProps = Props<"button">;
  ```

---

### Reactivity & State

- `useSignal<T>(initialValue: T): Signal<T>`
  - Example:

    ```ts
    import { component$, useSignal } from '@builder.io/qwik';
    export default component$(() => {
      const count = useSignal(0);
      return <button onClick$={() => count.value++}>{count.value}</button>;
    });
    ```

- `useStore<T extends object>(initialState: T, options?): T`
  - Example:

    ```ts
    import { component$, useStore } from '@builder.io/qwik';
    export default component$(() => {
      const state = useStore(() => ({ count: 0 }));
      return <button onClick$={() => state.count++}>{state.count}</button>;
    });
    ```

- `useComputed$<T>(compute: () => T): ReadonlySignal<T>`
  - Example:

    ```ts
    import { component$, useSignal, useComputed$ } from '@builder.io/qwik';
    export default component$(() => {
      const a = useSignal(1);
      const b = useSignal(2);
      const sum = useComputed$(() => a.value + b.value);
      return <div>{sum.value}</div>;
    });
    ```

- `useResource$<T>(resourceFn: ResourceFn<T>, options?): ResourceReturn<T>`
  - Example: (see `<Resource />` above)

---

### Lifecycle & Effects

- `useTask$(taskFn: TaskFn, options?): void`
  - Example:

    ```ts
    import { component$, useSignal, useTask$ } from '@builder.io/qwik';
    export default component$(() => {
      const count = useSignal(0);
      useTask$(({ track }) => {
        track(() => count.value);
        console.log('Count changed:', count.value);
      });
      return <button onClick$={() => count.value++}>{count.value}</button>;
    });
    ```

- `useErrorBoundary(errorHandler: (error: any) => void): void`
  - Example:

    ```ts
    import { component$, useErrorBoundary } from '@builder.io/qwik';
    export default component$(() => {
      useErrorBoundary((err) => {
        console.error('Caught error:', err);
      });
      throw new Error('Oops!');
      return <div>Should not render</div>;
    });
    ```

---

### Context

- `createContextId<T>(name?): ContextId<T>`
- `useContextProvider<T>(context: ContextId<T>, value: T): void`
- `useContext<T>(context: ContextId<T>): T`
  - Example:

    ```ts
    import { component$, createContextId, useContextProvider, useContext } from '@builder.io/qwik';
    const MyContext = createContextId<number>('my-context');
    export const Provider = component$(() => {
      useContextProvider(MyContext, 42);
      return <Child />;
    });
    export const Child = component$(() => {
      const value = useContext(MyContext);
      return <div>{value}</div>;
    });
    ```

---

### Qwik City: Middleware & Plugins

- **Middleware Example:**

  ```ts
  // src/routes/plugin@auth.ts
  import type { RequestHandler } from "@builder.io/qwik-city";
  export const onRequest: RequestHandler = ({ next, abort }) => {
    // Custom auth logic
    if (!isAuthenticated()) {
      abort(401, "Unauthorized");
    } else {
      next();
    }
  };
  ```

- **Plugin Example:**

  ```ts
  // src/routes/plugin@myplugin.ts
  import type { RequestHandler } from "@builder.io/qwik-city";
  export const onRequest: RequestHandler = ({ next }) => {
    // Plugin logic here
    next();
  };
  ```

  See: [Qwik City Middleware Docs](https://qwik.dev/docs/city/middleware/)

---

### Troubleshooting / FAQ

- **My loader doesn’t run:**
  - Ensure your loader is exported from the route file (e.g., `index.tsx` or `layout.tsx`).
- **My signal/store doesn’t update the UI:**
  - Make sure you use `.value` for signals and mutate stores directly (not by replacing the object).
- **SSR mismatch or hydration error:**
  - Qwik does not hydrate, but if you see mismatches, check for non-deterministic code in your render functions.
- **Event handler not firing:**
  - Use the `$` suffix (e.g., `onClick$`) and ensure the handler is serializable.
- **server$ function not working:**
  - Remember to validate all parameters and variables from upper scopes, as they are provided by the client.

---

### Deprecated APIs

- `ServiceWorkerRegister` is deprecated for most users. Qwik now automatically handles preloading. Only use if you have custom service worker logic. See: [Qwik Service Worker Guide](https://qwik.dev/docs/city/service-worker/)

---

## API overview - Qwik City Runtime

### Core Components

- `QwikCityProvider(props: QwikCityProps): JSX.Element`
  - The root context provider for Qwik City apps. Should wrap your app's `<head>` and `<body>`. Handles routing, navigation, and state.
  - `props.viewTransition?: boolean` — Enable the ViewTransition API (default: `true`).

- `QwikCityMockProvider(props: QwikCityMockProps): JSX.Element`
  - Used for testing and storybook. Mocks routing context.
  - `props.url?: string` — The current URL.
  - `props.params?: Record<string, string>` — Route params.
  - `props.goto?: RouteNavigate` — Custom navigation handler.

- `RouterOutlet(): JSX.Element`
  - Renders the current route's component tree.

- `Link(props: LinkProps): JSX.Element`
  - Navigation link component with SPA support and prefetching.
  - `props.href: string` — Destination URL.
  - `props.prefetch?: boolean | 'js'` — Prefetch route data or JS.
  - `props.reload?: boolean` — Force full page reload.
  - `props.replaceState?: boolean` — Use `history.replaceState` instead of `pushState`.
  - `props.scroll?: boolean` — Control scroll behavior.

- `head(props: HeadProps): JSX.Element`
  - Declares the document head for the current route.
  - `title?: string` — The title of the page.
  - `meta?: Meta[]` — The meta tags for the page.
  - `links?: Link[]` — The link tags for the page.
  - `styles?: string[]` — The styles for the page.
  - `scripts?: string[]` — The scripts for the page.
  - `frontmatter?: Record<string, any>` — The frontmatter for the page.

  - Example:

    ```ts
    import type { DocumentHead } from "@builder.io/qwik-city";
    import { db } from "~/server/db";
    export const getCanonicalUrl = routeLoader$(({ url }) =>
      db.canonicalUrlFor(url.pathname),
    );
    export const head: DocumentHead = ({ resolveValue }) => {
      return {
        title: "My Page",
        meta: [{ name: "description", content: "My Page Description" }],
        links: [{ rel: "canonical", href: resolveValue(getCanonicalUrl) }],
      };
    };
    ```

---

### Routing & Data

- `routeLoader$(loaderFn, ...validators): Loader<T>`
  - Declares a data loader for a route. Runs on server and client navigation.
  - `loaderFn(event: RequestEventLoader): T | Promise<T>`
  - The data can be accessed in `head()` with the `resolveValue()` helper, and in the component by calling the returned `Loader`.
  - The resulting `Loader` _must_ be exported from the route that it should run in.

- `routeAction$(actionFn, ...validators): Action<T>`
  - Declares a form action handler for a route, that also works when JavaScript is disabled.
  - `actionFn(event: RequestEventAction): T | Promise<T>`
  - Returns a function to access the action state.

- `server$(fn, options?): ServerQRL<T>`
  - Declares a server-only function callable from the client.
  - `fn(event: RequestEventBase, ...args): any`
  - Returns a QRL-wrapped server function.
  - Important: Parameters and variables from upper scopes are automatically serialized and deserialized. This means that they are provided by the calling client, and they should be verified before use.
  - Example:

    ```ts
    import { server$ } from "@builder.io/qwik-city";
    const getSecret = server$(async (user: string) => {
      if (typeof user !== "string" || !/^[a-z0-9]{3,10}$/.test(user)) {
        throw new Error("Invalid user");
      }
      return await db.users.get(user);
    });
    ```

---

### Hooks

- `useLocation(): RouteLocation`
  - Returns the current route location, params, and navigation state.

- `useNavigate(): RouteNavigate`
  - Returns a function to programmatically navigate to a new route.

- `useContent(): ContentState`
  - Returns the current route's content metadata (headings, menu).

- `useDocumentHead<FrontMatter>(): ResolvedDocumentHead<FrontMatter>`
  - Returns the resolved document head for the current route.

- `usePreventNavigate$(callback: PreventNavigateCallback): void`
  - Registers a callback to prevent or intercept navigation (SPA or browser).

---

### Types

- `QwikCityProps`
  - Props for `QwikCityProvider`. `{ viewTransition?: boolean }`

- `QwikCityMockProps`
  - Props for `QwikCityMockProvider`. `{ url?: string, params?: Record<string, string>, goto?: RouteNavigate }`

- `RouteLocation`
  - `{ url: URL, params: Record<string, string>, isNavigating: boolean, prevUrl?: URL }`

- `RouteNavigate`
  - QRL function for navigation: `(path?: string | number | URL, options?: { type?: string, forceReload?: boolean, replaceState?: boolean, scroll?: boolean } | boolean) => Promise<void>`

- `ContentState`
  - `{ headings?: ContentHeading[], menu?: ContentMenu }`

- `ResolvedDocumentHead<FrontMatter>`
  - The resolved document head object for the current route.

### Further Reading & Resources

- [Qwik Official Documentation](https://qwik.dev/docs/)
- [Qwik City Routing](https://qwik.dev/docs/city/routing/)
- [Qwik City Middleware](https://qwik.dev/docs/city/middleware/)
- [Qwik Signals & Reactivity](https://qwik.dev/docs/components/state/)
- [Qwik Error Boundaries](https://qwik.dev/docs/components/error-boundaries/)
- [Qwik Testing](https://qwik.dev/docs/testing/)
- [Qwik GitHub Repository](https://github.com/QwikDev/qwik)
