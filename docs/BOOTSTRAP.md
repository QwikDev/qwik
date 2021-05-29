[![hackmd-github-sync-badge](https://hackmd.io/gSlQBtwzTkO6hWgw93wSmg/badge)](https://hackmd.io/gSlQBtwzTkO6hWgw93wSmg)

# Bootstrapping Qwik

Qwik is designed to have the smallest amount of code which needs to be run on the client to bootstrap the application. The size of bootstrap code has direct impact on application [time to interactive](https://web.dev/interactive/).

The bootstrapping code is known as `qwikloader` and is tiny (around 500 bytes minified.) and can bootstrap in under one millisecond. The purpose of `qwikloader` is to set up global browser event listeners for your application, such as `click` event. If an event fires, the `qwikloader` looks for a corresponding `on:click` attribute which contains a [QRL](./QRL.md). The QRL tells `qwikloader` from where the event handler for the `click` event should be downloaded.

## Bootstrapping

To bootstrap a Qwik application one needs to insert this into the page:

```html
<script src="/qwikloader.min.js" async events="click;dblclick;keyup"></script>
```

- `src`: points to the location where the `qwikloader.js` can be found.
- `async`: Tells the browser that it is not necessary to wait for the `qwikloader` to load and execute before continuing to parse the HTML. The application will work without this, but adding `async` will slightly improve the startup time.
- `events`: An optional list of events which the `qwikloader` should listen too. If the list is not provided the `qwikloader` will listen to all of the browser events. While this may be convenient, it will result in longer bootstrap times. Listing the events is strongly preferred.
