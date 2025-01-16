# Contributing to Qwik

Thank you for taking an interest in contributing to Qwik! We appreciate you! 🫶🏽

Below are the guidelines on how to help in the best possible way.

## Submitting an Issue

Before creating a new issue, please search through open issues using the [GitHub issue search bar](https://docs.github.com/en/issues/tracking-your-work-with-issues/filtering-and-searching-issues-and-pull-requests). You might find the solution to your problem, or can verify that it is an already known issue.

We want a bug-free and best-performing project. That's why we take all reported issues to heart. But please be aware that if we can't reproduce the problem, we won't have a way of locating and adequately fixing it.

Therefore, to solve the problem in the best possible way, please create a minimal repository that reproduces the problem with the least possible code explaining and demonstrating the error.

Without enough information to reproduce the issue, we will close it because we can't recreate and solve it.

## Triaging Issues

If you're interested in helping out with triaging issues, please follow the [Triaging Guide](./contributing/TRIAGE.md).

## Submitting a Pull Request (PR)

### Branch Organization

We adopt [trunk-based development](https://trunkbaseddevelopment.com/) therefore all Pull Requests are made against the main branch.
Before releasing, we merge `main` into a release branch, for testing purposes.

### Good first issue

The issues marked with [_Good first issue_](https://github.com/QwikDev/qwik/issues?q=is%3Aissue+is%3Aopen+label%3A%22COMMUNITY%3A++good+first+issue%22) are a good starting point to familiarize yourself with the project.

Before solving the problem, please check with the maintainers that the issue is still relevant. Feel free to leave a comment on the issue to show your intention to work on it and prevent other people from unintentionally duplicating your effort.

### Sending a Pull Request

Before submitting a pull request, consider the following guidelines:

- Fork the repository into your own account.
- In your forked repository, create a new branch: `git checkout -b my-branch main`
- Make your changes/fixes.
- Run `pnpm fmt` to lint the code.
- Add a changeset with `pnpm change` if needed ([follow this tutorial](https://go.screenpal.com/watch/cZivIcVPJQV))
- Push your branch to GitHub: `git push origin my-branch`
- In GitHub, send a pull request to `QwikDev:main`.

> If you aren't sure your PR is ready, open it as a [draft](https://github.blog/2019-02-14-introducing-draft-pull-requests/) to make it clear to the maintainer.

### ⚠ Troubleshooting PR build issues on CI

Every PR is being automatically merged with `main` before the CI Github actions run.
That's why if the CI checks aren't passing your PR branch is probably not up to date.

**For non documentation PRs please do the following:**

1. Merge `main` into your PR branch
2. Run `pnpm api.update`
3. Run `pnpm build.local` or `pnpm build.full` if you made a change to the Rust code
4. Commit and push any changes as a result of the above steps

## Local development

This is the best approach because all required dependencies will be installed in the docker container for you and won't affect your personal configuration in any way.

### Prerequisites

You need to have these tools up and running in your local machine:

- an editor. We recommend [VSCode](https://code.visualstudio.com/).
- one of the following:
  - [Nix](https://nixos.org)
  - [Docker](https://www.docker.com/)
  - Locally installed NodeJS v18+ and optionally Rust

#### Nix

[Nix](https://nixos.org/download.html) can be used on macOS and Linux. It keeps installation files in `/nix` and doesn't write anywhere else. It has a declarative configuration in the `flake.nix` file, which describes all the tools needed to build the project.

- Install it on your machine and enable flakes. The [DetSys installer](https://github.com/DeterminateSystems/nix-installer) makes that easy.
- run `nix develop` in the project root to open a shell with all the tools, or use `direnv` to have them automatically added into your current shell.

##### Nix + Direnv (optional)

You can additionally use [direnv](https://direnv.net/) to automatically load the dev environment when you enter the project directory.
There is also a VSCode plugin for direnv that reloads the extensions so they get environment changes.
When you install direnv, you'll need to allow it once with `direnv allow` in the project root. From then on, when you `cd` into the project, it will automatically have the correct tools installed.

#### Docker

- Install the [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) extension in your VSCode.
- Once installed you will be prompted to 'Reopen the folder to develop in a container [learn more](https://code.visualstudio.com/docs/devcontainers/containers) or Clone repository in Docker volume for [better I/O performance](https://code.visualstudio.com/docs/devcontainers/containers#_quick-start-open-a-git-repository-or-github-pr-in-an-isolated-container-volume)'. If you're not prompted, you can run the `Dev Containers: Open Folder in Container` command from the [VSCode Command Palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette).

Alternatively you can use [devcontainers/cli](https://github.com/devcontainers/cli):

- Install devcontainers following their documentation.
- In your terminal navigate to the Qwik's project root directory.
- Then run `devcontainer up --workspace-folder .`. This command will start a Docker container with all required environment dependencies.

##### Using development container without Dev Containers and VSCode

If you would like to make use of the development container solution, but don't use VSCode or Dev Containers, you still can do so, by following steps:

- Build development container locally: `cd .devcontainer; docker build -t qwik-container .`
- Run development container from Qwik project root, binding the directory to container: `cd ..; docker run --rm -d --name qwik-container -p 3300:3300 -p 9229:9299 -v $PWD:/home/circleci/project -t qwik-container`

Docker command does:

- Create a new container that is removed once stopped,
- In daemon mode,
- With name `qwik-container`,
- That exposes the ports `3300` and `9229`, and
- Binds `qwik` project directory to container working directory.

##### Podman extras

> This section is highly influenced by SO answer: https://serverfault.com/a/1075838/352338
> If you use [Podman](https://podman.io/) instead of Docker as your containers engine, then you need to know the following:

- Container runs as user `circleci` with UID `1001` and GID `1002`.
- As you are accustomed to using Podman, you will need to append `:Z` to `volumes | -v` parameter so the command becomes:

```bash
$ subuid_size=65536
$ subgid_size=65536
$ container_uid=1001
$ container_gid=1002
$ podman run --rm \
    --user $container_uid:$container_gid \
    --uidmap=0:1:$container_uid \
    --uidmap=$((container_uid + 1)):$((container_uid + 1)):$((subuid_size - $container_uid)) \
    --uidmap=$container_uid:0:1 \
    --gidmap=0:1:$container_gid \
    --gidmap=$((container_gid + 1)):$((container_gid + 1)):$((subgid_size - $container_gid)) \
    --gidmap=$container_gid:0:1 \
    -d --name qwik-container \
    -p 3300:3300 -p 9229:9299 \
    -v .:/home/circleci/project:Z \
    -t qwik-container
```

#### Locally installed tools

If you're not able to use the dev container, make sure you have NodeJS v18+ installed, as well as `pnpm`.

Furthermore, to build the optimizer you optionally need Rust.

1. Make sure [Rust](https://www.rust-lang.org/tools/install) is installed.
2. Install [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/) with `cargo install wasm-pack` .
3. Node version >= `18`.
4. Make sure you have [pnpm](https://pnpm.io/installation) installed.
5. run `pnpm install`

> On Windows, Rust requires [C++ build tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/). You can also select _Desktop development with C++_
> while installing Visual Studio.

---

## Development

To build Qwik for local development, install the dev dependencies using [pnpm](https://pnpm.io/) and then do an initial build.

```shell
pnpm install && pnpm build.local
```

If you want to work on the Rust code, use `build.full` instead of `build.local`.

### Fast build

This will build only Qwik and Qwik City and their types. This is not enough to run the docs.

```shell
pnpm build.core
```

### Custom build

Once you have done a full build, the types are built, and you can build just the code you're working on. For qwik and qwik-city, you can do very fast rebuilds with

```shell
pnpm build --dev --qwik --qwikcity
```

The `--dev` flag skips type checking and generating.

You can run `pnpm build` without parameters to see which flags are available. Notable:

- `--tsc`: build types
- `--api`: build API docs and type bundles. Requires `--tsc` to have run.
- `--build`: Qwik (you'll probably also need `--dev`)
- `--qwikcity`: Qwik City (you'll probably also need `--dev`)
- `--qwikreact`: Qwik React
- `--qwiklabs`: Qwik Labs
- `--eslint`: Eslint plugin

E.g. to build only the React integration, you'd run `pnpm build --qwikreact`.

### Full build without Rust

This builds everything except Rust prerequisites and the optimizer binaries. Instead, those binaries are copied from the latest Qwik package on NPM.

```shell
pnpm build.local
```

### Full build with Rust

It will build **everything**, including Rust packages and WASM.

> First build might be very slow.

- Builds each submodule
- Generates bundled `.d.ts` files for each submodule with [API Extractor](https://api-extractor.com/)
- Checks the public API hasn't changed
- Builds a minified `core.min.mjs` file
- Generates the publishing `package.json`

```shell
pnpm build.full
```

The build output will be written to `packages/qwik/dist`, which will be the directory that is published to [@builder.io/qwik](https://www.npmjs.com/package/@builder.io/qwik).

To update the Rust test snapshots after you've made changes to the Rust code, run `pnpm test.rust.update`.

### Run in your own app

Say you made changes to the repo and you want to try them out in your app. Once built, all the Qwik packages are directly usable in your project by using the linking in your package manager.

This is very easy to do with `pnpm`:
Assuming qwik is in `../qwik`, run this inside the root of your app:

```shell
pnpm link ../qwik/packages/qwik
pnpm link ../qwik/packages/qwik-city
```

Other package managers probably need to first be told about the packages. For example, with `bun` you need to `cd ../qwik/packages/qwik` and `bun link`, repeat for `qwik-city`. Then in your app run `bun link @builder.io/qwik @builder.io/qwik-city`.

If you can't use package linking, just copy the contents of `packages/qwik` into your projects' `node_modules/@builder.io/qwik` folder, and/or the contents of `packages/qwik-city` into your projects' `node_modules/@builder.io/qwik-city` folder.

### Working on the docs site

At the root of the Qwik repo folder run:

```shell
pnpm docs.dev
```

### To open the test apps for debugging run

```shell
pnpm serve
```

### Unit Tests Only

Unit tests use [vitest](https://vitest.dev)

```shell
pnpm test.unit
```

### E2E Tests Only

E2E tests use [Playwright](https://playwright.dev/).

To run the Playwright tests headless, from start to finish, run:

```shell
pnpm test.e2e.chromium
```

Finally, you can use `pnpm --filter` command to run packages' commands, for example:

```shell
pnpm --filter qwik-docs start
```

More commands can be found in each package's package.json scripts section.

### Updating dependencies

To update all dependencies, run:

```shell
pnpm deps
```

This will show an interactive UI to update all dependencies. Be careful about performing major updates, especially for the docs site, since not all functionality has test coverage there. Be sure to test thoroughly.

## Starter CLI `create-qwik`

- [Starter CLI](https://github.com/QwikDev/qwik/blob/main/starters/README.md)

## Pull Requests

- [Open Qwik in StackBlitz Codeflow](https://pr.new/github.com/QwikDev/qwik/)
- Review PR in StackBlitz
  ![image](https://user-images.githubusercontent.com/4918140/195581745-8dfca1f9-2dcd-4f6a-b7aa-705f3627f8fa.png)

### Coding conventions

Write code that is clean, simple and easy to understand. Complicated one-liners are generally frowned upon, unless they are for performance reasons and are clearly marked as such with a comment and explanation.

When code does something unexpected, add a comment explaining why.

When a comment is longer, prefer using `/** */` JSDoc comments as that will be auto-formatted as Markdown.
JSDoc comments will also become part of the API documentation when they apply to exports, so write them as such.

`pnpm fmt` is your friend, and we recommend setting up Prettier and using format-on-save in your editor.

### Commit conventions

If you don't follow these commit conventions, your PR will be squashed. This means your local branch will not be part of the commit history of the target branch.
For larger PRs, it would really help if you follow these guidelines.

- Create a commit for each logical unit and make sure it passes linting.
- Keep your commits focused and atomic. Each commit should represent a single, coherent change.
- If you have commits like `wip lol` or `fixup`, squash them. Use `git rebase -i`.
- Commits must follow the format: `type(scope): description`
  For example: `feat(qwik-city): confetti animations` or `chore: pnpm api.update`

  Common types include:

  - feat: A new feature
  - fix: A bug fix
  - docs: Documentation only changes
  - lint: Changes that do not affect the meaning of the code (white-space, formatting, etc)
  - refactor: A code change that neither fixes a bug nor adds a feature
  - perf: A code change that improves performance
  - test: Adding missing tests or correcting existing tests
  - chore: Changes to the build process or auxiliary tools and libraries such as documentation generation

  The `scope` is optional and should be a short identifier for the changed part of the code.

- Use the imperative mood in the description. For example, use "add" instead of "added" or "adds".
- For consistency, there should not be a period at the end of the commit message's summary line (the first line of the commit message).

### Writing good commit messages

In addition to writing properly formatted commit messages, it's important to include relevant information so other developers can later understand _why_ a change was made. While this information usually can be found by digging into the code, pull request discussions or upstream changes, it may require a lot of work.

- Be clear and concise in your commit messages.
- Explain the reason for the change, not just what was changed.
- If the commit fixes a specific issue, reference it in the commit message (e.g., "Fixes #123").

### Adding a changeset

Whenever you make a change that requires mentioning in the changelog, you should add a changeset. This will automatically generate meaningful release notes and changelog files.

You can add multiple changesets in a PR, for example because you implement different features for different packages, or because you have multiple noteworthy commits.

You create a new changeset file by running:

```shell
pnpm change
```

This will ask you which packages should be included in the changeset, and if the changes require a new version bump. Generally you should not select `major`, and you should only select `minor` if there are new features or significant improvements. If you don't select either it will become `patch`.

For your convenience, we prepared a video tutorial that covers the process of adding a changeset:

[📽 TUTORIAL: Adding a changeset](https://go.screenpal.com/watch/cZivIcVPJQV)

## PR merging (maintainers)

Make sure the PR follows all the guidelines in this document. Once you think the PR is good to merge, if the commits are "nice", you can merge the PR. If not, squash the PR.

In case the PR is stuck waiting for the original author to apply a trivial
change (a typo, capitalization change, etc.) and the author allowed the members
to modify the PR, consider applying it yourself (or commit the existing review
suggestion). You should pay extra attention to make sure the addition doesn't go
against the idea of the original PR and would not be opposed by the author.

## Releasing (maintainers)

Merge the "version" PR, that is automatically created when a PR with a changeset is merged. You can first edit the files it created to get a nicer changelog.

Once CI passes, the GitHub Action will publish the new version to NPM.
