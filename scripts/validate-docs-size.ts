import { readFile, writeFile, stat, mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const RESULTS_PATH = 'scripts/docs-size-results.json';
const DOCS_DIST = 'packages/docs/dist';
const VERSION = 1;
/** Flag any size change (increase or decrease) beyond this many bytes */
const MAX_DRIFT_BYTES = 5;
const PREVIOUS_BASE_URL = 'https://qwikdev-build-v2.qwik-8nx.pages.dev';

type RouteResult = {
  rawBytes: number;
  gzipBytes: number;
};

type MeasuredRoute = RouteResult & {
  /** Normalized HTML (line endings + q:version stripped) used for measurement and diagnostics */
  content: string;
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
  // First check that the docs build is more recent than the qwik and qwik-router builds
  const qwikStat = await stat(resolve(process.cwd(), 'packages/qwik/dist/core.mjs')).catch(
    () => null
  );
  const routerStat = await stat(
    resolve(process.cwd(), 'packages/qwik-router/lib/index.qwik.mjs')
  ).catch(() => null);
  const docsStat = await stat(resolve(distDir, 'index.html')).catch(() => null);
  if (
    !(qwikStat && routerStat && docsStat) ||
    docsStat.mtimeMs < qwikStat.mtimeMs ||
    docsStat.mtimeMs < routerStat.mtimeMs
  ) {
    // run the docs build
    console.log('!!! Docs build is older than qwik/qwik-router builds. Rebuilding docs...');
    const { exec } = await import('node:child_process');
    await new Promise((resolve, reject) => {
      const buildProcess = exec('pnpm run build.packages.docs', (error, stdout, stderr) => {
        if (error) {
          console.error(`Docs build failed: ${error.message}`);
          reject(error);
        } else {
          console.log(stdout);
          console.error(stderr);
          resolve(null);
        }
      });
      buildProcess.stdout?.pipe(process.stdout);
      buildProcess.stderr?.pipe(process.stderr);
    });
  }

  const measured = await measureRoutes(distDir);
  const storedPath = resolve(process.cwd(), RESULTS_PATH);

  const strippedRoutes: Record<string, RouteResult> = {};
  for (const [route, r] of Object.entries(measured)) {
    strippedRoutes[route] = { rawBytes: r.rawBytes, gzipBytes: r.gzipBytes };
  }

  if (shouldUpdate) {
    await writeFile(storedPath, formatResultsJson(strippedRoutes) + '\n', 'utf-8');
    console.log(`Updated docs size baselines in ${RESULTS_PATH}`);
    for (const [route, result] of Object.entries(measured)) {
      console.log(
        `  ${route}: ${formatBytes(result.rawBytes)} raw, ${formatBytes(result.gzipBytes)} gzip`
      );
    }
    return;
  }

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

  await validateResults(stored, measured, RESULTS_PATH);
  console.log('Docs size validation passed.');
}

async function measureRoutes(distDir: string): Promise<Record<string, MeasuredRoute>> {
  const results: Record<string, MeasuredRoute> = {};

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
    const text = raw
      .toString('utf-8')
      .replace(/\r\n/g, '\n')
      .replace(/ q:version="[^"]*"/, '');
    const content = Buffer.from(text);
    const gzipped = gzipSync(content, { level: 9 });
    results[route] = {
      rawBytes: content.length,
      gzipBytes: gzipped.length,
      content: text,
    };
  }

  return results;
}

async function validateResults(
  stored: StoredResults,
  measured: Record<string, MeasuredRoute>,
  resultsPath: string
) {
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
  const failedRoutes: Array<{ route: string; rawDiff: number }> = [];
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
      failedRoutes.push({ route, rawDiff });
    }
  }

  for (const line of lines) {
    console.log(line);
  }

  if (failures.length > 0) {
    for (const { route, rawDiff } of failedRoutes) {
      try {
        await diagnoseFailure(route, measured[route].content, rawDiff);
      } catch (err) {
        console.error(
          `\n[diagnose] ${route}: failed to produce diagnostic — ${
            err instanceof Error ? err.message : err
          }`
        );
      }
    }
    throw new Error(
      `Docs size validation failed:\n${failures.map((f) => `- ${f}`).join('\n')}\n\nIf this change is intentional, run \`pnpm test.bench.docs-size.update\` to update baselines, or replace manually in ${resultsPath}:\n${formatResultsJson(measured)}`
    );
  }
}

/** Replace hashed bundle names like q-DJwFLMgz.js with q-xxxxxxxx.js for a fair diff. */
function anonymizeBundles(html: string): string {
  return html.replace(/q-[A-Za-z0-9_-]{8}\.js/g, 'q-xxxxxxxx.js');
}

/** Extract the contents of `<script type="qwik/state" …>…</script>` (first match). */
function extractState(html: string): string | null {
  const m = html.match(/<script type="qwik\/state"[^>]*>([\s\S]*?)<\/script>/);
  return m ? m[1] : null;
}
function removeState(html: string): string {
  return html
    .replace(/<script type="qwik\/state"[^>]*>[\s\S]*?<\/script>/, '[state omitted]\n')
    .replace(/<script type="qwik\/vnode"[^>]*>[\s\S]*?<\/script>/, '[vnode map omitted]\n');
}

/** Route → URL on the previously-deployed build */
function previousUrlFor(route: string): string {
  const path = route === '/' ? '/' : route.endsWith('/') ? route : route + '/';
  return PREVIOUS_BASE_URL + path;
}

function anonymizeState(str: string): string {
  return str
    .replaceAll(/RootRef .*/g, 'RootRef [omitted]')
    .replaceAll(/QRL ".*"/g, 'QRL "[omitted]"');
}

async function diagnoseFailure(route: string, currentHtml: string, rawDiff: number) {
  console.log(`\n[diagnose] ${route}: fetching previous build for comparison…`);
  const url = previousUrlFor(route);
  let previousHtml: string;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[diagnose] ${route}: ${url} returned ${res.status} ${res.statusText}`);
      return;
    }
    previousHtml = await res.text();
  } catch (err) {
    console.warn(
      `[diagnose] ${route}: failed to fetch ${url} — ${err instanceof Error ? err.message : err}`
    );
    return;
  }

  // Apply the same normalization we use for the current measurement so the diff is apples-to-apples.
  previousHtml = previousHtml.replace(/\r\n/g, '\n').replace(/ q:version="[^"]*"/, '');

  let prevAnon = anonymizeBundles(previousHtml);
  let currAnon = anonymizeBundles(currentHtml);

  const prevState = extractState(prevAnon);
  const currState = extractState(currAnon);

  prevAnon = removeState(prevAnon);
  currAnon = removeState(currAnon);

  if (prevState == null || currState == null) {
    console.warn(
      `[diagnose] ${route}: could not locate <script type="qwik/state"> in ${
        prevState == null ? 'previous' : 'current'
      } HTML — skipping state diff.`
    );
  } else {
    const stateDiff = currState.length - prevState.length;
    console.log(
      `[diagnose] ${route}: state JSON size ${prevState.length} → ${currState.length} (${stateDiff >= 0 ? '+' : ''}${stateDiff}B), benchmark raw diff ${rawDiff >= 0 ? '+' : ''}${rawDiff}B`
    );

    if (stateDiff !== 0) {
      try {
        const { _dumpState } = await import('@qwik.dev/core/internal');
        const prevDump = anonymizeState(
          _dumpState(JSON.parse(prevState) as unknown[], false, '', null)
        );
        const currDump = anonymizeState(
          _dumpState(JSON.parse(currState) as unknown[], false, '', null)
        );
        console.log(`\n[diagnose] ${route}: serdes state diff (previous → current):`);
        await printGitDiff(prevDump, currDump, 'state');
      } catch (err) {
        console.warn(`[diagnose] ${route}: failed to produce state dump`, err);
      }
    }

    if (stateDiff === rawDiff) {
      console.log(
        `[diagnose] ${route}: state size diff fully explains the benchmark change — skipping HTML diff.`
      );
      return;
    }
  }

  // Size change is not (fully) explained by state — show a prettier-formatted HTML diff.
  try {
    const prettier = await import('prettier');
    const prevPretty = await prettier.format(prevAnon, { parser: 'html' });
    const currPretty = await prettier.format(currAnon, { parser: 'html' });
    console.log(`\n[diagnose] ${route}: prettier-formatted HTML diff (previous → current):`);
    await printGitDiff(prevPretty, currPretty, 'html');
  } catch (err) {
    console.warn(
      `[diagnose] ${route}: failed to produce HTML diff — ${err instanceof Error ? err.message : err}`
    );
  }
}

async function printGitDiff(previous: string, current: string, label: string) {
  const dir = await mkdtemp(join(tmpdir(), 'docs-size-diag-'));
  const prevPath = join(dir, `previous.${label}`);
  const currPath = join(dir, `current.${label}`);
  await writeFile(prevPath, previous, 'utf-8');
  await writeFile(currPath, current, 'utf-8');
  try {
    await execFileAsync('git', [
      '--no-pager',
      'diff',
      '--no-index',
      '--no-color',
      '--',
      prevPath,
      currPath,
    ]);
    console.log('(no textual differences)');
  } catch (err: any) {
    // git diff --no-index exits 1 when files differ; that's the expected path.
    const stdout = typeof err?.stdout === 'string' ? err.stdout : '';
    if (stdout) {
      process.stdout.write(stdout);
    } else if (err instanceof Error) {
      console.warn(`[diagnose] git diff failed: ${err.message}`);
    }
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

function formatResultsJson(routes: Record<string, RouteResult>): string {
  return JSON.stringify(
    {
      version: VERSION,
      generatedAt: new Date().toISOString(),
      routes: Object.fromEntries(
        Object.entries(routes).map(([route, r]) => [
          route,
          { rawBytes: r.rawBytes, gzipBytes: r.gzipBytes },
        ])
      ),
    },
    null,
    2
  );
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
