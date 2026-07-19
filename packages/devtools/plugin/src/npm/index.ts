import { ServerContext } from '../types';
import fsp from 'node:fs/promises';
import type {
  DependencyInfo,
  DependencyOperationResult,
  InstallDependencyType,
  NpmInfo,
  PackageSearchResponse,
} from '@qwik.dev/devtools/kit';
import path from 'path';
import createDebug from 'debug';
import {
  buildInstallCommand,
  buildUpdateCommand,
  isValidPackageName,
  resolvePackageProjectContext,
  runPackageCommand,
} from './package-manager';
import {
  createDependencyEntries,
  createDependencyInfo,
  getDependencyType,
} from './dependency-model';
import { fetchPackageMetadata, resolveRegistryUrl, searchRegistryPackages } from './registry';
import { verifyDependencySync } from './package-sync';

export { detectPackageManager } from './package-manager';

const log = createDebug('qwik:devtools:npm');

/**
 * This module intentionally favors readability and non-blocking behavior:
 *
 * - Phase1: fast local scan (node_modules/<pkg>/package.json) with limited concurrency.
 * - Phase2: best-effort background enrich (optional small registry lookup).
 * - RPC calls NEVER wait for heavy work (getAllDependencies returns immediately).
 */

// -----------------------------
// Types & state
// -----------------------------

type DependenciesPhase = 'idle' | 'phase1' | 'phase2' | 'done' | 'error';

export interface DependenciesStatus {
  phase: DependenciesPhase;
  loaded: number;
  total: number;
  startedAt: number | null;
  finishedAt: number | null;
  error?: string;
}

let preloadedDependencies: DependencyInfo[] | null = null;
let isPreloading = false;
let preloadPromise: Promise<DependencyInfo[]> | null = null;

let dependenciesStatus: DependenciesStatus = {
  phase: 'idle',
  loaded: 0,
  total: 0,
  startedAt: null,
  finishedAt: null,
};

// -----------------------------
// Small utilities (kept minimal)
// -----------------------------

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(filePath: string): Promise<any | null> {
  try {
    const content = await fsp.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function findNearestFileUp(startDir: string, fileName: string): Promise<string | null> {
  let currentDir = path.resolve(startDir);
  for (let i = 0; i < 100; i++) {
    const candidate = path.join(currentDir, fileName);
    if (await fileExists(candidate)) {
      return candidate;
    }
    const parent = path.dirname(currentDir);
    if (parent === currentDir) {
      break;
    }
    currentDir = parent;
  }
  return null;
}

function getProjectStartDirFromConfig(config: any): string {
  if (config?.root) {
    return config.root;
  }
  if (config?.configFile) {
    return path.dirname(config.configFile);
  }
  return process.cwd();
}

function getLatestVersionFromMetadata(metadata: any): string | undefined {
  return metadata?.distTags?.latest || metadata?.['dist-tags']?.latest || metadata?.version;
}

function nodeModulesPackageJsonPath(projectRoot: string, name: string): string {
  return path.join(projectRoot, 'node_modules', ...name.split('/'), 'package.json');
}

function deferToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function mapLimit<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) {
        return;
      }
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

// -----------------------------
// Dependencies preload (Phase1 + Phase2)
// -----------------------------

async function phase1LocalIndex(
  projectRoot: string,
  deps: ReturnType<typeof createDependencyEntries>
): Promise<DependencyInfo[]> {
  const localConcurrency = 16;

  return mapLimit(deps, localConcurrency, async ([name, requestedVersion, type]) => {
    const pkgJsonPath = nodeModulesPackageJsonPath(projectRoot, name);
    const installedPkg = await readJsonFile(pkgJsonPath);

    const info = createDependencyInfo({
      name,
      requestedVersion,
      type,
      installedPackage: installedPkg,
    });

    dependenciesStatus.loaded++;
    if (dependenciesStatus.loaded % 50 === 0) {
      await deferToEventLoop();
    }

    return info;
  });
}

async function phase2BackgroundEnrich(projectRoot: string, deps: DependencyInfo[]): Promise<void> {
  const registryUrl = await resolveRegistryUrl(projectRoot);
  const enrichConcurrency = 6;

  await mapLimit(deps, enrichConcurrency, async (dependency) => {
    const metadata = await fetchPackageMetadata(registryUrl, dependency.name);
    if (!metadata) {
      dependency.status = dependency.latestVersion ? dependency.status : 'unknown';
      await deferToEventLoop();
      return dependency;
    }

    const installedPkg = await readJsonFile(
      nodeModulesPackageJsonPath(projectRoot, dependency.name)
    );
    const enriched = createDependencyInfo({
      name: dependency.name,
      requestedVersion: dependency.requestedVersion,
      type: dependency.type,
      installedPackage: installedPkg,
      registryMetadata: metadata,
    });

    Object.assign(dependency, enriched);
    await deferToEventLoop();
    return dependency;
  });
}

async function preloadDependencies(config: any): Promise<DependencyInfo[]> {
  if (preloadedDependencies) {
    return preloadedDependencies;
  }
  if (isPreloading && preloadPromise) {
    return preloadPromise;
  }

  isPreloading = true;
  dependenciesStatus = {
    phase: 'phase1',
    loaded: 0,
    total: 0,
    startedAt: Date.now(),
    finishedAt: null,
  };

  preloadPromise = (async () => {
    const startDir = getProjectStartDirFromConfig(config);
    const packageJsonPath = await findNearestFileUp(startDir, 'package.json');
    if (!packageJsonPath) {
      preloadedDependencies = [];
      dependenciesStatus.phase = 'done';
      dependenciesStatus.finishedAt = Date.now();
      isPreloading = false;
      return [];
    }

    const projectRoot = path.dirname(packageJsonPath);
    const pkg = await readJsonFile(packageJsonPath);

    const entries = createDependencyEntries(pkg);
    dependenciesStatus.total = entries.length;

    try {
      const list = await phase1LocalIndex(projectRoot, entries);
      preloadedDependencies = list;
      dependenciesStatus.phase = 'phase2';

      // Phase2 runs truly in background; never blocks Phase1 result.
      void (async () => {
        try {
          await phase2BackgroundEnrich(projectRoot, list);
          dependenciesStatus.phase = 'done';
        } catch (e) {
          dependenciesStatus.phase = 'error';
          dependenciesStatus.error = e instanceof Error ? e.message : String(e);
        } finally {
          dependenciesStatus.finishedAt = Date.now();
          isPreloading = false;
        }
      })();

      log(`[Qwik DevTools] ✓ Phase1 preloaded ${list.length} dependencies (local-first)`);
      return list;
    } catch (e) {
      preloadedDependencies = [];
      dependenciesStatus.phase = 'error';
      dependenciesStatus.error = e instanceof Error ? e.message : String(e);
      dependenciesStatus.finishedAt = Date.now();
      isPreloading = false;
      log('[Qwik DevTools] ✗ Failed to preload dependencies (local-first):', e);
      return [];
    }
  })();

  return preloadPromise;
}

// Export function to start preloading from plugin initialization
export async function startPreloading({ config }: { config: any }) {
  const startTime = Date.now();
  log('[Qwik DevTools] 🚀 Initiating dependency preload (background)...');

  // Start preloading in background, don't wait for it
  preloadDependencies(config)
    .then(() => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      log(`[Qwik DevTools] ⚡ Preload completed in ${duration}s`);
    })
    .catch((err) => {
      log('[Qwik DevTools] ✗ Preload failed:', err);
    });

  // Return immediately, don't block
  return Promise.resolve();
}

export function getNpmFunctions({ config }: ServerContext) {
  const refreshDependencyCache = async (): Promise<DependencyInfo[]> => {
    preloadedDependencies = null;
    isPreloading = false;
    preloadPromise = null;
    dependenciesStatus = {
      phase: 'idle',
      loaded: 0,
      total: 0,
      startedAt: null,
      finishedAt: null,
    };
    return preloadDependencies(config);
  };

  return {
    async getQwikPackages(): Promise<NpmInfo> {
      const startDir = getProjectStartDirFromConfig(config);
      const pathToPackageJson = await findNearestFileUp(startDir, 'package.json');
      if (!pathToPackageJson) {
        return [];
      }

      try {
        const pkg = await readJsonFile(pathToPackageJson);
        return Object.entries<string>(pkg.devDependencies).filter(([key]) => /@qwik/i.test(key));
      } catch (error) {
        return [];
      }
    },

    async getAllDependencies(): Promise<DependencyInfo[]> {
      // Return preloaded data immediately if available
      if (preloadedDependencies) {
        log('[Qwik DevTools] Returning preloaded dependencies');
        return preloadedDependencies;
      }

      // If preloading is in progress, NEVER wait (avoid blocking the whole dev server / UI).
      if (isPreloading) {
        return [];
      }

      // If preloading hasn't started (shouldn't happen), start it now
      log('[Qwik DevTools] Warning: Preload not started, starting now...');
      void preloadDependencies(config);
      return [];
    },

    async getDependenciesStatus() {
      return dependenciesStatus;
    },

    async refreshDependencies(): Promise<DependencyInfo[]> {
      return refreshDependencyCache();
    },

    async searchPackages(query: string): Promise<PackageSearchResponse> {
      const trimmedQuery = query.trim();
      if (!trimmedQuery) {
        return { results: [] };
      }

      try {
        const startDir = getProjectStartDirFromConfig(config);
        const pathToPackageJson = await findNearestFileUp(startDir, 'package.json');
        const projectRoot = pathToPackageJson ? path.dirname(pathToPackageJson) : startDir;
        const registryUrl = await resolveRegistryUrl(projectRoot);
        const dependencies = preloadedDependencies || (await preloadDependencies(config));
        const installedVersions = new Map(
          dependencies.map((dependency) => [dependency.name, dependency.currentVersion])
        );

        return {
          results: await searchRegistryPackages(registryUrl, trimmedQuery, installedVersions),
        };
      } catch (error) {
        return {
          results: [],
          error: error instanceof Error ? error.message : 'Package search failed',
        };
      }
    },

    async installPackage(
      packageName: string,
      dependencyType: InstallDependencyType = 'devDependencies'
    ): Promise<DependencyOperationResult> {
      try {
        if (!isValidPackageName(packageName)) {
          return {
            success: false,
            action: 'install',
            packageName,
            error: `Invalid package name: ${packageName}`,
          };
        }

        const startDir = getProjectStartDirFromConfig(config);
        const context = await resolvePackageProjectContext(startDir);
        const command = buildInstallCommand(context, packageName, dependencyType);

        await runPackageCommand(command);
        await refreshDependencyCache();
        return { success: true, action: 'install', packageName };
      } catch (error) {
        return {
          success: false,
          action: 'install',
          packageName,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
      }
    },

    async updatePackage(packageName: string): Promise<DependencyOperationResult> {
      try {
        if (!isValidPackageName(packageName)) {
          return {
            success: false,
            action: 'update',
            packageName,
            error: `Invalid package name: ${packageName}`,
          };
        }

        const startDir = getProjectStartDirFromConfig(config);
        const context = await resolvePackageProjectContext(startDir);
        const pkg = context.packageJsonPath ? await readJsonFile(context.packageJsonPath) : null;
        const dependencyType = getDependencyType(pkg, packageName);

        if (!dependencyType) {
          return {
            success: false,
            action: 'update',
            packageName,
            error: `${packageName} is not installed in package.json`,
          };
        }

        const registryUrl = await resolveRegistryUrl(context.projectRoot);
        const metadata = await fetchPackageMetadata(registryUrl, packageName);
        const expectedVersion = getLatestVersionFromMetadata(metadata);
        const command = buildUpdateCommand(context, packageName, dependencyType);
        const commandResult = await runPackageCommand(command);
        const verification = await verifyDependencySync({
          projectRoot: context.projectRoot,
          workspaceRoot: context.workspaceRoot,
          workspacePackageSelector: context.workspacePackageSelector,
          packageName,
          dependencyType,
          expectedVersion,
          packageManager: context.packageManager,
        });

        if (!verification.success) {
          const commandOutput = [commandResult.stderr.trim(), commandResult.stdout.trim()]
            .filter(Boolean)
            .join('\n');
          return {
            success: false,
            action: 'update',
            packageName,
            error: [verification.error, commandOutput].filter(Boolean).join('\n'),
          };
        }

        await refreshDependencyCache();
        return { success: true, action: 'update', packageName };
      } catch (error) {
        return {
          success: false,
          action: 'update',
          packageName,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
      }
    },
  };
}
