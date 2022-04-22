# Qwik Docs Site ⚡️

## Development Builds

### Client only

During development, the index.html is not a result of server-side rendering, but rather the Qwik app is built using client-side JavaScript only. This is ideal for development with Vite and its ability to reload modules quickly and on-demand. However, this mode is only for development and does not showcase "how" Qwik works since JavaScript is required to execute, and Vite imports many development modules for the app to work.

```
npm run dev
```

### Server-side Rendering (SSR) and Client

Server-side rendered index.html, with client-side modules prefetched and loaded by the browser. This can be used to test out server-side rendered content during development, but will be slower than the client-only development builds.

```
npm run dev.ssr
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

Production build that creates the server-side render (SSR) module that is used by the server to render the HTML.

```
npm run build.ssr
```

## Cloudflare Pages

Cloudflare's [wrangler](https://github.com/cloudflare/wrangler) CLI can be used to preview a production build locally. To start a local server, run:

```
npm run serve
```

Then visit [http://localhost:8787/](http://localhost:8787/)

### Deployments

[Cloudflare Pages](https://pages.cloudflare.com/) are deployable through their [Git provider integrations](https://developers.cloudflare.com/pages/platform/git-integration/).

If you don't already have an account, then [create a Cloudflare account here](https://dash.cloudflare.com/sign-up/pages). Next go to your dashboard and follow the [Cloudflare Pages deployment guide](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/).

Within the projects "Settings" for "Build and deployments", the "Build command" should be `npm run build`, and the "Build output directory" should be set to `dist`.
