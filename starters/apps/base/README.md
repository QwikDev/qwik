## Development Build

Server-side rendered index.html, with client-side modules prefetched and loaded by the browser.

```
npm run dev
```

## Production Builds

The production build should generate the client and server modules by running both client and server build commands. Additionally, the build command will use Typescript run a type check on the source.

```
npm run build
```

### Client Modules

Production build that creates only the client-side modules that are dynamically imported by the browser.

```
npm run build.client
```

### Preview

The preview command is intended for previewing the build locally and not meant as a production server.

```
npm run preview
```
