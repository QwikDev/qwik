# SSR Package

This package contains the server-side rendering (SSR) support for Qwik.

## Imports

The SSR package is bundled separately from `@qwik.dev/core` and from the user application. For this reason, we need to follow these rules:

The SSR package can only import:

- Types from `@qwik.dev/core` (e.g. `QRL`, `EntityKey`, `Injector`, etc.) To facilitate this we have created `qwik-types.ts` which exports all the types from `@qwik.dev/core` for simplicity.
- Should not import anything from outside of the package (e.g. `import from '../<something>'`). Doing so means that you will end up with two copies of the code. One in SSR packages and one in the original place such as `@qwik.dev/core` or the user application which will cause runtime issues. For this reasons all imports from `qwik` must be through `@qwik.dev/core` and not directly from the source through relative paths.
