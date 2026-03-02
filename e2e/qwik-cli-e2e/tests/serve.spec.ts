/* eslint-disable no-console */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { assert, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  assertHostUnused,
  DEFAULT_TIMEOUT,
  getPageHtml,
  killAllRegisteredProcesses,
  log,
  promisifiedTreeKill,
  runCommandUntil,
  scaffoldQwikProject,
  type QwikProjectType,
} from '../utils';

let SERVE_PORT = 3535;
beforeEach(() => {
  // the port doesn't clear immediately after the previous test
  SERVE_PORT++;
});
for (const type of ['empty', 'playground'] as QwikProjectType[]) {
  describe(`template: ${type}`, () => {
    beforeAll(() => {
      const config = scaffoldQwikProject(type);
      global.tmpDir = config.tmpDir;

      return async () => {
        try {
          await killAllRegisteredProcesses();
        } catch (e) {
          log(`Error during process cleanup: ${e.message}`);
        }
        config.cleanupFn();
      };
    }, 120000);

    if (type === 'playground') {
      test(
        'Should serve the app in dev mode and update the content on hot reload',
        { timeout: DEFAULT_TIMEOUT },
        async () => {
          const host = `http://localhost:${SERVE_PORT}/`;
          await assertHostUnused(host);
          const p = await runCommandUntil(
            `npm run dev -- --port ${SERVE_PORT}`,
            global.tmpDir,
            (output) => {
              return output.includes(host);
            }
          );
          assert.equal(existsSync(global.tmpDir), true);

          await expectHtmlOnARootPage(host);

          // Don't let process termination errors fail the test
          try {
            await promisifiedTreeKill(p.pid!, 'SIGKILL');
          } catch (e) {
            log(`Error terminating dev server: ${e.message}`);
          }
        }
      );
    }

    test('Should preview the app', { timeout: DEFAULT_TIMEOUT }, async () => {
      const host = `http://localhost:${SERVE_PORT}/`;
      await assertHostUnused(host);

      // First build the app
      const buildProcess = await runCommandUntil(`npm run build`, global.tmpDir, (output) => {
        return output.includes('dist/build') || output.includes('built in');
      });

      try {
        await promisifiedTreeKill(buildProcess.pid!, 'SIGKILL');
      } catch (e) {
        log(`Error terminating build process: ${e.message}`);
      }

      // Now run the preview
      const p = await runCommandUntil(
        `npm run preview -- --no-open --port ${SERVE_PORT}`,
        global.tmpDir,
        (output) => {
          return output.includes(host);
        }
      );

      assert.equal(existsSync(global.tmpDir), true);

      // Wait a bit for the server to fully start
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const res = await fetch(host, { headers: { accept: 'text/html' } }).then((r) => r.text());
      console.log('** res', res);

      // Check for the appropriate content based on template type
      if (type === 'playground') {
        expect(res).toContain('fantastic');
      } else if (type === 'empty') {
        expect(res).toContain('Hi');
        expect(res).toContain('qwik');
      }

      try {
        await promisifiedTreeKill(p.pid!, 'SIGKILL');
      } catch (e) {
        log(`Error terminating preview server: ${e.message}`);
      }
    });
  });
}

async function expectHtmlOnARootPage(host: string) {
  expect((await getPageHtml(host)).querySelector('.container h1')?.textContent).toBe(
    `So fantasticto have you here`
  );
  const heroComponentPath = join(global.tmpDir, `src/components/starter/hero/hero.tsx`);
  const heroComponentTextContent = readFileSync(heroComponentPath, 'utf-8');
  writeFileSync(
    heroComponentPath,
    heroComponentTextContent.replace(
      `to have <span class="highlight">you</span> here`,
      `to have <span class="highlight">e2e tests</span> here`
    )
  );
  // wait for the arbitrary amount of time before the app is reloaded
  await new Promise((r) => setTimeout(r, 2000));
  expect((await getPageHtml(host)).querySelector('.container h1')?.textContent).toBe(
    `So fantasticto have e2e tests here`
  );
}
