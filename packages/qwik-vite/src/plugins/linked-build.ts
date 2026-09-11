import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Rolldown } from 'vite';
import { pipeline } from '@qwik.dev/compiler';

const prefix = '\0qwik-linked:';
export const isLinkedBuildId = (id: string) => id.startsWith(prefix);
const normalize = (path: string) => path.replaceAll('\\', '/');

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
  onOutput: (output: pipeline.GenerateOutput) => void;
}

/** Collect through bundler hooks, then emit from one application-wide link. */
export function createLinkedBuild() {
  const plans = new Map<string, pipeline.ModulePlan>();
  const files = new Map<string, pipeline.GenerateOutput['modules'][number]>();
  const owners = new Map<string, string>();
  const resolver: pipeline.ResolverSnapshot = { edges: {} };
  let options: LinkedBuildOptions | undefined;
  let entries: pipeline.LinkEntry[] = [];
  let pending: Promise<void> | undefined;
  let library: pipeline.LibraryPlan | undefined;

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

  async function finishBuild(ctx: Rolldown.PluginContext) {
    const config = options!;
    const visited = new Map<string, boolean>();
    const collect = async (id: string, isRuntime = true): Promise<void> => {
      if (visited.get(id) === true || (visited.has(id) && !isRuntime)) {
        return;
      }
      visited.set(id, isRuntime);
      if (!plans.has(id)) {
        await ctx.load({ id, resolveDependencies: false });
      }
      const plan = plans.get(id);
      if (plan === undefined) {
        return;
      }
      if (isRuntime && !config.server && !config.library) {
        const strippedExport = plan.exports.find(
          (entry) =>
            entry.e !== pipeline.ExportKind.Star && config.stripExports?.includes(entry.exported)
        );
        const boundaryNames = [
          ...plan.imports.filter((entry) => !entry.typeOnly).map((entry) => entry.imported),
          ...plan.qrls.map((qrl) => qrl.ctxName),
        ];
        const strippedBoundary = boundaryNames.find((name) =>
          config.stripCtxName?.some((prefix) => name.startsWith(prefix))
        );
        if (strippedExport !== undefined || strippedBoundary !== undefined) {
          throw new Error(
            `Linked build requires server-only stripping in ${id}; this pipeline feature is not implemented yet`
          );
        }
      }
      const edges = (resolver.edges[id] ??= {});
      for (const edge of plan.edges) {
        if (edges[edge.id] !== undefined) {
          const existing = edges[edge.id];
          if (existing.r === pipeline.ResolutionKind.Resolved) {
            await collect(existing.path, isRuntime && !edge.typeOnly);
          }
          continue;
        }
        const target = await ctx.resolve(edge.specifier, id, { skipSelf: false });
        if (target === null && edge.typeOnly) {
          edges[edge.id] = { r: pipeline.ResolutionKind.External };
          continue;
        }
        if (target === null) {
          throw new Error(`Cannot resolve ${edge.specifier} from ${id}`);
        }
        const targetId = normalize(target.id);
        const companion = `${targetId}.qwik-plan.json`;
        if (!targetId.startsWith('\0') && existsSync(companion)) {
          ctx.addWatchFile(companion);
          const artifact = pipeline.readLibraryPlan(readFileSync(companion, 'utf8'));
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
                value.r === pipeline.ResolutionKind.Resolved
                  ? { ...value, path: relocate(value.path) }
                  : value,
              ])
            );
          }
          edges[edge.id] = {
            r: pipeline.ResolutionKind.Resolved,
            path: relocate(libraryEntry.module),
            sideEffects: pipeline.SideEffects.Unknown,
          };
          await collect(relocate(libraryEntry.module), isRuntime && !edge.typeOnly);
        } else if (
          target.external ||
          !/\.[cm]?[jt]sx?(?:\?|$)/.test(targetId) ||
          targetId.includes('/node_modules/')
        ) {
          edges[edge.id] = { r: pipeline.ResolutionKind.External };
        } else {
          await collect(targetId, isRuntime && !edge.typeOnly);
          edges[edge.id] = plans.has(targetId)
            ? {
                r: pipeline.ResolutionKind.Resolved,
                path: targetId,
                sideEffects: pipeline.SideEffects.Unknown,
              }
            : { r: pipeline.ResolutionKind.External };
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
      entries.push({ kind: pipeline.EntryKind.Module, module: id, exposeExports: true });
    }
    const modules = [...plans.values()];
    if (config.library) {
      library = pipeline.createLibraryPlan(modules, entries, resolver);
    }
    const linked = pipeline.linkPlans(
      modules,
      entries,
      {
        environment: config.server ? pipeline.Environment.Server : pipeline.Environment.Browser,
        mode: config.library
          ? pipeline.BuildMode.Lib
          : config.development
            ? pipeline.BuildMode.Dev
            : pipeline.BuildMode.Prod,
        stripExports: [],
      },
      resolver,
      { claims: [], policies: [], emissions: [] },
      true
    );
    if (linked.kind === pipeline.LinkResultKind.Failed) {
      throw new Error(linked.diagnostics.map((diagnostic) => diagnostic.message).join('\n'));
    }
    if (linked.plan.diagnostics.length > 0) {
      throw new Error(
        linked.plan.diagnostics.map(({ diagnostic }) => diagnostic.message).join('\n')
      );
    }
    const output = await (config.server ? pipeline.generateJsSsr : pipeline.generateJsCsr)(
      linked.plan,
      {
        rootDir: config.rootDir,
        outputSourceMaps: config.sourceMaps,
        explicitExtensions: true,
      }
    );
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
      !/\.[cm]?[jt]sx?$/.test(id)
    ) {
      return null;
    }
    const plan = await pipeline.analyseModule(
      { path: id, code },
      { transpileTs: true, rootDir: options.rootDir, scope: options.scope }
    );
    plans.set(id, plan);
    const hasDefault = plan.exports.some(
      (entry) => entry.e !== pipeline.ExportKind.Star && entry.exported === 'default'
    );
    return {
      code: `export * from ${JSON.stringify(virtual(id))};\n${hasDefault ? `export { default } from ${JSON.stringify(virtual(id))};` : ''}`,
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
    const generated = normalize(resolve(dirname(file), id));
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
    if (target?.r === pipeline.ResolutionKind.Resolved) {
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
      ctx.emitFile({
        type: 'asset',
        fileName: `${chunk.fileName}.qwik-plan.json`,
        source: JSON.stringify(pipeline.createLibraryPlan([...plans.values()], [entry], resolver)),
      });
    }
  }

  return { buildStart, transform, resolveId, load, generateBundle, getPlan: () => library };
}
