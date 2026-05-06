import { ServerContext } from '../types';
import fsp from 'node:fs/promises';
import { NpmInfo } from '@qwik.dev/devtools/kit';
import { execSync } from 'child_process';
import path from 'path';
import createDebug from 'debug';

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

interface DependencyInfo {
  name: string;
  version: string;
  description: string;
  author?: any;
  homepage?: string;
  repository?: string;
  npmUrl: string;
  iconUrl: string | null;
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

function nodeModulesPackageJsonPath(projectRoot: string, name: string): string {
  return path.join(projectRoot, 'node_modules', ...name.split('/'), 'package.json');
}

function normalizeRepositoryUrl(repository: any): string | undefined {
  const url = typeof repository === 'string' ? repository : repository?.url;
  if (!url || typeof url !== 'string') {
    return undefined;
  }
  return url
    .replace(/^git\+/, '')
    .replace(/^ssh:\/\/git@/, 'https://')
    .replace(/\.git$/, '');
}

function guessIconUrl(name: string, repositoryUrl?: string): string | null {
  if (name.startsWith('@')) {
    const scope = name.split('/')[0].substring(1);
    return `https://avatars.githubusercontent.com/${scope}?size=64`;
  }
  if (repositoryUrl?.includes('github.com')) {
    const match = repositoryUrl.match(/github\.com\/([^/]+)/);
    if (match) {
      return `https://avatars.githubusercontent.com/${match[1]}?size=64`;
    }
  }
  return null;
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

export async function detectPackageManager(projectRoot: string): Promise<'npm' | 'pnpm' | 'yarn'> {
  if (await fileExists(path.join(projectRoot, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (await fileExists(path.join(projectRoot, 'yarn.lock'))) {
    return 'yarn';
  }
  if (await fileExists(path.join(projectRoot, 'package-lock.json'))) {
    return 'npm';
  }
  return 'pnpm';
}

// -----------------------------
// Dependencies preload (Phase1 + Phase2)
// -----------------------------

async function phase1LocalIndex(
  projectRoot: string,
  deps: [string, string][]
): Promise<DependencyInfo[]> {
  const localConcurrency = 16;

  return mapLimit(deps, localConcurrency, async ([name, requestedVersion]) => {
    const pkgJsonPath = nodeModulesPackageJsonPath(projectRoot, name);
    const installedPkg = await readJsonFile(pkgJsonPath);

    const version = installedPkg?.version || requestedVersion;
    const repository = normalizeRepositoryUrl(installedPkg?.repository);
    const iconUrl = guessIconUrl(name, repository);

    const info: DependencyInfo = {
      name,
      version,
      description: installedPkg?.description || 'No description available',
      author: installedPkg?.author,
      homepage: installedPkg?.homepage,
      repository,
      npmUrl: `https://www.npmjs.com/package/${name}`,
      iconUrl,
    };

    dependenciesStatus.loaded++;
    if (dependenciesStatus.loaded % 50 === 0) {
      await deferToEventLoop();
    }

    return info;
  });
}

async function phase2BackgroundEnrich(deps: DependencyInfo[]): Promise<void> {
  const targets = deps.filter(
    (p) => !p.repository || !p.iconUrl || p.description === 'No description available'
  );

  const enrichConcurrency = 6;
  await mapLimit(targets, enrichConcurrency, async (p) => {
    // local enrich first
    const repo = normalizeRepositoryUrl(p.repository);
    if (repo && repo !== p.repository) {
      p.repository = repo;
    }
    if (!p.iconUrl) {
      p.iconUrl = guessIconUrl(p.name, p.repository);
    }

    // optional small registry lookup for missing description/repo
    if (!p.repository || p.description === 'No description available') {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);
        const res = await fetch(
          `https://registry.npmjs.org/${encodeURIComponent(p.name)}/${encodeURIComponent(p.version)}`,
          { headers: { Accept: 'application/json' }, signal: controller.signal }
        );
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (!p.repository) {
            p.repository = normalizeRepositoryUrl(data?.repository);
          }
          if (p.description === 'No description available' && data?.description) {
            p.description = data.description;
          }
          if (!p.iconUrl) {
            p.iconUrl = guessIconUrl(p.name, p.repository);
          }
        }
      } catch {
        // ignore
      }
    }

    await deferToEventLoop();
    return p;
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

    const allDeps = {
      ...(pkg?.dependencies || {}),
      ...(pkg?.devDependencies || {}),
      ...(pkg?.peerDependencies || {}),
    };
    const entries = Object.entries<string>(allDeps);
    dependenciesStatus.total = entries.length;

    try {
      const list = await phase1LocalIndex(projectRoot, entries);
      preloadedDependencies = list;
      dependenciesStatus.phase = 'phase2';

      // Phase2 runs truly in background; never blocks Phase1 result.
      void (async () => {
        try {
          await phase2BackgroundEnrich(list);
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

    async getAllDependencies(): Promise<any[]> {
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

    async refreshDependencies(): Promise<void> {
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
      void preloadDependencies(config);
    },

    async installPackage(
      packageName: string,
      isDev = true
    ): Promise<{ success: boolean; error?: string }> {
      try {
        const startDir = getProjectStartDirFromConfig(config);
        const pathToPackageJson = await findNearestFileUp(startDir, 'package.json');
        const projectRoot = pathToPackageJson ? path.dirname(pathToPackageJson) : startDir;
        const pm = await detectPackageManager(projectRoot);
        const devFlag = isDev ? (pm === 'npm' ? '--save-dev' : '-D') : '';

        const command = {
          npm: `npm install ${devFlag} ${packageName}`,
          pnpm: `pnpm add ${devFlag} ${packageName}`,
          yarn: `yarn add ${devFlag} ${packageName}`,
        }[pm];

        execSync(command, {
          cwd: projectRoot,
          stdio: 'pipe',
        });

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
      }
    },
  };
}
