# Hello World example with SSR (server-side pre-rendering)

This example shows a trivial greeter application with server-side pre-rendering.

## Running

1. First, start the server

   ```
   bazel run integration:server
   ```

2. Open the browser http://localhost:8080/hello_server

## Tour

1. The application gets kicked off by navigating to http://localhost:8080/hello_server and the browser sending a `GET` request.
1. `GET` request is received by [`server/main.ts`](../../server/main.ts), which performs basic book-keeping and forwards the request to [`server_index.tsx`](./server_index.tsx). NOTE: The example uses JSX, but the system is designed to accept other rendering technologies.
1. [`server/main.ts`](../../server/main.ts`) builds up basic HTML structure in JSX. The interesting bit is the [`<Greeter>`](./Greeter.ts) component. See [Component](../../client/component) discussion about how components work.
   - In Qwik, the components are broken into public [`<Greeter>`](./Greeter.ts) part and private implementation. It is important that the only connection between the public [`<Greeter>`](./Greeter.ts) and the private implementation is through [QRL](../../client/import#QRL). The QRL allows components to hydrate and execute independently of each other.
1. [`server/main.ts`](../../server/main.ts`) renders [`<Greeter>`](./Greeter.ts) which in turn renders as `<greeter decl:template="./Greeter_template">`. At this point the rendering finishes because there are no symbolic connections between the `<greeter>` and its implementation. This is done intentionally so that the parent component can rehydrate/re-render without the child component being forced as well.
1. The rendering system notices that `<greet>` is a component because it has `decl:template="./Greeter_template"` [QRL](../../client/import#QRL). The rendering system notices that the `GreeterProps` have changed (initial rendering) which in turn invalidates the `Greeter` component. This invalidation causes the rendering system to render the component. First step is to load [`Greeter_template`](./Greeter_template.tsx) and execute it.
1. The `Greeter` component is created and initialized from the `GreeterProps`. The component is then used to create JSX, which is then rendered.
1. Once all of the rendering is complete all of the components' state is serialized into the DOM through [`serializeState()`](../../client/render/serialize_state.ts). The result is that the component state is written into the `:.` property: `<greeter name="World" decl:template="./Greeter_template" :.='{"name":"World"}'>`.
1. Server serializes the DOM into HTML and sends it to the client.

At this point, the browser renders the page and waits for user interaction.

1. User edits the `<input>` which causes `keyup` event to be emitted by the browser which is intercepted by [`qwikloader.js`](../../client/qwikloader.ts) because of `on:keyup` attribute in `<input value="World" on:keyup="./Greeter_onKeyup#?name=.target.value">`.
1. [`./Greeter_onKeyup`](./Greeter_onKeyup.ts) is loaded and executed.
   ```
   export default injectEventHandler(
     GreeterComponent,
     provideQrlExp('value'),
     function (this: GreeterComponent, value: string) {
       this.$state.name = value;
       markDirty(this);
     }
   );
   ```
1. Injection asks for the `GreetComponent`, which causes the deserialization of component state from the HTML.
1. Injection ask for `provideQrlExp('value')` value. Notice that the `on:keyup="./Greeter_onKeyup#?name=.target.value"` contains `?value=.target.value` which tells the system that property `.target.value` should be evaluated from the `Event` object. This returns the current value of the `<input>`.
1. The function then assigns the new value to the current component state.
1. Finally, the component invalidates itself, which marks it available for re-rendering.
   1. [`markDirty()`](../../client/render/jsx/mark_dirty.ts) adds listener attribute to the component like so: `<greeter on:.render="./Greeter_template">`.
   1. [`markDirty()`](../../client/render/jsx/mark_dirty.ts) also schedules `requestAnimationFrame` callback to process re-rendering. The callback looks for all elements which have `on:.render` listener and asks them to re-render.
   1. Finally, the `on:.render` callback is removed.
