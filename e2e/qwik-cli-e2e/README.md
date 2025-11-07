# CLI E2E tests for the Qwik Framework

This package provides isolated E2E tests by generating a new application with local packages and then running tests again that code by executing it and verifying expected behavior.

## Description

Tests can be invoked by running `pnpm run test.e2e.cli`.

**Note that running E2E tests requires the workspace projects to be prebuilt manually!**

E2E project does the following internally:

0. Vitest is configured to run a setup function once **PRIOR TO ALL** tests. During the setup `@qwik.dev/core`, `@qwik.dev/router` and `eslint-plugin-qwik` packages will be packed with `pnpm pack` Those will be used at a step 2 for every test. Tarballs are located in `temp/tarballs` folder within this repo. It is assumed that packages are built before E2E is executed.

1. Simulates `npm create qwik` locally using direct command `node packages/create-qwik/create-qwik.mjs playground {outputDir}`
   - By default `outputDir` is an auto-generated one using `tmp` npm package. The application that is created here will be removed after the test is executed
   - It is possible to install into custom folder using environment variable `TEMP_E2E_PATH`. Here's how the command would look like in this case:
   - with absolute path `TEMP_E2E_PATH=/Users/name/projects/tests pnpm run test.e2e.cli`
   - with path relative to the qwik workspace `TEMP_E2E_PATH=temp/e2e-folder pnpm run test.e2e.cli`

   Note that provided folder should exist. If custom path is used, generated application will not be removed after the test completes, which is helpful for debugging.

2. Uses packed `@qwik.dev/core`, `@qwik.dev/router` and `eslint-plugin-qwik` packages to update package.json file of the generated application with `file:path-to-package.tgz`.

3. Runs actual tests. Please pay attention at the `beforeAll` hook in the spec file

```typescript
beforeAll(() => {
  const config = scaffoldQwikProject();
  global.tmpDir = config.tmpDir;

  return async () => {
    await killAllRegisteredProcesses();
    config.cleanupFn();
  };
});
```

Notice that `beforeAll` returns a function, which will be executed after the test completes either with success or failure.

Both `config.cleanupFn();` and `killAllRegisteredProcesses` there are extremely important:

- `config.cleanupFn()` is used in order to remove temporary folder with generated project after the test is executed (again, it's not being removed if `TEMP_E2E_PATH` is provided).
- `killAllRegisteredProcesses` should be used to remove any active ports as we are serving the app during the test execution.
  Processes are being registered internally when `runCommandUntil` is executed. If you're executing something manually, you can use `registerExecutedChildProcess` utility to register the process.
  Despite `killAllRegisteredProcesses` will kill all processes when test exists, it is also a good practice to kill the process manually within the `it` statement using `await promisifiedTreeKill(yourChildProcess.pId, 'SIGKILL')`

## Adding new tests

Right now we have only one test file within this project. This means only one test application will be created and used, which is good from the execution time standpoint. If more files are added, it shouldn't potentially be a problem as we have `fileParallelism: false` set in the `vite.config.ts`, which means only one test will be executed at a time. This obviously slows down the execution time, but is safer, because we're working with a real file system.
