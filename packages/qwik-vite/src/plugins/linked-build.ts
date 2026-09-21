import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Rolldown } from 'vite';
import {
  BuildMode,
  EntryKind,
  Environment,
  ExportKind,
  GenerateOutput,
  LibraryPlan,
  LinkEntry,
  LinkResultKind,
  ModulePlan,
  ResolutionKind,
  ResolverSnapshot,
  SideEffects,
  analyseModule,
  createLibraryPlan,
  generateJsCsr,
  generateJsSsr,
  linkPlans,
  readLibraryPlan,
} from '@qwik.dev/compiler';

const prefix = '\0qwik-linked:';
export const isLinkedBuildId = (id: string) => id.startsWith(prefix);
const normalize = (path: string) => path.replaceAll('\\', '/');
// Markdown arrives as authored JSX from the router's transform, so it compiles like a script.
const SCRIPT_ID = /\.(?:[cm]?[jt]sx?|mdx?|markdown)(?:\?|$)/;
/**
 * A generated module may carry a query (`photo.png.h4sh.qwik.jsx?jsx=&w=100`): the plan and its
 * chunks need a path a file system and a bundler both accept, so the query folds into the name.
 */
function planPath(id: string): string {
  const query = id.indexOf('?');
  if (query === -1) {
    return id;
  }
  const file = id.slice(0, query);
  const extension = file.match(/\.[cm]?[jt]sx?$/)?.[0] ?? '';
  return `${file.slice(0, file.length - extension.length)}__${id.slice(query + 1).replace(/[^A-Za-z0-9]+/g, '_')}${extension}`;
}

export interface LinkedBuildOptions {
  entries: string[];
  rootDir: string;
  scope?: string;
  server: boolean;
  library: boolean;
  development: boolean;
  sourceMaps: boolean;
  stripExports?: string[];
  stripCtxName?: string[];
  regCtxName?: string[];
  buildConstants?: Readonly<Record<string, boolean>>;
  onOutput: (output: GenerateOutput) => void;
}

/** Collect through bundler hooks, then emit from one application-wide link. */
export function createLinkedBuild() {
  const plans = new Map<string, ModulePlan>();
  const files = new Map<string, GenerateOutput['modules'][number]>();
  const owners = new Map<string, string>();
  const resolver: ResolverSnapshot = { edges: {} };
  let options: LinkedBuildOptions | undefined;
  let entries: LinkEntry[] = [];
  let pending: Promise<void> | undefined;
  let library: LibraryPlan | undefined;

  const virtual = (id: string) => prefix + id;

  async function buildStart(_ctx: Rolldown.PluginContext, config: LinkedBuildOptions) {
    options = config;
    plans.clear();
    files.clear();
    owners.clear();
    resolver.edges = {};
    entries = [];
    library = undefined;
    pending = undefined;
  }

  /** Loads an asset through the bundler and keeps its output as an ordinary plan module. */
  async function collectAsset(
    ctx: Rolldown.PluginContext,
    targetId: string,
    resolvedId: string
  ): Promise<string | null> {
    // The plan owns this module now, so its id must not still read as the asset's own type:
    // vite's css plugins match on the extension anywhere in the id, trailing suffix or not.
    const path = `${targetId.replace(/[.?&=#]/g, '_')}.js`;
    if (plans.has(path)) {
      return path;
    }
    const info = await ctx.load({ id: resolvedId, resolveDependencies: false });
    const code = (info as { code?: string } | null)?.code;
    if (typeof code !== 'string') {
      return null;
    }
    plans.set(
      path,
      await analyseModule({ path, code }, { rootDir: options!.rootDir, scope: options!.scope })
    );
    return path;
  }

  async function finishBuild(ctx: Rolldown.PluginContext) {
    const config = options!;
    const visited = new Map<string, boolean>();
    const collect = async (id: string, isRuntime = true, loadId = id): Promise<void> => {
      if (visited.get(id) === true || (visited.has(id) && !isRuntime)) {
        return;
      }
      visited.set(id, isRuntime);
      if (!plans.has(id)) {
        await ctx.load({ id: loadId, resolveDependencies: false });
      }
      const plan = plans.get(id);
      if (plan === undefined) {
        return;
      }
      const edges = (resolver.edges[id] ??= {});
      for (const edge of plan.edges) {
        const inherited = edges[edge.id];
        if (inherited?.r === ResolutionKind.Resolved) {
          await collect(inherited.path, isRuntime && !edge.typeOnly);
          continue;
        }
        // A library plan pins only what the library could see. Anything it left external gets
        // one more chance here: the application may provide it, a router's route table say.
        const target = await ctx.resolve(edge.specifier, id, { skipSelf: false });
        if (target === null) {
          if (inherited !== undefined || edge.typeOnly) {
            edges[edge.id] = { r: ResolutionKind.External };
            continue;
          }
          throw new Error(`Cannot resolve ${edge.specifier} from ${id}`);
        }
        const targetId = normalize(target.id);
        const companion = `${targetId}.qwik-plan.json`;
        if (!targetId.startsWith('\0') && existsSync(companion)) {
          ctx.addWatchFile(companion);
          const artifact = readLibraryPlan(readFileSync(companion, 'utf8'));
          const relocate = (path: string) => normalize(resolve(`${companion}.modules`, path));
          const libraryEntry = artifact.entries[0];
          if (libraryEntry === undefined) {
            throw new Error(`Library plan has no entry: ${companion}`);
          }
          for (const module of artifact.modules) {
            const path = relocate(module.path);
            plans.set(path, { ...module, path });
            resolver.edges[path] = Object.fromEntries(
              Object.entries(artifact.resolver.edges[module.path] ?? {}).map(([key, value]) => [
                key,
                value.r === ResolutionKind.Resolved
                  ? { ...value, path: relocate(value.path) }
                  : value,
              ])
            );
          }
          edges[edge.id] = {
            r: ResolutionKind.Resolved,
            path: relocate(libraryEntry.module),
            sideEffects: SideEffects.Unknown,
          };
          await collect(relocate(libraryEntry.module), isRuntime && !edge.typeOnly);
        } else if (target.external || targetId.includes('/node_modules/')) {
          edges[edge.id] = { r: ResolutionKind.External };
        } else if (!SCRIPT_ID.test(targetId)) {
          // An asset the bundler inlines (`?inline`, `?raw`) is a module once loaded, so the plan
          // carries its resolved value instead of an import the consumer could never resolve.
          const carried = await collectAsset(ctx, targetId, target.id);
          if (carried !== null) {
            // a generated module (a route table, say) has imports of its own to follow
            await collect(carried, isRuntime && !edge.typeOnly);
          }
          edges[edge.id] =
            carried === null
              ? { r: ResolutionKind.External }
              : { r: ResolutionKind.Resolved, path: carried, sideEffects: SideEffects.Unknown };
        } else {
          const planned = planPath(targetId);
          await collect(planned, isRuntime && !edge.typeOnly, target.id);
          edges[edge.id] = plans.has(planned)
            ? {
                r: ResolutionKind.Resolved,
                path: planned,
                sideEffects: SideEffects.Unknown,
              }
            : { r: ResolutionKind.External };
        }
      }
    };
    for (const entry of config.entries.length > 0 ? config.entries : [...plans.keys()]) {
      const target = await ctx.resolve(entry, undefined, { skipSelf: false });
      if (target === null || target.external) {
        throw new Error(`Cannot resolve application entry ${entry}`);
      }
      const id = normalize(target.id);
      await collect(id);
      entries.push({ kind: EntryKind.Module, module: id, exposeExports: true });
    }
    const modules = [...plans.values()];
    if (config.library) {
      library = createLibraryPlan(modules, entries, resolver) ?? undefined;
    }
    const linked = linkPlans(
      modules,
      entries,
      {
        environment: config.server ? Environment.Server : Environment.Browser,
        mode: config.library ? BuildMode.Lib : config.development ? BuildMode.Dev : BuildMode.Prod,
        strip: {
          exports: config.stripExports ?? [],
          ctxName: config.stripCtxName ?? [],
          regCtxName: config.regCtxName ?? [],
        },
        ...(config.buildConstants === undefined ? {} : { constants: config.buildConstants }),
      },
      resolver,
      true
    );
    if (linked.kind === LinkResultKind.Failed) {
      throw new Error(linked.diagnostics.map((diagnostic) => diagnostic.message).join('\n'));
    }
    if (linked.plan.diagnostics.length > 0) {
      throw new Error(
        linked.plan.diagnostics
          .map(
            ({ module, diagnostic }) =>
              `${linked.plan.modules[module]?.path ?? module}: ${diagnostic.message}`
          )
          .join('\n')
      );
    }
    const output = await (config.server ? generateJsSsr : generateJsCsr)(linked.plan, {
      rootDir: config.rootDir,
      outputSourceMaps: config.sourceMaps,
      explicitExtensions: true,
    });
    for (const file of output.modules) {
      const id = normalize(file.path);
      files.set(id, file);
      owners.set(id, file.origPath ?? id);
      if (!config.server && file.segment !== null) {
        ctx.emitFile({ type: 'chunk', id: virtual(id), preserveSignature: 'allow-extension' });
      }
    }
    config.onOutput(output);
  }

  async function transform(code: string, id: string): Promise<Rolldown.SourceDescription | null> {
    if (
      options === undefined ||
      id.startsWith('\0') ||
      id.includes('/node_modules/') ||
      !SCRIPT_ID.test(id)
    ) {
      return null;
    }
    const path = planPath(id);
    const plan = await analyseModule(
      { path, code },
      { transpileTs: true, rootDir: options.rootDir, scope: options.scope }
    );
    plans.set(path, plan);
    const hasDefault = plan.exports.some(
      (entry) => entry.e !== ExportKind.Star && entry.exported === 'default'
    );
    return {
      code: `export * from ${JSON.stringify(virtual(path))};\n${hasDefault ? `export { default } from ${JSON.stringify(virtual(path))};` : ''}`,
      map: null,
    };
  }

  async function load(
    ctx: Rolldown.PluginContext,
    id: string
  ): Promise<Rolldown.SourceDescription | null> {
    if (!id.startsWith(prefix)) {
      return null;
    }
    await (pending ??= finishBuild(ctx));
    const file = files.get(id.slice(prefix.length));
    if (file === undefined) {
      throw new Error(`Missing linked output: ${id}`);
    }
    return { code: file.code, map: file.map, meta: { segment: file.segment } };
  }

  async function resolveId(
    ctx: Rolldown.PluginContext,
    id: string,
    importer?: string
  ): Promise<string | Rolldown.ResolvedId | null> {
    if (id.startsWith(prefix)) {
      return id;
    }
    if (!importer?.startsWith(prefix)) {
      return null;
    }
    const file = importer.slice(prefix.length);
    // `join`, not `resolve`: a generated importer (`virtual:/…`) is not an absolute path
    const generated = normalize(join(dirname(file), id));
    if (id.startsWith('.') && files.has(generated)) {
      return virtual(generated);
    }
    if (id.startsWith('.') && files.has(`${generated}.js`)) {
      return virtual(`${generated}.js`);
    }
    const owner = owners.get(file) ?? file;
    const plan = plans.get(owner);
    const edge = plan?.edges.find((edge) => edge.specifier === id && !edge.typeOnly);
    const target = edge === undefined ? undefined : resolver.edges[owner]?.[edge.id];
    if (target?.r === ResolutionKind.Resolved) {
      return virtual(target.path);
    }
    return ctx.resolve(id, owner, { skipSelf: false });
  }

  function generateBundle(ctx: Rolldown.PluginContext, bundle: Rolldown.OutputBundle) {
    if (library === undefined) {
      return;
    }
    for (const chunk of Object.values(bundle)) {
      if (chunk.type !== 'chunk' || !chunk.isEntry || chunk.facadeModuleId === null) {
        continue;
      }
      const entry = entries.find((entry) => entry.module === chunk.facadeModuleId);
      if (entry === undefined) {
        continue;
      }
      const plan = createLibraryPlan([...plans.values()], [entry], resolver);
      if (plan === null) {
        continue;
      }
      ctx.emitFile({
        type: 'asset',
        fileName: `${chunk.fileName}.qwik-plan.json`,
        source: JSON.stringify(plan),
      });
    }
  }

  return { buildStart, transform, resolveId, load, generateBundle, getPlan: () => library };
}
