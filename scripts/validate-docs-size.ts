import { readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { gzipSync } from 'node:zlib';

const RESULTS_PATH = 'scripts/docs-size-results.json';
const DOCS_DIST = 'packages/docs/dist';
const VERSION = 1;
/** Flag any size change (increase or decrease) beyond this many bytes */
const MAX_DRIFT_BYTES = 5;

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
  '/docs': 'docs/index.html',
};

const args = new Set(process.argv.slice(2));
const shouldUpdate = args.has('--update');

async function main() {
  const distDir = resolve(process.cwd(), DOCS_DIST);

  // Verify the dist directory exists
  try {
    await stat(distDir);
  } catch {
    throw new Error(
      `Docs dist directory not found at ${DOCS_DIST}. Build the docs first with: pnpm build --tsc-docs && pnpm run build.packages.docs`
    );
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
    console.log(`Updated docs size baselines in ${RESULTS_PATH}`);
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
      `Unable to read ${RESULTS_PATH}. Run \`pnpm test.bench.docs-size.update\` to create it.`
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
      `No baselines in ${RESULTS_PATH}. Run \`pnpm test.bench.docs-size.update\` to create them.`
    );
  }

  validateResults(stored, measured);
  console.log('Docs size validation passed.');
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

    // Strip the q:version attribute before measuring — its value includes the git hash
    // and optionally a timestamp, so it differs between CI and local builds.
    const content = Buffer.from(raw.toString('utf-8').replace(/ q:version="[^"]*"/, ''));
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
      `Docs size validation failed:\n${failures.map((f) => `- ${f}`).join('\n')}\n\nIf this change is intentional, run \`pnpm test.bench.docs-size.update\` to update baselines.`
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
