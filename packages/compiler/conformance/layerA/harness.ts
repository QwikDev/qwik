import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
// built package, not source: the generated modules' bare '@qwik.dev/core' imports resolve to the
// built lib, and ambient state (invoke context, owner) must live in ONE module world
import { renderToStream, renderToString } from '@qwik.dev/core/server';
import type { TransformModulesOptions } from '@qwik.dev/optimizer';
import type { QwikModulePlan } from '../../src/emit-plan';
import { transformModules } from '../../src/index';
import { linkSsrPlan, type QwikSsrPlan } from '../../src/link-plan';
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
  /** Versioned `.generated` subdir (name-hash) holding this render's emitted modules. */
  generatedName: string;
  html: string;
  /** Out-of-order stream chunks — present only for fixtures with `"stream": true`. */
  chunks?: string[];
  /** Linked entry-rooted plan — the future engine input, goldened beside the shell. */
  plan: QwikSsrPlan;
}

/** `request.json` shape: render options plus the harness-only `stream` flag. */
export type FixtureRequest = RenderToStringOptions & { stream?: boolean };

export function readFixtureRequest(name: string): FixtureRequest {
  return JSON.parse(
    readFileSync(join(fixturesDir, name, 'request.json'), 'utf-8')
  ) as FixtureRequest;
}

// q:version embeds build timestamp+hash; normalize so goldens survive rebuilds
const normalizeVersion = (html: string) =>
  html.replace(/ q:version="[^"]*"/, ' q:version="conformance"');

export async function renderFixtureRoot(
  root: SsrRenderRoot,
  request: FixtureRequest
): Promise<{ html: string; chunks?: string[] }> {
  const { stream: streamFlag, ...opts } = request;
  if (streamFlag !== true) {
    const rendered = await renderToString(root as any, opts);
    return { html: normalizeVersion(rendered.html) };
  }
  const chunks: string[] = [];
  await renderToStream(
    root as any,
    {
      ...opts,
      stream: {
        write(chunk: string) {
          chunks.push(chunk);
        },
      },
    } as any
  );
  const normalized = chunks.map(normalizeVersion);
  return { html: normalized.join(''), chunks: normalized };
}

/** The compiler leaves `nativeFrom` paths unresolved — it has no filesystem; builds resolve them. */
function resolveNativeTargets(plan: QwikModulePlan, fixtureDir: string): QwikModulePlan {
  if ((plan.pluginFns?.length ?? 0) === 0) {
    return plan;
  }
  return {
    ...plan,
    pluginFns: plan.pluginFns.map((fn) => ({
      ...fn,
      targets: Object.fromEntries(
        Object.entries(fn.targets).map(([target, value]) => {
          const path = (value as { path?: string }).path;
          if (path === undefined) {
            return [target, value];
          }
          const resolved = join(fixtureDir, path);
          // a directory is that language's package; a file is source to splice
          return statSync(resolved).isDirectory()
            ? [target, { package: resolved }]
            : [target, { source: readFileSync(resolved, 'utf-8') }];
        })
      ),
    })),
  };
}

export async function renderFixture(name: string): Promise<FixtureRender> {
  const fixtureDir = join(fixturesDir, name);
  const sourceFiles = readdirSync(fixtureDir)
    .filter((file) => file.endsWith('.tsx'))
    .sort();
  const input = sourceFiles.map((file) => ({
    path: `src/${file}`,
    code: readFileSync(join(fixtureDir, file), 'utf-8'),
  }));
  const request = readFixtureRequest(name);

  const result = await transformModules({
    input,
    srcDir: 'src',
    sourceMaps: false,
    transpileTs: true,
    transpileJsx: true,
    isServer: true,
    emitPlan: true,
  } as TransformModulesOptions & { emitPlan: boolean });
  if (result.diagnostics.length > 0) {
    const messages = result.diagnostics.map((diagnostic) => diagnostic.message).join('\n');
    throw new Error(`fixture "${name}" produced diagnostics:\n${messages}`);
  }

  // versioned by emitted code: compiler changes mint fresh module URLs for every chunk,
  // since only the entry gets a cache-busting query and chunk imports are bare specifiers
  const version = createHash('sha256')
    .update(result.modules.map((module) => module.code).join('\0'))
    .digest('hex')
    .slice(0, 12);
  const outDir = join(generatedDir, `${name}-${version}`);
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

  const entry = await import(`./.generated/${name}-${version}/src/input.tsx`);
  const root = entry.App as SsrRenderRoot | undefined;
  if (root === undefined) {
    throw new Error(`fixture "${name}" entry module does not export App`);
  }
  const modulePlans = result.modules
    .filter((module) => module.path.endsWith('.plan.json'))
    .map((module) => resolveNativeTargets(JSON.parse(module.code) as QwikModulePlan, fixtureDir))
    .sort((left, right) => left.path.localeCompare(right.path));
  if (modulePlans.length === 0) {
    throw new Error(`fixture "${name}" emitted no module plan`);
  }
  const plan = linkSsrPlan(modulePlans, 'App', 'src/input.tsx');
  if (plan === null) {
    throw new Error(`fixture "${name}" has no App entry component`);
  }
  if (plan.unresolved.length > 0) {
    throw new Error(`fixture "${name}" plan has unresolved targets: ${plan.unresolved.join(', ')}`);
  }

  const { html, chunks } = await renderFixtureRoot(root, request);
  return {
    name,
    generatedName: `${name}-${version}`,
    html,
    ...(chunks !== undefined ? { chunks } : {}),
    plan,
  };
}
