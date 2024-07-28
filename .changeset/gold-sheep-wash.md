---
'create-qwik': patch
'@builder.io/qwik-city': patch
'@builder.io/qwik': patch
---

- built files are now under dist/ or lib/. All tools that respect package export maps should just work.
  If you have trouble with Typescript, ensure that you use `moduleResolution: "Bundler"` in your `tsconfig.json`.
- `@builder.io/qwik` no longer depends on `undici`
