# Starters

This folder stores "starter" projects for the cli. The idea is that during the cli execution, the developer can choose a particular starter app and combine it with a specific server and features.

All starters are based on `starters/apps/base`, including the `package.json` and `tsconfig.json`. Depending on the options the user selects, their starter merges into the `base` app.

## Developer

Here are steps to try out the cli in a local environment.

1. Build the cli:

```zsh
pnpm build.cli
```

2. Run the cli:

```zsh
pnpm cli.qwik
```

> If you want to test the cli on consumer repository, you can `pnpm link.dist` on the qwik monorepo, then `pnpm link --global @builder.io/qwik` on the consumer project, and finally run the cli from there.

## Publishing `create-qwik` cli Package

The starter cli is published at the same time as `@builder.io/qwik`. When published, the cli will update the `base` app's package.json to point to the published version of Qwik.

The base app's package.json's devDependencies are updated with:

```json
{
  "devDependencies": {
    "@builder.io/qwik": "<QWIK_VERSION_BEING_PUBLISHED>",
    "typescript": "<SAME_AS_ROOT_PACKAGE>",
    "vite": "<SAME_AS_ROOT_PACKAGE>"
  }
}
```
