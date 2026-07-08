import fs from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { matchesStaticPath } from '../../../middleware/request-handler/static-paths';
import { postBuild } from './post-build';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function tmp() {
  const d = await mkdtemp(join(tmpdir(), 'qr-postbuild-'));
  dirs.push(d);
  return d;
}

interface RunOptions {
  base?: string;
  assetsDir?: string;
  cleanStatic?: boolean;
  missingClientDir?: boolean;
}

/** Run postBuild as viteAdapter invokes it; return the injected arrays and the client dir. */
async function run(
  files: Record<string, string>,
  userStaticPaths: string[],
  opts: RunOptions = {}
) {
  const { base = '/', assetsDir, cleanStatic = false } = opts;
  const clientOutDir = opts.missingClientDir ? join(await tmp(), 'missing') : await tmp();
  const serverOutDir = await tmp();
  for (const [rel, content] of Object.entries(files)) {
    const full = join(clientOutDir, rel);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content);
  }
  await writeFile(
    join(serverOutDir, 'server.js'),
    `export const staticPaths = new Set(['__QWIK_ROUTER_STATIC_PATHS_ARRAY__']);\n` +
      `export const staticPathPrefixes = ['__QWIK_ROUTER_STATIC_PATHS_PREFIXES__'];`
  );
  await postBuild(clientOutDir, serverOutDir, base, assetsDir, userStaticPaths, cleanStatic);
  const code = await readFile(join(serverOutDir, 'server.js'), 'utf-8');
  const paths = JSON.parse(code.match(/new Set\((\[[^\]]*\])\)/)![1]) as string[];
  // Unreplaced placeholder stays single-quoted JS; parse only injected JSON.
  const prefixesSource = code.match(/staticPathPrefixes = (\[[^\]]*\])/)![1];
  const prefixes = prefixesSource.includes("'") ? null : (JSON.parse(prefixesSource) as string[]);
  return { paths, prefixes, clientOutDir };
}

/** Vite client output layout: chunks nest under assetsDir, public files stay at the dist root. */
function distTree(assetsDir?: string) {
  const nested = assetsDir ? `${assetsDir}/` : '';
  return {
    'robots.txt': 'robots',
    '404.html': '<html/>',
    'icons/logo.svg': '<svg/>',
    [`${nested}build/q-chunk.js`]: '// chunk',
    [`${nested}build/sub/q-nested.js`]: '// nested chunk',
    [`${nested}assets/hero-abc123.svg`]: '<svg/>',
    'index.html': '<html/>',
    'profile/index.html': '<html/>',
    'profile/q-loader-WaXl02RHfZE.abc.json': '{}',
    'stale/index.html': '<html/>',
    'stale/q-loader-XyZ.def.json': '{}',
  };
}

const matrix: { label: string; base: string; assetsDir?: string }[] = [
  { label: 'default', base: '/' },
  { label: 'base', base: '/base/' },
  { label: 'assetsDir', base: '/', assetsDir: 'assets-dir' },
  { label: 'base + assetsDir', base: '/base/', assetsDir: 'assets-dir' },
];

describe.each(matrix)('$label', ({ base, assetsDir }) => {
  const nestedPrefix = `${base}${assetsDir ? `${assetsDir}/` : ''}`;
  const routes = [base, `${base}profile/`];

  test('lists root public files at the base, never under assetsDir', async () => {
    const { paths } = await run(distTree(assetsDir), routes, { base, assetsDir });
    expect(paths).toContain(`${base}robots.txt`);
    expect(paths).toContain(`${base}404.html`);
    expect(paths).toContain(`${base}icons/logo.svg`);
    if (assetsDir) {
      expect(paths).not.toContain(`${nestedPrefix}robots.txt`);
    }
  });

  test('excludes qwik build and assets output, with no doubled segments', async () => {
    const { paths } = await run(distTree(assetsDir), routes, { base, assetsDir });
    expect(paths.filter((p) => p.startsWith(`${nestedPrefix}build/`))).toEqual([]);
    expect(paths.filter((p) => p.startsWith(`${nestedPrefix}assets/`))).toEqual([]);
    if (assetsDir) {
      expect(paths.filter((p) => p.includes(`${assetsDir}/${assetsDir}/`))).toEqual([]);
    }
  });

  test('injects base/assetsDir-aware static path prefixes', async () => {
    const { prefixes } = await run(distTree(assetsDir), routes, { base, assetsDir });
    expect(prefixes).toEqual([`${nestedPrefix}build/`, `${nestedPrefix}assets/`]);
  });

  test('cleanStatic keeps prerendered pages of static routes and deletes stale ones', async () => {
    const { paths, clientOutDir } = await run(distTree(assetsDir), routes, {
      base,
      assetsDir,
      cleanStatic: true,
    });
    expect(fs.existsSync(join(clientOutDir, 'index.html'))).toBe(true);
    expect(fs.existsSync(join(clientOutDir, 'profile/index.html'))).toBe(true);
    expect(fs.existsSync(join(clientOutDir, 'stale/index.html'))).toBe(false);
    expect(paths).toContain(`${base}profile/q-loader-WaXl02RHfZE.abc.json`);
    expect(fs.existsSync(join(clientOutDir, 'stale/q-loader-XyZ.def.json'))).toBe(false);
  });
});

test('multi-segment assetsDir prunes nested output without doubling', async () => {
  const { paths } = await run(distTree('foo/bar'), ['/'], { assetsDir: 'foo/bar' });
  expect(paths).toContain('/robots.txt');
  expect(paths.filter((p) => p.includes('build/'))).toEqual([]);
  expect(paths.filter((p) => p.includes('foo/bar/foo/'))).toEqual([]);
});

test('assetsDir named like a qwik dir prunes only the nested output', async () => {
  for (const dir of ['build', 'assets']) {
    const files = { ...distTree(dir), [`${dir}/readme.txt`]: 'public file' };
    const { paths } = await run(files, ['/'], { assetsDir: dir });
    expect(paths).toContain(`/${dir}/readme.txt`);
    expect(
      paths.filter((p) => p.startsWith(`/${dir}/build/`) || p.startsWith(`/${dir}/assets/`))
    ).toEqual([]);
  }
});

test('trailing-slash assetsDir is normalized', async () => {
  const { paths } = await run(distTree('q'), ['/'], { assetsDir: 'q/' });
  expect(paths).toContain('/robots.txt');
  expect(paths.filter((p) => p.includes('//') || p.includes('q/build/'))).toEqual([]);
});

test('lists public files copied directly under the assets dir', async () => {
  const files = { ...distTree('assets-dir'), 'assets-dir/legal.txt': 'terms' };
  const { paths } = await run(files, ['/'], { assetsDir: 'assets-dir' });
  expect(paths).toContain('/assets-dir/legal.txt');
});

test('does not collapse a public dir named like the base segment', async () => {
  const files = { ...distTree(), 'base/logo.png': 'png' };
  const { paths } = await run(files, ['/base/'], { base: '/base/' });
  expect(paths).toContain('/base/base/logo.png');
});

test('missing client dir leaves only the user static paths', async () => {
  const { paths } = await run({}, ['/docs/'], { missingClientDir: true });
  expect(paths).toEqual(['/docs/']);
});

test('keeps user static file paths unmangled and preserves dotted directory routes', async () => {
  const files = { '404.html': '<html/>', 'docs/v1.2/index.html': '<html/>' };
  const { paths, clientOutDir } = await run(files, ['/sitemap.xml', '/docs/v1.2'], {
    cleanStatic: true,
  });
  // Platform-provided file path, absent from dist: must survive un-slashed.
  expect(paths).toContain('/sitemap.xml');
  expect(fs.existsSync(join(clientOutDir, 'docs/v1.2/index.html'))).toBe(true);
});

test('injected arrays drive the runtime matcher end to end', async () => {
  const base = '/base/';
  const { paths, prefixes } = await run(distTree('q'), [base, `${base}profile/`], {
    base,
    assetsDir: 'q',
  });
  const set = new Set(paths);
  expect(matchesStaticPath('GET', '/base/robots.txt', set, prefixes!)).toBe(true);
  expect(matchesStaticPath('GET', '/base/q/build/q-chunk.js', set, prefixes!)).toBe(true);
  expect(matchesStaticPath('GET', '/base/q/assets/hero-abc123.svg', set, prefixes!)).toBe(true);
  expect(matchesStaticPath('GET', '/base/unknown/', set, prefixes!)).toBe(false);
  expect(matchesStaticPath('POST', '/base/robots.txt', set, prefixes!)).toBe(false);
});

test('lists a written loader sidecar of a static route, but not its index.html', async () => {
  const { paths } = await run(
    {
      'blog/index.html': '<html></html>',
      'blog/q-loader-WaXl02RHfZE.abc.json': '{"d":{}}',
    },
    ['/blog/']
  );
  expect(paths).toContain('/blog/');
  expect(paths).toContain('/blog/q-loader-WaXl02RHfZE.abc.json');
  expect(paths).not.toContain('/blog/index.html');
});

test('does not list a loader sidecar whose route is not static', async () => {
  const { paths } = await run({ 'other/q-loader-X.abc.json': '{"d":{}}' }, []);
  expect(paths).not.toContain('/other/q-loader-X.abc.json');
});
