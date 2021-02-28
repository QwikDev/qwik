# Hello World example with static file serving

This example shows a trivial greeter application that does not have a server-side pre-rendering.

## Running

1. First, start the server

   ```
   bazel run integration:server
   ```

2. Open the browser http://localhost:8080/hello_static

## Tour

1. Start the tour by examining [`index.html`](./index.html).
2. **Notice**: Bootstrap `<script src="/qootloader.js"></script>` (This is about ~500 bytes after minification, but before compression.)
3. **Notice**: `on:click` attribute present on the button: `<button on:click="./greet.click">Say hello</button>`. The value side of `on:click` points to [QRL](../../client/import#QRL) (Qoot Resource Locator, a play on words from URL and a way to distinguish it fro regular URL). The QRL points to a lazy loaded resource [`greet.ts`](./greet.ts), and a `click` exported function.
4. **Notice**: Also notice `on:keyup` attribute on `<input>` element.

## Runtime

1. Static file [`index.html`](./index.html) gets served to the browser.
1. Browser loads [`qootloader.js`](../../client/qootloader.ts).
1. [`qootloader.js`](../../client/qootloader.ts) examines the browser and enumerates all possible events which the browser can fire. For each event [`qootloader.js`](../../client/qootloader.ts) sets up a listener for that event.

At this point, the application is fully bootstrapped, and the user can interact with it. No more work will be performed by the browser until user interactions. For the next steps, open the browser developer tools to the networking tab to see how more code is loaded on an as-needed basis.

1. User clicks on `<button on:click="./greet.click">Say hello</button>`. The [`qootloader.js`](../../client/qootloader.ts) reads `./greet.click` and performs `(await import('./greet.js')).click(...)`. Notice that it extracts the resource URL and symbol name to execute from the [QRL](../../client/import#QRL). Also, notice that the browser lazy loads the necessary code on user interaction. NOTE: This example is missing bundling for simplicity, so the browser has to fetch a lot of small files; this would not be the case in production.
1. `export function click` in [`greet.ts`](./greet.ts) performs the necessary operation. NOTE: this example is intentionally kept simple, so the click handler has to perform all of the DOM operations manually. In later examples, a more elegant way of processing the events is introduced.
