# Integration

This folder contains internal e2e integration tests as well as examples of usage of the sub-framework.

## Examples:

- [`hello_static`](./hello_static/): The simplest possible app demonstrating lazy loading (but not server-side rendering.)
- [`hello_server`](./hello_server/): A simple example with server-side rendering demonstrating re-hydration of the application on the client.
- [`todo`](./todo/): Classical ToDo application implemented with Qwik.

## Running

1. First, start the integration dev server:

   ```
   npm run integration.server
   ```

2. Open the browser http://localhost:8080
3. Navigate to one of the examples.

To build the minified code with external sourcemaps, run:

```
npm run integration.server.prod
```

## Debugging in VSCode

1. Select the Debug action panel on the left
2. In the "Run and Debug" drop down, select "Integration Dev Server"
3. Click the green play icon. This is the same as running `npm run integration.server`,
   however you can also add breakpoints directly in VSCode and the source.
4. The "Debug Console" will have the console logs.
