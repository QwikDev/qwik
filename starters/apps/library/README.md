# Qwik Library ⚡️

- [Qwik Docs](https://qwik.dev/)
- [Discord](https://qwik.dev/chat)
- [Qwik on GitHub](https://github.com/QwikDev/qwik)
- [@QwikDev](https://twitter.com/QwikDev)
- [Vite](https://vitejs.dev/)
- [Partytown](https://partytown.qwik.dev/)
- [Mitosis](https://github.com/BuilderIO/mitosis)
- [Builder.io](https://www.builder.io/)

---

## Project Structure

Inside your project, you'll see the following directories and files:

```
├── public/
│   └── ...
└── src/
    ├── components/
    │   └── ...
    └── index.ts
```

- `src/components`: Recommended directory for components.

- `index.ts`: The entry point of your component library, make sure all the public components are exported from this file.

## Development

Development mode uses [Vite's development server](https://vitejs.dev/). For Qwik during development, the `dev` command will also server-side render (SSR) the output. The client-side development modules are loaded by the browser.

```
npm run dev
```

> Note: during dev mode, Vite will request many JS files, which does not represent a Qwik production build.

## Production

The production build should generate the production build of your component library in (./lib) and the typescript type definitions in (./lib-types).

```
npm run build
```

## sideEffects: false

This package is configured with "sideEffects": false in its package.json.<br/>
This tells bundlers that the module [has no side effects](https://webpack.js.org/guides/tree-shaking/#mark-the-file-as-side-effect-free) when imported.<br/>
Consequently, to maintain the integrity of tree-shaking optimizations, please ensure your code truly contains no side effects (such as modifying global variables or the DOM upon import).<br/>
If your module does introduce side effects, remove "sideEffects": false or specify the specific files with side effects.<br/>
Be sure to only remove it from the specific file where the global is being set. Finally, verify that your build continues to function as expected after making any adjustments to the sideEffects setting.
