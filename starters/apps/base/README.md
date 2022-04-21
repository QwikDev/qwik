## Development Builds

### Client only

During development, the index.html is not a result of server-side rendering, but rather the Qwik app is built using client-side JavaScript only. This is ideal for development with Vite and its ability to reload modules quickly and on-demand. However, this mode is only for development and does not showcase "how" Qwik works since JavaScript is required to execute, and Vite imports many development modules for the app to work.

```
npm run dev
```

### Server-side Rendering (SSR) and Client

Server-side rendered index.html, with client-side modules loaded by the browser on-demand. This can be used to test out server-side rendered content during development, but will be slower than the client-only development builds.

```
npm run dev.server
```

## Production Builds

A production build should generate the client and server modules by running both client and server build commands.

```
npm run build
```

### Client Modules

Production build that creates only the client-side modules that are dynamically imported by the browser.

```
npm run build.client
```

### Server Modules

Production build that creates the server-side module that is used by the server to render the HTML.

```
npm run build.server
```

### Preview Production Build

After a full build has completed, the preview command can be used to run the production build locally.

```
vite preview
```

## Related

- [Qwik Docs](https://qwik.builder.io/)
- [Qwik Github](https://github.com/BuilderIO/qwik)
- [@QwikDev](https://twitter.com/QwikDev)
- [Discord](https://discord.gg/bNVSQmPzqy)
- [Vite](https://vitejs.dev/)
- [Partytown](https://partytown.builder.io/)
- [Builder.io](https://www.builder.io/)
