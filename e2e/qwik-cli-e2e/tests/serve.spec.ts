import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import playwright from 'playwright';
import { assert, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  assertHostUnused,
  DEFAULT_TIMEOUT,
  killAllRegisteredProcesses,
  log,
  promisifiedTreeKill,
  runCommandUntil,
  scaffoldQwikProject,
  type QwikProjectType,
} from '../utils';

const browserType = process.env.PW_BROWSER || 'chromium';

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

          const counterComponentPath = join(
            global.tmpDir,
            'src/components/starter/counter/counter.tsx'
          );
          const originalCounterContent = readFileSync(counterComponentPath, 'utf-8');

          const browser = await playwright[browserType].launch();
          try {
            const page = await browser.newPage();

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

            const plusBtn = page.locator('button', { hasText: '+' }).first();
            await plusBtn.waitFor({ timeout: 10000 });
            log('Found + button');

            await clickUntilCounterReaches(page, plusBtn, 73, 6, 10000);
            log('Counter is at 73');

            const markerText = `HMR-OK-${Date.now()}`;
            writeFileSync(counterComponentPath, withHmrMarker(originalCounterContent, markerText));
            log(`Modified counter.tsx with marker ${markerText}`);

            try {
              await page.waitForFunction(
                (expectedMarker) => {
                  const marker = document.querySelector('[data-testid="hmr-marker"]');
                  const gaugeValue = document.querySelector('._value_1v6hy_9, [class*="value"]');
                  return (
                    marker?.textContent === expectedMarker &&
                    gaugeValue?.textContent?.trim() === '73'
                  );
                },
                markerText,
                { timeout: 20000 }
              );
            } catch (e) {
              const hasMarker = await page.locator('[data-testid="hmr-marker"]').count();
              const bodyText = await page.textContent('body');
              log(
                `HMR wait failed. marker count=${hasMarker}, body includes 73: ${bodyText?.includes('73')}`
              );
              log(`Console logs:\n${consoleLogs.join('\n')}`);
              throw e;
            }

            const markerValue = await page.locator('[data-testid="hmr-marker"]').textContent();
            expect(markerValue).toBe(markerText);

            const bodyText = await page.textContent('body');
            expect(bodyText).toContain('73');

            log('HMR state preservation verified: content updated, counter state preserved');
          } finally {
            try {
              writeFileSync(counterComponentPath, originalCounterContent);
            } catch (e) {
              log(`Error restoring counter.tsx: ${e.message}`);
            }
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

      const buildProcess = await runCommandUntil(`npm run build`, global.tmpDir, (output) => {
        return output.includes('dist/build') || output.includes('built in');
      });

      try {
        await promisifiedTreeKill(buildProcess.pid!, 'SIGKILL');
      } catch (e) {
        log(`Error terminating build process: ${e.message}`);
      }

      const p = await runCommandUntil(
        `npm run preview -- --no-open --port ${SERVE_PORT}`,
        global.tmpDir,
        (output) => {
          return output.includes(host);
        }
      );

      assert.equal(existsSync(global.tmpDir), true);

      const res = await waitForHttpText(
        host,
        (html) => (type === 'playground' ? html.includes('fantastic') : html.includes('Hi')),
        20000
      );

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

function withHmrMarker(counterContent: string, markerText: string) {
  return counterContent.replace(
    `<Gauge value={count.value} />`,
    `<span data-testid="hmr-marker">${markerText}</span><Gauge value={count.value} />`
  );
}

async function clickUntilCounterReaches(
  page: playwright.Page,
  plusBtn: playwright.Locator,
  expectedValue: number,
  maxClicks: number,
  timeoutMs: number
) {
  const expectedText = String(expectedValue);
  const deadline = Date.now() + timeoutMs;
  for (let i = 0; i < maxClicks; i++) {
    await plusBtn.click();
    try {
      await page.waitForFunction(
        (text) => {
          const gaugeValue = document.querySelector('._value_1v6hy_9, [class*="value"]');
          return gaugeValue?.textContent?.trim() === text;
        },
        expectedText,
        { timeout: Math.max(Math.min(deadline - Date.now(), 2000), 1) }
      );
      return;
    } catch {
      // ignore
    }
  }
  await page.waitForFunction(
    (text) => {
      const gaugeValue = document.querySelector('._value_1v6hy_9, [class*="value"]');
      return gaugeValue?.textContent?.trim() === text;
    },
    expectedText,
    { timeout: Math.max(deadline - Date.now(), 1) }
  );
}

async function waitForHttpText(
  host: string,
  matcher: (html: string) => boolean,
  timeoutMs: number
): Promise<string> {
  let lastHtml = '';
  await waitFor(async () => {
    const html = await fetch(host, { headers: { accept: 'text/html' } }).then((r) => r.text());
    lastHtml = html;
    return matcher(html);
  }, timeoutMs);
  return lastHtml;
}

async function waitFor(
  callback: () => Promise<boolean>,
  timeoutMs: number,
  intervalMs = 250
): Promise<void> {
  const timeoutAt = Date.now() + timeoutMs;
  while (Date.now() < timeoutAt) {
    try {
      if (await callback()) {
        return;
      }
      // eslint-disable-next-line no-empty
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out after ${timeoutMs}ms`);
}
