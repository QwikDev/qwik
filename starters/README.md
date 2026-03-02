# Starters

This folder stores "starter" projects for the CLI. The idea is that during the CLI execution, the developer can choose a particular starter app and combine it with a specific server and features.

All starters are based on `starters/apps/base`, including the `package.json` and `tsconfig.json`. Depending on the options the user selects, their starter merges into the `base` app.

## Developer

Here are steps to try out the CLI in a local environment.

1. Build the CLI:

```zsh
pnpm build.cli
```

2. Run the CLI:

```zsh
pnpm cli.qwik
```

> If you want to test the CLI on consumer repository, you can `pnpm link.dist` on the qwik monorepo, then `pnpm link --global @qwik.dev/core` on the consumer project, and finally run the CLI from there.

## Publishing `create-qwik` CLI Package

The starter CLI is published at the same time as `@qwik.dev/core`. When published, the CLI will update the `base` app's package.json to point to the published version of Qwik.

The base app's package.json's devDependencies are updated with:

```json
{
  "devDependencies": {
    "@qwik.dev/core": "<QWIK_VERSION_BEING_PUBLISHED>",
    "typescript": "<SAME_AS_ROOT_PACKAGE>",
    "vite": "<SAME_AS_ROOT_PACKAGE>"
  }
}
```
