# @qwik.dev/core

## 2.0.0-alpha.10

### Patch Changes

- 🐞🩹 infinity loop while tracking element ref (by [@Varixo](https://github.com/Varixo) in [#7574](https://github.com/QwikDev/qwik/pull/7574))

- 🐞🩹 add HTMLElementAttrs and SVGProps types to exports (by [@JerryWu1234](https://github.com/JerryWu1234) in [#7510](https://github.com/QwikDev/qwik/pull/7510))

- 🐞🩹 Introduce retry logic for QRL resolution to handle potential promise retries, ensuring robustness in asynchronous operations. (by [@JerryWu1234](https://github.com/JerryWu1234) in [#7470](https://github.com/QwikDev/qwik/pull/7470))

- 🐞🩹 signal wrapper should not rerender causing missing child error (by [@Varixo](https://github.com/Varixo) in [#7550](https://github.com/QwikDev/qwik/pull/7550))

- 🐞🩹 inflating text nodes from single shared text node (by [@Varixo](https://github.com/Varixo) in [#7538](https://github.com/QwikDev/qwik/pull/7538))

## 2.0.0-alpha.9

### Minor Changes

- ✨ `useSerializer# @qwik.dev/core, `createSerializer# @qwik.dev/core: Create a Signal holding a custom serializable value. See {@link useSerializer$} for more details. (by [@wmertens](https://github.com/wmertens) in [#7223](https://github.com/QwikDev/qwik/pull/7223))

  `NoSerializeSymbol`: objects that have this symbol will not be serialized.

  `SerializerSymbol`: When defined on an object, this function will get called with the object and is expected to returned a serializable object literal representing this object. Use this to remove data cached data, consolidate things, integrate with other libraries, etc.

### Patch Changes

- 🐞🩹 don't wrap template literals with a function call inside them in a signal (by [@Varixo](https://github.com/Varixo) in [#7390](https://github.com/QwikDev/qwik/pull/7390))

- 🐞🩹 creating error overlay (by [@Varixo](https://github.com/Varixo) in [#7446](https://github.com/QwikDev/qwik/pull/7446))

- 🐞🩹 reexecute component with null key (by [@Varixo](https://github.com/Varixo) in [#7456](https://github.com/QwikDev/qwik/pull/7456))

- 🐞🩹 correctly handle initial resource state (by [@Varixo](https://github.com/Varixo) in [#7469](https://github.com/QwikDev/qwik/pull/7469))

- 🐞🩹 change client side generated ID to start with build base and add convert first character to letter if it is starting from number (by [@Varixo](https://github.com/Varixo) in [#7432](https://github.com/QwikDev/qwik/pull/7432))

- 🐞🩹 custom event names and DOMContentLoaded handling (by [@Varixo](https://github.com/Varixo) in [#7452](https://github.com/QwikDev/qwik/pull/7452))

- 🐞🩹 attribute diffing was not working correctly in some edge cases (by [@Varixo](https://github.com/Varixo) in [#7419](https://github.com/QwikDev/qwik/pull/7419))

- 🐞🩹 rendering markdown file with Qwik component (by [@Varixo](https://github.com/Varixo) in [#7456](https://github.com/QwikDev/qwik/pull/7456))

- 🐞🩹 finding vnodes on interaction (by [@Varixo](https://github.com/Varixo) in [#7410](https://github.com/QwikDev/qwik/pull/7410))

- 🐞🩹 don't execute QRLs for elements marked as deleted (by [@Varixo](https://github.com/Varixo) in [#7448](https://github.com/QwikDev/qwik/pull/7448))

- 🐞🩹 inserting new node edge case (by [@Varixo](https://github.com/Varixo) in [#7446](https://github.com/QwikDev/qwik/pull/7446))

- 🐞🩹 removing text node from shared text node (by [@Varixo](https://github.com/Varixo) in [#7430](https://github.com/QwikDev/qwik/pull/7430))

## 2.0.0-alpha.8

### Patch Changes

- 🐞🩹 don't escape value attribute (by [@Varixo](https://github.com/Varixo) in [#7369](https://github.com/QwikDev/qwik/pull/7369))

- 🐞🩹 prevent infinity loop by inserting the same projection before itself (by [@Varixo](https://github.com/Varixo) in [#7350](https://github.com/QwikDev/qwik/pull/7350))

- 🐞🩹 replace inline component with component$ with the same key (by [@Varixo](https://github.com/Varixo) in [#7365](https://github.com/QwikDev/qwik/pull/7365))

- 🐞🩹 undefined or null as projection child (by [@Varixo](https://github.com/Varixo) in [#7376](https://github.com/QwikDev/qwik/pull/7376))

- 🐞🩹 infinity serialization loop (by [@Varixo](https://github.com/Varixo) in [#7368](https://github.com/QwikDev/qwik/pull/7368))

- 🐞🩹 prevent reusing projection if is marked as deleted (by [@Varixo](https://github.com/Varixo) in [#7350](https://github.com/QwikDev/qwik/pull/7350))

- 🐞🩹 tracking whole store (by [@Varixo](https://github.com/Varixo) in [#7367](https://github.com/QwikDev/qwik/pull/7367))

## 2.0.0-alpha.7

### Patch Changes

- 🐞🩹 rendering attribute value from array of classes from spread props (by [@Varixo](https://github.com/Varixo) in [#7310](https://github.com/QwikDev/qwik/pull/7310))

- 🐞🩹 null or undefined as ref attribute value (by [@Varixo](https://github.com/Varixo) in [#7285](https://github.com/QwikDev/qwik/pull/7285))

- 🐞🩹 QRLs are now scheduled instead of directly executed by qwik-loader, so that they are executed in the right order. (by [@wmertens](https://github.com/wmertens) in [#7269](https://github.com/QwikDev/qwik/pull/7269))

- 🐞🩹 different component rendering with the same key (by [@Varixo](https://github.com/Varixo) in [#7292](https://github.com/QwikDev/qwik/pull/7292))

- 🐞🩹 export SVG type from qwik/core (by [@JerryWu1234](https://github.com/JerryWu1234) in [#7222](https://github.com/QwikDev/qwik/pull/7222))

- 🐞🩹 optimizer is now better at recognizing constProp (by [@JerryWu1234](https://github.com/JerryWu1234) in [#7316](https://github.com/QwikDev/qwik/pull/7316))

- 🐞🩹 create svg nested children with correct namespace (by [@Varixo](https://github.com/Varixo) in [#7323](https://github.com/QwikDev/qwik/pull/7323))

- 🐞🩹 the use hook didn't work when type is Slot. (by [@JerryWu1234](https://github.com/JerryWu1234) in [#7250](https://github.com/QwikDev/qwik/pull/7250))

- 🛠 replace the `_hW` export in segments with a shared export `_task` in core. This opens up using QRLs from core. (by [@wmertens](https://github.com/wmertens) in [#7269](https://github.com/QwikDev/qwik/pull/7269))

- ✨ emit "qrender" event after every render (by [@Varixo](https://github.com/Varixo) in [#7327](https://github.com/QwikDev/qwik/pull/7327))

- 🐞🩹 vNode serialization error on server$ (by [@damianpumar](https://github.com/damianpumar) in [#7278](https://github.com/QwikDev/qwik/pull/7278))

- 🐞🩹 don't wrap and serialize functions that are attribute values (by [@Varixo](https://github.com/Varixo) in [#7284](https://github.com/QwikDev/qwik/pull/7284))

- ✨ updated scoped styles prefix to ⚡️ (by [@sreeisalso](https://github.com/sreeisalso) in [#7304](https://github.com/QwikDev/qwik/pull/7304))

  # Scoped styles prefix update

  We've updated the `ComponentStylesPrefixContent` from the star symbol (⭐️) to the lightning bolt symbol (⚡️). This prefix is used internally to generate unique CSS class names for components, helping to prevent style collisions.

  **Potential Compatibility Issue (Rare):**

  While this change is expected to be seamless for the vast majority of users, there's a _very small_ possibility of a conflict if your application _directly relies_ on the star symbol (⭐️) for CSS overriding. Specifically, if you're using CSS selectors that include the _literal_ star character (⭐️) as part of a class name (e.g., `.⭐️ComponentName { ... }`), your styles require need to be changed manually to work as expected after this update.

  ## How to check if you're affected

  **Search your codebase:** Look for any instances where the star symbol (⭐️) is used as part of a CSS class name or selector.

  ## How to fix it if you're affected

  If you find that you are indeed relying on the star symbol (⭐️), you'll need to update your CSS selectors to use the new lightning bolt symbol (⚡️). For example, change `.⭐️ComponentName { ... }` to `.⚡️ComponentName { ... }`.

  ```css
  /* Example of old, potentially problematic CSS */
  .⭐️MyComponent {
    /* ... old styles ... */
  }

  /* Example of updated, correct CSS */
  .⚡️MyComponent {
    /* ... updated styles ... */
  }
  ```

- Expose missing types into `public.d.ts` and fix types uri for internal export inside `package.json` (by [@GrandSchtroumpf](https://github.com/GrandSchtroumpf) in [#7289](https://github.com/QwikDev/qwik/pull/7289))

## 2.0.0-alpha.6

### Patch Changes

- 🐞🩹 component props as var props (by [@Varixo](https://github.com/Varixo) in [#7265](https://github.com/QwikDev/qwik/pull/7265))

- 🐞🩹 input's value is string when passing number (by [@JerryWu1234](https://github.com/JerryWu1234) in [#7182](https://github.com/QwikDev/qwik/pull/7182))

- ✨ log a warning instead of throwing an error for server host mismatch error (by [@Varixo](https://github.com/Varixo) in [#7236](https://github.com/QwikDev/qwik/pull/7236))

- 🐞🩹 retry vnode diffing on promise throw (by [@Varixo](https://github.com/Varixo) in [#7259](https://github.com/QwikDev/qwik/pull/7259))

- 🐞🩹 convert destructured array's props to signal (by [@Varixo](https://github.com/Varixo) in [#7217](https://github.com/QwikDev/qwik/pull/7217))

## 2.0.0-alpha.5

### Patch Changes

- 🐞🩹 Resource without onPending callback (by [@gimonaa](https://github.com/gimonaa) in [#7085](https://github.com/QwikDev/qwik/pull/7085))

- 🐞🩹 updating signal-based props (by [@Varixo](https://github.com/Varixo) in [#7198](https://github.com/QwikDev/qwik/pull/7198))

- 🐞🩹 store effects cleanup (by [@Varixo](https://github.com/Varixo) in [#7228](https://github.com/QwikDev/qwik/pull/7228))

- 🐞🩹 projection siblings serialization (by [@Varixo](https://github.com/Varixo) in [#7228](https://github.com/QwikDev/qwik/pull/7228))

- 🐞🩹 moving existing virtual node during vnode diffing (by [@Varixo](https://github.com/Varixo) in [#7208](https://github.com/QwikDev/qwik/pull/7208))

- 🐞🩹 convert destructured string prop to props variable (by [@Varixo](https://github.com/Varixo) in [#7191](https://github.com/QwikDev/qwik/pull/7191))

- 🐞🩹 finding context parent and sorting projections in the scheduler (by [@Varixo](https://github.com/Varixo) in [#7204](https://github.com/QwikDev/qwik/pull/7204))

- 🐞🩹 find correct context after rendering empty array (by [@Varixo](https://github.com/Varixo) in [#7234](https://github.com/QwikDev/qwik/pull/7234))

- 🐞🩹 textarea with null value (by [@Varixo](https://github.com/Varixo) in [#7196](https://github.com/QwikDev/qwik/pull/7196))

- 🐞🩹 event handlers in loops (by [@gimonaa](https://github.com/gimonaa) in [#7085](https://github.com/QwikDev/qwik/pull/7085))

- 🐞🩹 destructured props for inline components (by [@Varixo](https://github.com/Varixo) in [#7190](https://github.com/QwikDev/qwik/pull/7190))

- 🐞🩹 serialize var prop (by [@Varixo](https://github.com/Varixo) in [#7193](https://github.com/QwikDev/qwik/pull/7193))

## 2.0.0-alpha.4

### Patch Changes

- 🐞🩹 encode the `q:subs` property (by [@Varixo](https://github.com/Varixo) in [#7088](https://github.com/QwikDev/qwik/pull/7088))

- ✨ move signal invalidation to the scheduler (by [@Varixo](https://github.com/Varixo) in [#7088](https://github.com/QwikDev/qwik/pull/7088))

- ✨ better node attributes serialization (by [@Varixo](https://github.com/Varixo) in [#7088](https://github.com/QwikDev/qwik/pull/7088))

- 🐞🩹 serialize virtual props for DOM elements (by [@Varixo](https://github.com/Varixo) in [#7088](https://github.com/QwikDev/qwik/pull/7088))

## 2.0.0-alpha.3

### Patch Changes

- 🐞🩹 prevent multiple store deserialization (by [@Varixo](https://github.com/Varixo) in [#7155](https://github.com/QwikDev/qwik/pull/7155))

- 🐞🩹 using ref inside useContext (by [@Varixo](https://github.com/Varixo) in [#7132](https://github.com/QwikDev/qwik/pull/7132))

- 🐞🩹 types error when migrating to V2 with `moduleResulution: "node"` (by [@shairez](https://github.com/shairez) in [#7159](https://github.com/QwikDev/qwik/pull/7159))

- 🐞🩹 replacing projection content with null or undefined (by [@Varixo](https://github.com/Varixo) in [#7148](https://github.com/QwikDev/qwik/pull/7148))

## 2.0.0-alpha.2

### Patch Changes

- 🐞🩹 serialization of an array of refs (by [@Varixo](https://github.com/Varixo) in [#7106](https://github.com/QwikDev/qwik/pull/7106))

- 🛠 more descriptive HTML streaming error message (by [@Varixo](https://github.com/Varixo) in [#7105](https://github.com/QwikDev/qwik/pull/7105))

## 2.0.0-alpha.1

### Patch Changes

- 🐞🩹 reduced number of errors "Cannot serialize function" during serialization (by [@Varixo](https://github.com/Varixo) in [#7066](https://github.com/QwikDev/qwik/pull/7066))

## 2.0.0-alpha.0

### Major Changes

- BREAKING: remove HTML-related types. Use PropsOf instead. (by [@wmertens](https://github.com/wmertens) in [#7045](https://github.com/QwikDev/qwik/pull/7045))

- 💥**BREAKING**: `useComputed` no longer allows Promise returns. (meaning it is strictly sync) Instead, use `useSignal` and `useTask` together to perform async signal updates (by [@wmertens](https://github.com/wmertens) in [#6907](https://github.com/QwikDev/qwik/pull/6907))

- `qwik-labs` package has been removed in favor of experimental features. (by [@shairez](https://github.com/shairez) in [#7025](https://github.com/QwikDev/qwik/pull/7025))
  So the "Insights" vite plugin and components have been moved to core as an experimental feature.

  In order to use it, you need to -

  **1)** add `insights` to the experimental array in `vite.config.ts`:

  ```ts
  qwikVite({
    experimental: ['insights']
  }),
  ```

  **2)** Import and use the `qwikInsights` vite plugin from `@qwik.dev/core/insights/vite`:

  ```ts
  import { qwikInsights } from '@qwik.dev/core/insights/vite';
  ```

  **3)** import the `<Insights>` component from `@qwik.dev/core/insights` and use it in your `root.tsx` file: :

  ```tsx title="root.tsx"
  import { Insights } from '@qwik.dev/core/insights';

  // ...rest of root.tsx file

  return (
    <Insights publicApiKey="..." postUrl="..." />
    /* ...qwik app */
  );
  ```

- BREAKING: the Typescript exports were trimmed down to the bare minimum. If there are types you are missing, open an issue. (by [@wmertens](https://github.com/wmertens) in [#7045](https://github.com/QwikDev/qwik/pull/7045))

### Minor Changes

- ✨ new integration tests that are running with the optimizer (by [@Varixo](https://github.com/Varixo) in [#7055](https://github.com/QwikDev/qwik/pull/7055))

- ✨ new simpler signals implementation with lazy useComputed$ execution, only when is needed (by [@Varixo](https://github.com/Varixo) in [#7055](https://github.com/QwikDev/qwik/pull/7055))

- ✨ added the scheduler to sort chores execution and have more predictable behavior (by [@Varixo](https://github.com/Varixo) in [#7055](https://github.com/QwikDev/qwik/pull/7055))

- ✨ new faster serialization system (by [@Varixo](https://github.com/Varixo) in [#7055](https://github.com/QwikDev/qwik/pull/7055))

- ✨ new CSR and SSR rendering written from scratch to speed up performance, improve code readability, and make the code easier to understand for new contributors (by [@Varixo](https://github.com/Varixo) in [#7055](https://github.com/QwikDev/qwik/pull/7055))

### Patch Changes

- 🐞🩹 do not trigger effects if computed value is not changed (by [@Varixo](https://github.com/Varixo) in [#6996](https://github.com/QwikDev/qwik/pull/6996))

## 1.9.1

### Patch Changes

- ✨ showing qrl parent names. (by [@wmertens](https://github.com/wmertens) in [#6881](https://github.com/QwikDev/qwik/pull/6881))
  in dev mode, qrl segments now start with their parent filename so it's easy to see where they came from. Furthermore, in production builds these filenames are also used so that origins in `q-manifest.json` are easy to understand.

- 🐞🩹 Optimizer now ignores unknown deps in graph that caused crashes during build (by [@wmertens](https://github.com/wmertens) in [#6888](https://github.com/QwikDev/qwik/pull/6888))

- 🐞🩹 Do not allow object methods to be serialized with style prop (by [@jakovljevic-mladen](https://github.com/jakovljevic-mladen) in [#6932](https://github.com/QwikDev/qwik/pull/6932))

- 🐞🩹 In dev mode, changes to QRLs now explicitly invalidate the segment so that the browser will reload it (by [@wmertens](https://github.com/wmertens) in [#6938](https://github.com/QwikDev/qwik/pull/6938))

## 1.11.0

### Minor Changes

- CHORE: Prepare backwards compatibility for V1 libraries in V2. (by [@wmertens](https://github.com/wmertens) in [#7044](https://github.com/QwikDev/qwik/pull/7044))

  We move internal fields `immutableProps` and `flags` out of JSXNode as they are not meant for public use.

  This will allow projects using older V1 libraries to continue to work with the Qwik V2 by adding the following `package.json` changes:

  ```json
  {
    "dependencies": {
      "@builder.io/qwik": "^1.11.0",
      "@qwik.dev/core": "^2.0.0"
    }
  }
  ```

  And will prevent typescript errors when using libraries which haven't upgraded to V2 yet.

- ✨ add monorepo support to the `qwik add` command by adding a `projectDir` param (by [@shairez](https://github.com/shairez) in [#7059](https://github.com/QwikDev/qwik/pull/7059))

  That way you can run `qwik add --projectDir=packages/my-package` and it will add the feature to the specified project/package (sub) folder, instead of the root folder.

## 1.13.0

### Minor Changes

- The `useTask# @builder.io/qwik function's `eagerness` option is deprecated and will be removed in version 2. (by [@sreeisalso](https://github.com/sreeisalso) in [#7345](https://github.com/QwikDev/qwik/pull/7345))

### Patch Changes

- 🐞🩹 Error boundary `ErrorBoundary` and fix `useErrorBoundary` (by [@damianpumar](https://github.com/damianpumar) in [#7342](https://github.com/QwikDev/qwik/pull/7342))

- 🐞 🩹 The qwik-city ServiceWorkerRegister and qwik PrefetchServiceWorker now prefetch all their qrls to prevent under-prefetching (by [@maiieul](https://github.com/maiieul) in [#7417](https://github.com/QwikDev/qwik/pull/7417))

- 🐞🩹 When csr is true, it causes a crash because resolve cannot be null as the second parameter (by [@JerryWu1234](https://github.com/JerryWu1234) in [#7420](https://github.com/QwikDev/qwik/pull/7420))

- updated drizzle to latest version (by [@sreeisalso](https://github.com/sreeisalso) in [#7288](https://github.com/QwikDev/qwik/pull/7288))

- 🐞 fix(rollup): improve manualChunks logic to minimize over-prefetching (by [@maiieul](https://github.com/maiieul) in [#7362](https://github.com/QwikDev/qwik/pull/7362))

- ✨ Add the ability to see chunks names in preview/production environments to facilitate debugging of production-only bugs (by [@maiieul](https://github.com/maiieul) in [#7293](https://github.com/QwikDev/qwik/pull/7293))

- Emit an CustomEvent `qviewTransition` when view transition starts. (by [@GrandSchtroumpf](https://github.com/GrandSchtroumpf) in [#7237](https://github.com/QwikDev/qwik/pull/7237))

- ✨ Ability to keep using tailwind v3 through the cli (by [@maiieul](https://github.com/maiieul) in [#7403](https://github.com/QwikDev/qwik/pull/7403))

- dev server now correctly handles css and js importers, also hmr persistence (by [@thejackshelton](https://github.com/thejackshelton) in [#7389](https://github.com/QwikDev/qwik/pull/7389))

- 🐞🩹 set default value of lint to false to improve the execution performance (by [@JerryWu1234](https://github.com/JerryWu1234) in [#7425](https://github.com/QwikDev/qwik/pull/7425))

- 🐞🩹 manual QRL grouping now works again. This is needed for Insights to work. (by [@wmertens](https://github.com/wmertens) in [#7444](https://github.com/QwikDev/qwik/pull/7444))

## 1.12.1

### Patch Changes

- 📃 update turso integration keywords, add contributor (by [@A2-NieR](https://github.com/A2-NieR) in [#7215](https://github.com/QwikDev/qwik/pull/7215))

- ✨ tailwindcss v4 integration (by [@sreeisalso](https://github.com/sreeisalso) in [#7274](https://github.com/QwikDev/qwik/pull/7274))

- 🐞🩹 remove usage of `computedStyleMap` (by [@Varixo](https://github.com/Varixo) in [#7252](https://github.com/QwikDev/qwik/pull/7252))

- 📃 remove shop (by [@gioboa](https://github.com/gioboa) in [#7221](https://github.com/QwikDev/qwik/pull/7221))

- 🐞🩹 error in the middleware occurs 404 (by [@JerryWu1234](https://github.com/JerryWu1234) in [#6951](https://github.com/QwikDev/qwik/pull/6951))

- 🐞🩹 changed turso createClient import to work with file urls, updated docs note with info & link to the corresponding section in the turso docs (by [@A2-NieR](https://github.com/A2-NieR) in [#7211](https://github.com/QwikDev/qwik/pull/7211))

- 📃 add Qwik blog + articles (by [@gioboa](https://github.com/gioboa) in [#7214](https://github.com/QwikDev/qwik/pull/7214))

- 🐞🩹 input's value is string when passing number (by [@JerryWu1234](https://github.com/JerryWu1234) in [#7249](https://github.com/QwikDev/qwik/pull/7249))

## 1.12.0

### Minor Changes

- ✨ The build constants `isDev`, `isBrowser` and `isServer` are now exported from `@builder.io/qwik` directly, so they are more discoverable and easier to add. `@builder.io/qwik/build` still remains. (by [@wmertens](https://github.com/wmertens) in [#7138](https://github.com/QwikDev/qwik/pull/7138))

### Patch Changes

- 🐞🩹 add subscription when doing `"prop" in store` (by [@revintec](https://github.com/revintec) in [#7071](https://github.com/QwikDev/qwik/pull/7071))

- 🐞🩹 `stoppropagation` functionality (by [@shairez](https://github.com/shairez) in [#7102](https://github.com/QwikDev/qwik/pull/7102))

## 1.11.0

### Minor Changes

- CHORE: Prepare backwards compatibility for V1 libraries in V2. (by [@wmertens](https://github.com/wmertens) in [#7044](https://github.com/QwikDev/qwik/pull/7044))

  We move internal fields `immutableProps` and `flags` out of JSXNode as they are not meant for public use.

  This will allow projects using older V1 libraries to continue to work with the Qwik V2 by adding the following `package.json` changes:

  ```json
  {
    "dependencies": {
      "@builder.io/qwik": "^1.11.0",
      "@qwik.dev/core": "^2.0.0"
    }
  }
  ```

  And will prevent typescript errors when using libraries which haven't upgraded to V2 yet.

- ✨ add monorepo support to the `qwik add` command by adding a `projectDir` param (by [@shairez](https://github.com/shairez) in [#7059](https://github.com/QwikDev/qwik/pull/7059))

  That way you can run `qwik add --projectDir=packages/my-package` and it will add the feature to the specified project/package (sub) folder, instead of the root folder.

## 1.10.0

### Minor Changes

- Async functions in `useComputed` are deprecated. (by [@wmertens](https://github.com/wmertens) in [#7013](https://github.com/QwikDev/qwik/pull/7013))

  **Why?**

  - Qwik can't track used signals after the first await, which leads to subtle bugs.
  - When calculating the first time, it will see it's a promise and it will restart the render function.
  - Both `useTask` and `useResource` are available, without these problems.

  In v2, async functions won't work.

  Again, to get the same functionality use `useTask` or `useResource` instead, or this function:

  ```tsx
  export const useAsyncComputed$ = (qrlFn: QRL<() => Promise<any>>) => {
    const sig = useSignal();
    useTask(({ track }) => {
      const result = track(qrlFn);
      if (result && 'then' in result) {
        result.then(
          (val) => (sig.value = val),
          (err) => {
            console.error('async computed function threw!', err);
            throw error;
          }
        );
      } else {
        sig.value = result;
      }
    });
    return sig;
  };
  ```

- ✨ Expose `unwrapStore` as a low level AP (by [@GrandSchtroumpf](https://github.com/GrandSchtroumpf) in [#6960](https://github.com/QwikDev/qwik/pull/6960))

  This enables developers to clone the content of a `useStore()` using `structureClone` or IndexedDB

### Patch Changes

- 📃 fix useResource docs example & remove unused demo (by [@ianlet](https://github.com/ianlet) in [#6893](https://github.com/QwikDev/qwik/pull/6893))

- 🐞🩹 QRL segment filenames are no longer lowercased. This was giving trouble with parent lookups in dev mode and there was no good reason for it. (by [@wmertens](https://github.com/wmertens) in [#7003](https://github.com/QwikDev/qwik/pull/7003))

- 🐞🩹 the type for `<textarea>` now accepts text children, as per spec. (by [@wmertens](https://github.com/wmertens) in [#7016](https://github.com/QwikDev/qwik/pull/7016))

- 🐞🩹 dev-mode QRL paths are now handled by Vite so they are the same as the parent paths. You can see this in the Sources section of the browser devtools, where the segments are now always next to their parents (when the parent is loaded). (by [@wmertens](https://github.com/wmertens) in [#7037](https://github.com/QwikDev/qwik/pull/7037))

- 🐞🩹 `vite` is now a peer dependency of `qwik`, `qwik-city`, `qwik-react` and `qwik-labs`, so that there can be no duplicate imports. This should not have consequences, since all apps also directly depend on `vite`. (by [@wmertens](https://github.com/wmertens) in [#6945](https://github.com/QwikDev/qwik/pull/6945))

- ✨ sync$ QRLs will now be serialized into the HTML in a shorter form (by [@wmertens](https://github.com/wmertens) in [#6944](https://github.com/QwikDev/qwik/pull/6944))

- 🐞🩹 cli build command appearing to "hang" on errors (by [@shairez](https://github.com/shairez) in [#6943](https://github.com/QwikDev/qwik/pull/6943))

- ✨ Allow setting `linkFetchPriority` for modulepreload links in the prefetch strategy. Also fix the links in dev mode (by [@GrandSchtroumpf](https://github.com/GrandSchtroumpf) in [#6947](https://github.com/QwikDev/qwik/pull/6947))

## 1.9.1

### Patch Changes

- ✨ showing qrl parent names. (by [@wmertens](https://github.com/wmertens) in [#6881](https://github.com/QwikDev/qwik/pull/6881))
  in dev mode, qrl segments now start with their parent filename so it's easy to see where they came from. Furthermore, in production builds these filenames are also used so that origins in `q-manifest.json` are easy to understand.

- 🐞🩹 Optimizer now ignores unknown deps in graph that caused crashes during build (by [@wmertens](https://github.com/wmertens) in [#6888](https://github.com/QwikDev/qwik/pull/6888))

- 🐞🩹 Do not allow object methods to be serialized with style prop (by [@jakovljevic-mladen](https://github.com/jakovljevic-mladen) in [#6932](https://github.com/QwikDev/qwik/pull/6932))

- 🐞🩹 In dev mode, changes to QRLs now explicitly invalidate the segment so that the browser will reload it (by [@wmertens](https://github.com/wmertens) in [#6938](https://github.com/QwikDev/qwik/pull/6938))

## 1.9.0

### Patch Changes

- ✨ Introducing the `experimental[]` option to the Vite plugin. This allows you to opt in to features that are not guaranteed to have a stable API. (by [@wmertens](https://github.com/wmertens) in [#6880](https://github.com/QwikDev/qwik/pull/6880))

- 🐞🩹 fix typo in using useStore() (by [@zaynet](https://github.com/zaynet) in [#6875](https://github.com/QwikDev/qwik/pull/6875))

- 🐞🩹 gracefully handle image dimensions service errors (by [@JerryWu1234](https://github.com/JerryWu1234) in [#6855](https://github.com/QwikDev/qwik/pull/6855))

- ✨ Lib builds no longer perform qwik transformation. (by [@wmertens](https://github.com/wmertens) in [#6850](https://github.com/QwikDev/qwik/pull/6850))

  This prevents using unstable internal APIs, and doesn't make a difference for the end user. Library authors are strongly urged to push a new library patch version built with this qwik version, and to add `| ^2.0.0` to their accepted qwik version range.

- 🐞🩹 SSG Link component strips search parameters (by [@JerryWu1234](https://github.com/JerryWu1234) in [#6778](https://github.com/QwikDev/qwik/pull/6778))

- 🐞🩹 The PrefetchServiceWorker now has a more efficient graph and only prefetches direct imports and, at a lower priority, task QRL segments. This greatly improves its load performance. (by [@wmertens](https://github.com/wmertens) in [#6853](https://github.com/QwikDev/qwik/pull/6853))

## 1.8.0

### Minor Changes

- Updated SWC parser means that the optimizer now understands `import ... with` syntax and that enums are replaced with numbers where possible. (by [@wmertens](https://github.com/wmertens) in [#6005](https://github.com/QwikDev/qwik/pull/6005))

- The optimizer plugin will now rely on Rollup to group QRL segments. It will only provide hints on which segments fit well together. The result of this change is that now code splitting happens during the transform phase only, and other Rollup/Vite plugins (such as css-in-js plugins) can transform the code before Qwik transforms it. (by [@wmertens](https://github.com/wmertens) in [#6670](https://github.com/QwikDev/qwik/pull/6670))

- The default asset filenames in the build have changed. Now they are under `assets/hash-name.ext`, so they are clearly separated from code. (by [@wmertens](https://github.com/wmertens) in [#5745](https://github.com/QwikDev/qwik/pull/5745))

### Patch Changes

- The `fileFilter` option to `qwikVite()` now always allows `*.qwik.{m,c,}js` files so that QRLs in libraries can be processed. (by [@wmertens](https://github.com/wmertens) in [#6760](https://github.com/QwikDev/qwik/pull/6760))

## 1.7.3

## 1.7.2

### Patch Changes

- Library builds now correctly generate \_fnSignal calls again. Any Qwik library that exports components should be built again. (by [@wmertens](https://github.com/wmertens) in [#6732](https://github.com/QwikDev/qwik/pull/6732))

- - built files are now under dist/ or lib/. All tools that respect package export maps should just work. (by [@wmertens](https://github.com/wmertens) in [#6715](https://github.com/QwikDev/qwik/pull/6715))
    If you have trouble with Typescript, ensure that you use `moduleResolution: "Bundler"` in your `tsconfig.json`.
  - `@qwik.dev/core` no longer depends on `undici`

- fix dev mode on windows (by [@Varixo](https://github.com/Varixo) in [#6713](https://github.com/QwikDev/qwik/pull/6713))
