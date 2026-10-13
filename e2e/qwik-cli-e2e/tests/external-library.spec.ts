import { execSync } from 'child_process';
import { cpSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import playwright from 'playwright';
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  assertHostUnused,
  DEFAULT_TIMEOUT,
  killAllRegisteredProcesses,
  log,
  promisifiedTreeKill,
  runCommandUntil,
  scaffoldQwikProject,
} from '../utils';

const browserType = process.env.PW_BROWSER || 'chromium';
const LIBRARY_NAME = 'e2e-qwik-library';

let SERVE_PORT = 3735;
beforeEach(() => {
  SERVE_PORT++;
});

describe('library starter used by the playground', () => {
  let appDir: string;

  beforeAll(async () => {
    const library = scaffoldQwikProject('library');
    const app = scaffoldQwikProject('playground');
    appDir = app.tmpDir;

    // The full build, as before publishing: the lib output plus its type declarations.
    execSync('npm run build', { cwd: library.tmpDir, stdio: ['ignore', 'inherit', 'inherit'] });
    installLibrary(library.tmpDir, appDir);
    library.cleanupFn();

    const routeDir = join(appDir, 'src/routes/library');
    mkdirSync(routeDir, { recursive: true });
    writeFileSync(join(routeDir, 'index.tsx'), LIBRARY_ROUTE_SOURCE);

    return async () => {
      try {
        await killAllRegisteredProcesses();
      } catch (e) {
        log(`Error during process cleanup: ${e.message}`);
      }
      app.cleanupFn();
    };
  }, 300000);

  test(
    'the dev server renders the library and loads its lazy code',
    { timeout: DEFAULT_TIMEOUT * 2 },
    async () => {
      const host = `http://localhost:${SERVE_PORT}/`;
      await assertHostUnused(host);
      const p = await runCommandUntil(`npm run dev -- --port ${SERVE_PORT}`, appDir, (output) =>
        output.includes(host)
      );
      try {
        await expectLibraryCounterWorks(`${host}library/`);
      } finally {
        await promisifiedTreeKill(p.pid!, 'SIGKILL');
      }
    }
  );

  // Only a production server bundle carries the core build Node loads for an external library.
  for (const { nodeEnv, isExternal } of [
    { nodeEnv: 'production', isExternal: true },
    { nodeEnv: 'development', isExternal: false },
  ]) {
    test(
      `a ${nodeEnv} build ${isExternal ? 'leaves the library external' : 'bundles the library'}`,
      { timeout: DEFAULT_TIMEOUT * 4 },
      async () => {
        const host = `http://localhost:${SERVE_PORT}/`;
        await assertHostUnused(host);
        let buildOutput = '';
        const p = await runCommandUntil(
          `npm run preview -- --no-open --port ${SERVE_PORT}`,
          appDir,
          (output) => {
            buildOutput = output;
            return output.includes(host);
          },
          { NODE_ENV: nodeEnv }
        );
        try {
          expect(serverOutputImportsLibrary(join(appDir, 'server'))).toBe(isExternal);
          // The starter keeps core in devDependencies, which a production install may leave out.
          expect(buildOutput.includes('only in "devDependencies"')).toBe(isExternal);
          await expectLibraryCounterWorks(`${host}library/`);
        } finally {
          await promisifiedTreeKill(p.pid!, 'SIGKILL');
        }
      }
    );
  }
});

const LIBRARY_ROUTE_SOURCE = `import { component$ } from '@qwik.dev/core';
import { Counter } from '${LIBRARY_NAME}';

export default component$(() => {
  return (
    <div id="library-page">
      <Counter />
    </div>
  );
});
`;

/** Installs the built library the way a registry install would: a real folder, not a link. */
function installLibrary(libraryDir: string, appDir: string) {
  const pkg = JSON.parse(readFileSync(join(libraryDir, 'package.json'), 'utf-8'));
  pkg.name = LIBRARY_NAME;
  const installDir = join(appDir, 'node_modules', LIBRARY_NAME);
  mkdirSync(installDir, { recursive: true });
  writeFileSync(join(installDir, 'package.json'), JSON.stringify(pkg, null, 2));
  cpSync(join(libraryDir, 'lib'), join(installDir, 'lib'), { recursive: true });

  // The Qwik Vite plugin finds libraries through the app's declared dependencies.
  const appPkgPath = join(appDir, 'package.json');
  const appPkg = JSON.parse(readFileSync(appPkgPath, 'utf-8'));
  appPkg.dependencies = { ...appPkg.dependencies, [LIBRARY_NAME]: '*' };
  writeFileSync(appPkgPath, JSON.stringify(appPkg, null, 2));
}

/** A bundled library leaves no import of its package name behind. */
function serverOutputImportsLibrary(dir: string): boolean {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (serverOutputImportsLibrary(path)) {
        return true;
      }
    } else if (/\.m?js$/.test(entry) && readFileSync(path, 'utf-8').includes(`"${LIBRARY_NAME}"`)) {
      return true;
    }
  }
  return false;
}

async function expectLibraryCounterWorks(url: string) {
  const html = await fetch(url, { headers: { accept: 'text/html' } }).then((r) => r.text());
  expect(html).toContain('Count: 0');

  const browser = await playwright[browserType].launch();
  const problems: string[] = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', (err) => problems.push(`[pageerror] ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        problems.push(`[console] ${msg.text()}`);
      }
    });
    page.on('response', (resp) => {
      if (resp.status() >= 400) {
        problems.push(`[${resp.status()}] ${resp.url()}`);
      }
    });

    await page.goto(url);
    const counter = page.locator('#library-page');
    await expect.poll(() => counter.textContent()).toContain('Count: 0');
    await counter.locator('button', { hasText: 'Increment' }).click();
    await expect.poll(() => counter.textContent(), { timeout: 10000 }).toContain('Count: 1');
    expect(problems).toEqual([]);
  } finally {
    await browser.close();
  }
}
