# CONTRIBUTING

If you are using VSCode, you can install the [Remote Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) extension. Once installed you will be prompted to reopen the folder in a container. All required dependencies will be installed in the container for you. If you're not prompted, you can run the `Remote-Containers: Open Folder in Container` command from the [VSCode Command Palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette).

If you're not able to use the dev container, follow these instructions:

## Prerequisite

To build platform binding and wasm, make sure you have installed [Rust](https://www.rust-lang.org/tools/install).

> On Windows, Rust requires [C++ build tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/). You can also select _Desktop development with C++_
> while installing Visual Studio.

> Alternatively, if Rust is not available you can run `pnpm build.platform.copy` to download bindings from CDN

To build Qwik for local development, first install the dev dependencies using [pnpm](https://pnpm.io/):

## Development

```shell
pnpm install
```

### Fast build

It will build all JS and all packages, but Rust.

```shell
pnpm build
```

### Full build

It will build absolutely everything, including Rust packages and WASM.
First build might be very slow.

- Builds each submodule
- Generates bundled `.d.ts` files for each submodule with [API Extractor](https://api-extractor.com/)
- Checks the public API hasn't changed
- Builds a minified `core.min.mjs` file
- Generates the publishing `package.json`

```shell
pnpm build.full
```

The build output will be written to `packages/qwik/dist`, which will be the directory that is published to [@builder.io/qwik](https://www.npmjs.com/package/@builder.io/qwik).

### Open E2E locally for debugging

```shell
pnpm serve
```

### Unit Tests Only

Unit tests use [uvu](https://github.com/lukeed/uvu)

```shell
pnpm test.unit
```

To keep _uvu_ open with the watch mode, run:

```shell
pnpm test.watch
```

> Note that the `test.watch` command isn't necessary if you're running the `pnpm start` command, since `start` will also concurrently run the _uvu_ watch process.

### E2E Tests Only

E2E tests use [Playwright](https://playwright.dev/).

To run the Playwright tests headless, from start to finish, run:

```shell
pnpm test.e2e.chromium
```

### Bonus: pnpm start

Next the `start` command will:

- Build the source files
- Begin the watch process so any changes will rebuild
- Run the type checking watch process with [tsc](https://www.typescriptlang.org/docs/handbook/compiler-options.html)
- Run the unit test watch process

```shell
pnpm start
```

Finally, you can use `pnpm --filter` command to run packages' commands, for example:

```shell
pnpm --filter qwik-docs start
```

More commands can be found in each package's package.json scripts section.

## Starter CLI `create-qwik`

- [Starter CLI](https://github.com/BuilderIO/qwik/blob/main/starters/README.md)

## Pull Request

- [Open Qwik in Stackblitz Codeflow](https://pr.new/github.com/BuilderIO/qwik/)
- Review PR in Stackblitz
  ![image](https://user-images.githubusercontent.com/4918140/195581745-8dfca1f9-2dcd-4f6a-b7aa-705f3627f8fa.png)

### Committing using "Commitizen":

Instead of using `git commit` please use the following command:

```shell
pnpm commit
```

You'll be asked guiding questions which will eventually create a descriptive commit message and necessary to generate meaningful release notes / CHANGELOG automatically.

### Pre-submit hooks

The project has pre-submit hooks, which ensure that your code is correctly formatted. You can run them manually like so:

```shell
pnpm lint
```

Some issues can be fixed automatically by using:

```shell
pnpm fmt
```

## Releasing (core-team only)

1. Run `pnpm release.prepare`, which will test, lint and build.
2. Use the interactive UI to select the next version, which will update the `package.json` `version` property, add the git change, and start a commit message.
3. Create a PR with the `package.json` change to merge to `main`.
4. After the `package.json` with the updated version is in `main`, click the [Run Workflow](https://github.com/BuilderIO/qwik/actions/workflows/ci.yml) button from the "Qwik CI" GitHub Action workflow.
5. Select the NPM dist-tag that should be used for this version, then click "Run Workflow".
6. The GitHub Action will dispatch the workflow to build `@builder.io/qwik` and each of the submodules, build WASM and native bindings, combine them into one package, and validate the package before publishing to NPM.
7. If the build is successful and all tests and validation passes, the workflow will automatically publish to NPM, commit a git tag to the repo, and create a GitHub release.
8. 🚀
