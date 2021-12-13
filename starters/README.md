# Starters

This folder stores "starter" projects for the CLI. The idea is that during the CLI execution, the developer can choose a particular starter app and combine it with a specific server.

## Developer

Here are steps to try out the CLI in local environment.

1. Build CLI:

   ```
   # npm run build.cli
   ```

1. Run CLI:

   ```
   # node ./dist-dev/cli/index.js
   💫 Let's create a Qwik project 💫

   ✔ Project name … todo-express
   ✔ Select a starter › Todo
   ✔ Select a server › Express

   ⭐️ Success! Project saved in todo-express directory

   📟 Next steps:
   cd todo-express
   npm install
   npm start
   ```

1. Change to generated location
   ```
   cd todo-express
   npm install
   npm start
   ```

## Publishing `create-qwik` CLI Package

1. Manually bump the version in the `src/cli/package.json`.
1. Commit the `src/cli/package.json` version change.
1. From the root dir, run `npm run release.cli`.
