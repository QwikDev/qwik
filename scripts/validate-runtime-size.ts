import { readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { gzipSync } from 'node:zlib';

const RESULTS_PATH = 'scripts/runtime-size-results.json';
const FIXTURE_DIST = 'e2e/qwik-e2e/apps/runtime-size-fixture/dist';
const FIXTURE_PKG = 'qwik-runtime-size-fixture';
const VERSION = 1;
/**
 * Flag any size change (increase or decrease) beyond this many bytes Most routes weigh ~10
 * 000bytes, so this allows for ~0.5% drift, which should be enough to catch significant changes.
 */
const MAX_DRIFT_BYTES = 50;

type RouteResult = {
  rawBytes: number;
  gzipBytes: number;
};

type StoredResults = {
  version: number;
  generatedAt: string;
  routes: Record<string, RouteResult>;
};

/** Routes to measure — each maps to a dist/…/index.html file */
const ROUTES: Record<string, string> = {
  '/': 'index.html',
  '/counter': 'counter/index.html',
  '/reveal': 'reveal/index.html',
  '/task': 'task/index.html',
  '/visible-task': 'visible-task/index.html',
  '/use-async': 'use-async/index.html',
  '/use-computed': 'use-computed/index.html',
  '/route-loader': 'route-loader/index.html',
  '/route-action': 'route-action/index.html',
};

const args = new Set(process.argv.slice(2));
const shouldUpdate = args.has('--update');

async function main() {
  const distDir = resolve(process.cwd(), FIXTURE_DIST);

  if (shouldUpdate) {
    // Always rebuild on --update so the baseline reflects the current runtime
    // output. Avoids requiring callers to remember a separate build step.
    await buildFixture();
  } else {
    try {
      await stat(distDir);
    } catch {
      throw new Error(
        `Runtime size fixture dist directory not found at ${FIXTURE_DIST}. Build it first with: pnpm run build.runtime-size-fixture`
      );
    }
  }

  const measured = await measureRoutes(distDir);

  if (shouldUpdate) {
    const results: StoredResults = {
      version: VERSION,
      generatedAt: new Date().toISOString(),
      routes: measured,
    };
    const storedPath = resolve(process.cwd(), RESULTS_PATH);
    await writeFile(storedPath, JSON.stringify(results, null, 2) + '\n', 'utf-8');
    console.log(`Updated runtime size baselines in ${RESULTS_PATH}`);
    for (const [route, result] of Object.entries(measured)) {
      console.log(
        `  ${route}: ${formatBytes(result.rawBytes)} raw, ${formatBytes(result.gzipBytes)} gzip`
      );
    }
    return;
  }

  const storedPath = resolve(process.cwd(), RESULTS_PATH);
  let stored: StoredResults;
  try {
    stored = JSON.parse(await readFile(storedPath, 'utf-8')) as StoredResults;
  } catch {
    throw new Error(
      `Unable to read ${RESULTS_PATH}. Run \`pnpm test.bench.runtime-size.update\` to create it.`
    );
  }

  if (Object.keys(stored.routes).length === 0) {
    console.log('No baselines stored yet. Current sizes:');
    for (const [route, result] of Object.entries(measured)) {
      console.log(
        `  ${route}: ${formatBytes(result.rawBytes)} raw, ${formatBytes(result.gzipBytes)} gzip`
      );
    }
    throw new Error(
      `No baselines in ${RESULTS_PATH}. Run \`pnpm test.bench.runtime-size.update\` to create them.`
    );
  }

  validateResults(stored, measured);
  console.log('Runtime size validation passed.');
}

async function buildFixture() {
  console.log(`Building ${FIXTURE_PKG}...`);
  const { exec } = await import('node:child_process');
  await new Promise<void>((res, rej) => {
    const buildProcess = exec(`pnpm --filter ${FIXTURE_PKG} build`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Fixture build failed: ${error.message}`);
        rej(error);
      } else {
        console.log(stdout);
        console.error(stderr);
        res();
      }
    });
    buildProcess.stdout?.pipe(process.stdout);
    buildProcess.stderr?.pipe(process.stderr);
  });
}

async function measureRoutes(distDir: string): Promise<Record<string, RouteResult>> {
  const results: Record<string, RouteResult> = {};

  for (const [route, filePath] of Object.entries(ROUTES)) {
    const fullPath = join(distDir, filePath);
    let raw: Buffer;
    try {
      raw = await readFile(fullPath);
    } catch {
      throw new Error(`Route ${route} not found at ${fullPath}`);
    }

    // Normalize line endings and strip the q:version attribute before measuring.
    // Line endings differ between Windows (\r\n) and Unix (\n), and q:version includes
    // the git hash and optionally a timestamp, so both differ between CI and local builds.
    const content = Buffer.from(
      raw
        .toString('utf-8')
        .replace(/\r\n/g, '\n')
        .replace(/ q:version="[^"]*"/g, '')
    );
    const gzipped = gzipSync(content, { level: 9 });
    results[route] = {
      rawBytes: content.length,
      gzipBytes: gzipped.length,
    };
  }

  return results;
}

function validateResults(stored: StoredResults, measured: Record<string, RouteResult>) {
  const storedRoutes = Object.keys(stored.routes).sort();
  const measuredRoutes = Object.keys(measured).sort();

  const missing = storedRoutes.filter((r) => !measuredRoutes.includes(r));
  const extra = measuredRoutes.filter((r) => !storedRoutes.includes(r));
  if (missing.length > 0 || extra.length > 0) {
    const parts = ['Route mismatch.'];
    if (missing.length > 0) {
      parts.push(`Missing: ${missing.join(', ')}`);
    }
    if (extra.length > 0) {
      parts.push(`Extra: ${extra.join(', ')}`);
    }
    throw new Error(parts.join(' '));
  }

  const failures: string[] = [];
  const lines: string[] = [];

  for (const route of measuredRoutes) {
    const s = stored.routes[route];
    const m = measured[route];

    const rawDiff = m.rawBytes - s.rawBytes;
    const gzipDiff = m.gzipBytes - s.gzipBytes;

    const rawOk = Math.abs(rawDiff) <= MAX_DRIFT_BYTES;
    // Gzip size is informational only, content hashes make it non-deterministic
    const status = rawOk ? 'OK' : 'FAIL';

    lines.push(
      [
        `${route}:`,
        `raw=${formatBytes(m.rawBytes)}`,
        `(${rawDiff >= 0 ? '+' : ''}${rawDiff}B)`,
        `gzip=${formatBytes(m.gzipBytes)}`,
        `(${gzipDiff >= 0 ? '+' : ''}${gzipDiff}B)`,
        status,
      ].join(' ')
    );

    if (!rawOk) {
      failures.push(
        `${route} raw size changed by ${rawDiff >= 0 ? '+' : ''}${rawDiff}B (${formatBytes(s.rawBytes)} → ${formatBytes(m.rawBytes)}, max drift ±${MAX_DRIFT_BYTES}B)`
      );
    }
  }

  for (const line of lines) {
    console.log(line);
  }

  if (failures.length > 0) {
    throw new Error(
      `Runtime size validation failed:\n${failures.map((f) => `- ${f}`).join('\n')}\n\nIf this change is intentional, run \`pnpm test.bench.runtime-size.update\` to update baselines.`
    );
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes}B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
