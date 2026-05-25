import { mkdirSync, writeFileSync } from 'fs';
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

let SERVE_PORT = 3635;
beforeEach(() => {
  SERVE_PORT++;
});

describe('template: playground worker$', () => {
  beforeAll(() => {
    const config = scaffoldQwikProject('playground');
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

  test('Should invoke worker$ in dev mode', { timeout: DEFAULT_TIMEOUT * 2 }, async () => {
    const workerRouteDir = join(global.tmpDir, 'src/routes/worker');
    mkdirSync(workerRouteDir, { recursive: true });
    writeFileSync(join(workerRouteDir, 'index.tsx'), getWorkerRouteSource());

    const host = `http://localhost:${SERVE_PORT}/`;
    const workerHost = `${host}worker/`;
    await assertHostUnused(host);

    const p = await runCommandUntil(
      `npm run dev -- --port ${SERVE_PORT}`,
      global.tmpDir,
      (output) => {
        return output.includes(host);
      }
    );

    const browser = await playwright[browserType].launch();
    const consoleLogs: string[] = [];
    const workerResponses: string[] = [];
    const workerChunkUrls = new Set<string>();
    try {
      const page = await browser.newPage();

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
        }
      });
      page.on('pageerror', (err) => {
        consoleLogs.push(`[pageerror] ${err.message}`);
      });
      page.on('response', (resp) => {
        if (resp.status() >= 400) {
          consoleLogs.push(`[${resp.status()}] ${resp.url()}`);
        }
        if (/(_worker_.*\.js|worker_file&type=module)/.test(resp.url())) {
          void resp
            .text()
            .then((text) => {
              for (const match of text.matchAll(/import\("([^"]*_worker_[^"]*\.js)"\)/g)) {
                workerChunkUrls.add(match[1]);
              }
              workerResponses.push(`URL: ${resp.url()}\n${text}`);
            })
            .catch((err) => {
              workerResponses.push(`URL: ${resp.url()}\n<failed to read body: ${String(err)}>`);
            });
        }
      });

      await page.goto(workerHost);
      await page.locator('#worker-increment').waitFor({ timeout: 10000 });

      await page.locator('#worker-increment').click();

      await page.waitForFunction(
        () => {
          const count = document.querySelector('#worker-count');
          const status = document.querySelector('#worker-status');
          return count?.textContent?.trim() === '1' && status?.textContent?.trim() === 'done';
        },
        undefined,
        { timeout: 20000 }
      );

      expect(await page.locator('#worker-count').textContent()).toBe('1');
      expect(await page.locator('#worker-status').textContent()).toBe('done');
      expect(consoleLogs).toEqual([]);
    } catch (e) {
      for (const workerChunkUrl of workerChunkUrls) {
        const workerModuleUrl = new URL(workerChunkUrl, host);
        workerModuleUrl.search = workerModuleUrl.search
          ? `${workerModuleUrl.search}&worker_file&type=module`
          : '?worker_file&type=module';
        try {
          const workerModuleText = await fetch(workerModuleUrl).then((resp) => resp.text());
          workerResponses.push(`URL: ${workerModuleUrl}\n${workerModuleText}`);
        } catch (workerChunkErr) {
          workerResponses.push(
            `URL: ${workerModuleUrl}\n<failed to read body: ${String(workerChunkErr)}>`
          );
        }
      }
      log(`Worker dev-server console logs:\n${consoleLogs.join('\n')}`);
      log(`Worker dev-server responses:\n${workerResponses.join('\n\n---\n\n')}`);
      throw e;
    } finally {
      await browser.close();
      try {
        await promisifiedTreeKill(p.pid!, 'SIGKILL');
      } catch (e) {
        log(`Error terminating dev server: ${e.message}`);
      }
    }
  });
});

function getWorkerRouteSource() {
  return `import { component$, useSignal } from '@qwik.dev/core';
import { worker$ } from '@qwik.dev/core/worker';

const incrementInWorker = worker$((count: number) => count + 1);

const formatError = (err: unknown) => {
  if (err instanceof Error) {
    return err.stack || err.message;
  }
  return String(err);
};

export default component$(() => {
  const count = useSignal(0);
  const status = useSignal('idle');

  return (
    <>
      <h1>Worker page</h1>
      <button
        id="worker-increment"
        onClick$={async () => {
          status.value = 'start';
          try {
            count.value = await incrementInWorker(count.value);
            status.value = 'done';
          } catch (err) {
            status.value = formatError(err);
          }
        }}
      >
        Increment in worker
      </button>
      <div id="worker-count">{count.value}</div>
      <div id="worker-status">{status.value}</div>
    </>
  );
});
`;
}
