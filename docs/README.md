# Qwik Docs Site

## Production Builds

### Client Modules

```
vite build --mode client
```

### Server Modules

```
vite build --mode server
```

## Development/Watch Builds

### Client and SSR

Server-side rendered index.html, with client-side modules loaded
by the browser on-demand.

```
vite
```

### Client only

The index.html is not a result of server-side rendering, but rather is
a static HTML content and the entirety of the Qwik app is generated
with client-side modules only.

```
vite --mode client
```

## Config

```ts
import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';

export default defineConfig(() => {
  return {
    plugins: [qwikVite()],
  };
});
```
