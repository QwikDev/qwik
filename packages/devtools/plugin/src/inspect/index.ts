import fs from 'node:fs/promises';
import { parseQwikCode } from '../parse/parse';
import { ServerContext } from '../types';
import createDebug from 'debug';

const log = createDebug('qwik:devtools:inspect');
const codeStringCache = new Map<string, ReturnType<typeof parseQwikCode>>();

function parseCodeWithCache(code: string) {
  const hit = codeStringCache.get(code);
  if (hit) return hit;
  const parsed = parseQwikCode(code);
  codeStringCache.set(code, parsed);
  return parsed;
}

function parseLoadedWithCache(loaded: any) {
  if (typeof loaded === 'string') return parseCodeWithCache(loaded);
  if (loaded && typeof (loaded as any).code === 'string')
    return parseCodeWithCache((loaded as any).code as string);
  return null;
}

export function getModulesContent(ctx: ServerContext) {
  let isAddRoot = (pathId: string) =>
    pathId.includes(ctx.config.root) || pathId.includes('/@fs')
      ? pathId
      : `${ctx.config.root}${pathId}`;
  return {
    getModulesByPathIds: async (pathIds: string | string[]) => {
      let pathIdsList: string[] = [];

      if (!pathIds || pathIds.length === 0) {
        return [];
      }

      if (Array.isArray(pathIds)) {
        pathIdsList = pathIds;
      } else {
        pathIdsList = [pathIds];
      }
      const modules = await Promise.all(
        pathIdsList.map(async (pathId) => {
          try {
            const modules = await ctx.server.transformRequest(isAddRoot(pathId));
            return {
              pathId,
              modules,
            };
          } catch (error) {
            log(`Failed to transform request for ${pathId}:`, error);
            return {
              pathId,
              modules: null,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        })
      );

      if (modules.length > 0) {
        return modules;
      }
      return [];
    },
    parseQwikCode: async (pathId: string) => {
      try {
        const id = isAddRoot(pathId);
        const resolved = await ctx.server.pluginContainer.resolveId(id);

        const rid = resolved?.id ?? id;
        const mod = ctx.server.moduleGraph.getModuleById(rid);

        const tryReadOriginalFromVirtual = async (virtualId: string) => {
          if (virtualId.includes('node_modules')) return null;
          const matchTsLike = virtualId.match(/^(.*?\.(?:tsx|ts|jsx|js|mjs|cjs))_/);
          const sourceId = matchTsLike?.[1] ?? null;
          if (!sourceId) return null;

          try {
            const sourceResolved = await ctx.server.pluginContainer.resolveId(sourceId);
            let filePath = sourceResolved?.id ?? sourceId;
            if (filePath.startsWith('/@fs/')) filePath = filePath.slice(4);
            filePath = filePath.replace(/\?[?#].*$/, '');
            await fs.access(filePath);
            const raw = await fs.readFile(filePath, 'utf-8');
            return parseCodeWithCache(raw);
          } catch (e) {
            return null;
          }
        };

        const originalFromVirtual = await tryReadOriginalFromVirtual(rid);
        if (originalFromVirtual) return originalFromVirtual;
        const loaded = await ctx.server.pluginContainer.load(rid);
        const fromLoaded = parseLoadedWithCache(loaded);
        if (fromLoaded) return fromLoaded;

        if (mod?.file) {
          try {
            await fs.access(mod.file);
            const raw = await fs.readFile(mod.file, 'utf-8');
            return parseCodeWithCache(raw);
          } catch {}
        }

        return [];
      } catch (error) {
        log(`Failed to parse qwik code for ${pathId}:`, error);
        return [];
      }
    },
  };
}
