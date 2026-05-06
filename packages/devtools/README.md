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
