---
'@builder.io/qwik': minor
---

FEAT: add monorepo support to the `qwik add` command by adding a `projectDir` param

That way you can run `qwik add --projectDir=packages/my-package` and it will add the feature to the specified project/package (sub) folder, instead of the root folder.
