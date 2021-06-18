# Integration

This folder contains both e2e integration tests as well as examples of usage of the sub-framework.

## Examples:

- [`hello_static`](./hello_static/): The simplest possible app demonstrating lazy loading (but not server-side rendering.)
- [`hello_server`](./hello_server/): A simple example with server-side rendering demonstrating re-hydration of the application on the client.
- [`todo`](./todo/): Classical ToDo application implemented with Qwik.

## Running

1. First, start the [Bazel](https://bazel.build/) server

   ```
   bazel run integration:server
   ```

2. Open the browser http://localhost:8080
3. Navigate to one of the examples.
