/* eslint-disable no-console */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { chromium } from 'playwright';
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
        'Should work, and preserve client state across HMR updates',
        { timeout: DEFAULT_TIMEOUT * 2 },
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

          const browser = await chromium.launch();
          try {
            const page = await browser.newPage();

            // Collect console messages for debugging
            const consoleLogs: string[] = [];
            page.on('console', (msg) => {
              consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
            });
            page.on('pageerror', (err) => {
              consoleLogs.push(`[pageerror] ${err.message}`);
            });
            page.on('response', (resp) => {
              if (resp.status() >= 400) {
                consoleLogs.push(`[${resp.status()}] ${resp.url()}`);
              }
            });

            await page.goto(host);
            log('Page loaded');

            // The counter's + button (last button in the counter component)
            // Counter uses CSS modules so we can't rely on class names.
            // The buttons contain "-" and "+" text.
            const plusBtn = page.locator('button', { hasText: '+' }).first();
            await plusBtn.waitFor({ timeout: 10000 });
            log('Found + button');

            // Click the + button 3 times to change counter state (starts at 70)
            await plusBtn.click();
            await plusBtn.click();
            await plusBtn.click();
            log('Clicked + button 3 times');

            // Verify counter changed to 73 (the gauge renders value in a <span>)
            await page.waitForFunction(() => document.body.textContent?.includes('73'), {
              timeout: 10000,
            });
            log('Counter is at 73');

            // Modify the counter component (whose QRL segments are loaded on the client
            // because we clicked the buttons). Add a visible marker to verify the update.
            const counterComponentPath = join(
              global.tmpDir,
              'src/components/starter/counter/counter.tsx'
            );
            const counterContent = readFileSync(counterComponentPath, 'utf-8');
            writeFileSync(
              counterComponentPath,
              counterContent.replace(
                `<Gauge value={count.value} />`,
                `<span data-testid="hmr-marker">HMR-OK</span><Gauge value={count.value} />`
              )
            );
            log('Modified counter.tsx');

            // Wait for HMR to apply the update (new marker should appear without full reload)
            try {
              await page.waitForFunction(
                () => !!document.querySelector('[data-testid="hmr-marker"]'),
                { timeout: 15000 }
              );
            } catch (e) {
              // Dump debug info on failure
              const hasMarker = await page.locator('[data-testid="hmr-marker"]').count();
              const bodyText = await page.textContent('body');
              log(
                `HMR wait failed. marker count=${hasMarker}, body includes 73: ${bodyText?.includes('73')}`
              );
              log(`Console logs:\n${consoleLogs.join('\n')}`);
              throw e;
            }

            // Verify the HMR marker appeared
            const markerText = await page.locator('[data-testid="hmr-marker"]').textContent();
            expect(markerText).toBe('HMR-OK');

            // Verify counter state is preserved (not reset to initial value 70)
            // If HMR works correctly, the counter should still show 73
            // If a full-reload happened, it would reset to the initial value of 70
            const bodyText = await page.textContent('body');
            expect(bodyText).toContain('73');

            log('HMR state preservation verified: content updated, counter state preserved');
          } finally {
            await browser.close();
            try {
              await promisifiedTreeKill(p.pid!, 'SIGKILL');
            } catch (e) {
              log(`Error terminating dev server: ${e.message}`);
            }
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
