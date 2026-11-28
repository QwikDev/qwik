# Qwik DevTools

![Qwik DevTools](https://raw.github.com/QwikDev/devtools/main/assets/screenshot.png)

Enhance your Qwik development experience with DevTools that provide real-time insights into your application, dependencies, and setup.

## Installation

> Qwik DevTools requires **Qwik v2.0.0-beta.1 or higher**.

```shell copy
npm install @qwik.dev/devtools -D
```

```shell copy
pnpm add @qwik.dev/devtools -D
```

```shell copy
yarn add @qwik.dev/devtools -D
```

## Setup

Add the plugin to your `vite.config.(m)ts`:

```ts copy
import { qwikDevtools } from '@qwik.dev/devtools';

export default defineConfig({
  plugins: [
    qwikRouter(),
    qwikVite(),
    tsconfigPaths(),
    qwikDevtools(), // 👈 Add the plugin here
  ],
  ssr: {
    noExternal: ['@qwik.dev/devtools']; // 👈 Add the plugin here
  }
});
```

### Vite DevTools dock

Install `@vitejs/devtools` to use Qwik DevTools in the Vite DevTools dock. This integration
has been verified with Vite 8.3.8 and `@vitejs/devtools` 0.8.3; older Vite versions continue
to use the in-app overlay when the host is unavailable. Follow the Vite DevTools authorization
prompt when connecting a browser.

The default `qwikDevtools({ mode: 'auto' })` uses the dock when the host is enabled and
otherwise uses the overlay. Set `mode: 'overlay'` to always use the overlay, or `mode: 'dock'`
to require the dock (a warning is logged if no host is enabled). Host registration selects the
dock before the browser connects, so use `overlay` if authorization or the dock cannot be used.

The dock's page panels require a same-origin embedded application page. Standalone DevTools
windows and cross-origin frames are not supported. The dock uses the Vite server's
`/__qwik_devtools__/` path for its own assets, independently of the application's base.

## Features

- 🔍 Route Explorer
- ⚡️ Dependency Explorer
- 📊 Asset Explorer
- 🐞 Debug Tools

## Contribution Guide

Please refer to the [Contribution Guide](./CONTRIBUTING.md). Sharing feedback and feature request with GitHub issues is welcome.

## Community

Join our vibrant community:

- 🐦 Follow [@QwikDev](https://twitter.com/QwikDev) on Twitter
- 💬 Join our [Discord](https://qwik.dev/chat) community
- 🌐 Check out [other community groups](https://qwik.dev/ecosystem/#community)

## Related Links

- [📚 Qwik Documentation](https://qwik.dev/)
- [💬 Discord Chat](https://qwik.dev/chat)
- [⭐️ Qwik GitHub](https://github.com/QwikDev/qwik)
- [🐦 @QwikDev](https://twitter.com/QwikDev)
- [⚡️ Vite](https://vitejs.dev/)
