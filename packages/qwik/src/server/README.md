# SSR Package

This package contains the server-side rendering (SSR) support for Qwik.

## Imports

The SSR package is bundled separately from `@builder.io/qwik` and from the user application. For this reason, we need to follow these rules:

The SSR package can only import:
- Types from `@builder.io/qwik` (e.g. `QRL`, `EntityKey`, `Injector`, etc.) To facilitate this we have created `qwik-types.ts` which exports all the types from `@builder.io/qwik` for simplicity.
- Should not import anything from outside of the package (e.g. `import from '../<something>'`). Doing so means that you will end up with two copies of the code. One in SSR packages and one in the original place such as `@builder.io/qwik` or the user application which will cause runtime issues. For this reasons all imports from `qwik` must be through `@builder.io/qwik` and not directly from the source through relative paths.