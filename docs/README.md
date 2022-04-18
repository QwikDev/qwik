# Qwik Docs Site

## Production Builds

### Client and SSR

```
vite build
```

### Client only

```
vite build --mode client
```

### SSR only

```
vite build --mode server
```

## Development/Watch Builds

### SSR

Server-side render index.html during development

```
vite
```

### Client only

```
vite --mode client
```

### SSR only

```
vite --mode server
```

## Config

```ts
import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';

export default defineConfig((config) => {
  return {
    plugins: [
      qwikVite({
        srcDr: resolve('./src'),
      }),
    ],
  };
});
```
