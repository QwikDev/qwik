import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
// built package, not source: the generated modules' bare '@qwik.dev/core' imports resolve to the
// built lib, and ambient state (invoke context, owner) must live in ONE module world
import { renderToString } from '@qwik.dev/core/server';
import { transformModules } from '../../src/index';
import type { SsrRenderRoot } from '../../../qwik/src/server/ssr-render';
import type { RenderToStringOptions } from '../../../qwik/src/server/types';

/**
 * Layer-A harness (spec 08), Phase-0 scope: fixture TSX → compiled SSR modules → rendered shell
 * bytes via the real JS engine. Plan-based rendering plugs into the same fixtures in Phase 3+.
 */

const layerADir = dirname(new URL(import.meta.url).pathname);
const fixturesDir = join(layerADir, 'fixtures');
const generatedDir = join(layerADir, '.generated');

export function listFixtures(): string[] {
  return readdirSync(fixturesDir).sort();
}

export interface FixtureRender {
  name: string;
  html: string;
}

export async function renderFixture(name: string): Promise<FixtureRender> {
  const fixtureDir = join(fixturesDir, name);
  const code = readFileSync(join(fixtureDir, 'input.tsx'), 'utf-8');
  const request = JSON.parse(
    readFileSync(join(fixtureDir, 'request.json'), 'utf-8')
  ) as RenderToStringOptions;

  const result = await transformModules({
    input: [{ path: 'src/input.tsx', code }],
    srcDir: 'src',
    sourceMaps: false,
    transpileTs: true,
    transpileJsx: true,
    isServer: true,
  });
  if (result.diagnostics.length > 0) {
    const messages = result.diagnostics.map((diagnostic) => diagnostic.message).join('\n');
    throw new Error(`fixture "${name}" produced diagnostics:\n${messages}`);
  }

  const outDir = join(generatedDir, name);
  let hasEntry = false;
  for (const module of result.modules) {
    const file = join(outDir, module.path);
    mkdirSync(dirname(file), { recursive: true });
    // bare '@qwik.dev/core' resolves to the same source instance as the harness's own imports
    writeFileSync(file, module.code);
    hasEntry ||= module.path === 'src/input.tsx';
  }
  if (!hasEntry) {
    throw new Error(`fixture "${name}" emitted no entry module`);
  }

  // relative specifier so vite transforms the generated .tsx; query busts the module cache
  const version = createHash('sha256').update(code).digest('hex').slice(0, 12);
  const entry = await import(`./.generated/${name}/src/input.tsx?v=${version}`);
  const root = entry.App as SsrRenderRoot | undefined;
  if (root === undefined) {
    throw new Error(`fixture "${name}" entry module does not export App`);
  }
  const rendered = await renderToString(root as any, request);
  // q:version embeds build timestamp+hash; normalize so goldens survive rebuilds
  const html = rendered.html.replace(/ q:version="[^"]*"/, ' q:version="conformance"');
  return { name, html };
}
