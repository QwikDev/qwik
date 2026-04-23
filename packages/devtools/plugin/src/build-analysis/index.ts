import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { getServerRpcRequestContext } from '@devtools/kit';
import type { BuildAnalysisRunResult, BuildAnalysisStatus, ServerFunctions } from '@devtools/kit';
import { visualizer } from 'rollup-plugin-visualizer';
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import type { ServerContext } from '../types';
import { detectPackageManager } from '../npm';
import {
  getBuildAnalysisRpcGuardError,
  getBuildAnalysisRpcGuardHint,
  isBuildAnalysisRpcAllowed,
} from './security';

const BUILD_ANALYSIS_VIEW_PATH = '/__qwik_devtools/build-analysis/report';
const BUILD_ANALYSIS_DIR = path.join('.qwik-devtools', 'build-analysis');
const BUILD_ANALYSIS_FILE = 'visualizer.html';

function findNearestPackageRoot(startDir: string): string {
  let currentDir = path.resolve(startDir);

  for (let i = 0; i < 100; i++) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      return currentDir;
    }

    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }

  return path.resolve(startDir);
}

function resolveBuildAnalysisHtmlPath(rootDir: string) {
  const projectRoot = findNearestPackageRoot(rootDir);
  return path.join(projectRoot, BUILD_ANALYSIS_DIR, BUILD_ANALYSIS_FILE);
}

function resolveBuildAnalysisDirPath(rootDir: string) {
  const projectRoot = findNearestPackageRoot(rootDir);
  return path.join(projectRoot, BUILD_ANALYSIS_DIR);
}

function createPlaceholderHtml(reportPath: string) {
  const escapedPath = reportPath.replace(/&/g, '&amp;').replace(/</g, '&lt;');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Build Analysis</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: Menlo, Monaco, Consolas, monospace;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0f172a;
        color: #e2e8f0;
      }
      .card {
        max-width: 720px;
        margin: 24px;
        padding: 24px;
        border-radius: 16px;
        border: 1px solid rgba(148, 163, 184, 0.28);
        background: rgba(15, 23, 42, 0.84);
        box-shadow: 0 24px 80px rgba(15, 23, 42, 0.35);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 24px;
      }
      p {
        margin: 0 0 12px;
        line-height: 1.7;
      }
      code {
        word-break: break-all;
        color: #93c5fd;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>Build Analysis Not Generated Yet</h1>
      <p>Run your project build once. The visualizer plugin will create an HTML report after the build finishes.</p>
      <p>Expected file:</p>
      <code>${escapedPath}</code>
    </main>
  </body>
</html>`;
}

function createBuildAnalysisServePlugin(): Plugin {
  let reportPath = resolveBuildAnalysisHtmlPath(process.cwd());

  return {
    name: 'vite-plugin-qwik-devtools-build-analysis-viewer',
    apply: 'serve',
    configResolved(config) {
      reportPath = resolveBuildAnalysisHtmlPath(config.root);
    },
    configureServer(server) {
      attachBuildAnalysisMiddleware(server, () => reportPath);
    },
  };
}

function attachBuildAnalysisMiddleware(server: ViteDevServer, getReportPath: () => string) {
  server.middlewares.use(BUILD_ANALYSIS_VIEW_PATH, async (_req, res) => {
    const reportPath = getReportPath();
    const html = (await fileExists(reportPath))
      ? await fsp.readFile(reportPath, 'utf8')
      : createPlaceholderHtml(reportPath);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  });
}

function createBuildAnalysisPrepPlugin(): Plugin {
  let reportPath = resolveBuildAnalysisHtmlPath(process.cwd());
  let reportDir = resolveBuildAnalysisDirPath(process.cwd());

  return {
    name: 'vite-plugin-qwik-devtools-build-analysis-prep',
    apply: 'build',
    configResolved(config: ResolvedConfig) {
      reportPath = resolveBuildAnalysisHtmlPath(config.root);
      reportDir = resolveBuildAnalysisDirPath(config.root);
    },
    async buildStart() {
      await fsp.rm(reportDir, { recursive: true, force: true });
      await fsp.mkdir(path.dirname(reportPath), { recursive: true });
    },
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readPackageJson(rootDir: string) {
  const packageJsonPath = path.join(findNearestPackageRoot(rootDir), 'package.json');
  const packageJsonContent = await fsp.readFile(packageJsonPath, 'utf8');
  return JSON.parse(packageJsonContent) as {
    scripts?: Record<string, string>;
  };
}

async function resolveBuildScript(rootDir: string) {
  const projectRoot = findNearestPackageRoot(rootDir);
  const packageJson = await readPackageJson(projectRoot);
  const scripts = packageJson.scripts ?? {};
  const scriptName = scripts['build.client'] ? 'build.client' : scripts.build ? 'build' : null;

  if (!scriptName) {
    return {
      projectRoot,
      packageManager: null,
      scriptName: null,
      command: null,
    };
  }

  const packageManager = await detectPackageManager(projectRoot);
  const command =
    packageManager === 'yarn' ? `yarn ${scriptName}` : `${packageManager} run ${scriptName}`;

  return {
    projectRoot,
    packageManager,
    scriptName,
    command,
  };
}

async function runBuildScript(rootDir: string): Promise<BuildAnalysisRunResult> {
  const resolved = await resolveBuildScript(rootDir);

  if (!resolved.packageManager || !resolved.scriptName || !resolved.command) {
    return {
      success: false,
      error: 'No build script found. Expected "build.client" or "build" in package.json.',
    };
  }

  const { packageManager, projectRoot, scriptName } = resolved;
  const args = packageManager === 'yarn' ? [scriptName] : ['run', scriptName];

  return new Promise((resolve) => {
    const child = spawn(packageManager, args, {
      cwd: projectRoot,
      env: process.env,
      stdio: 'pipe',
    });

    let output = '';

    child.stdout.on('data', (chunk) => {
      output += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      output += String(chunk);
    });

    child.on('error', (error) => {
      resolve({
        success: false,
        error: error.message,
      });
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
        return;
      }

      resolve({
        success: false,
        error: output.trim() || `Build exited with code ${code ?? 'unknown'}.`,
      });
    });
  });
}

export function getBuildAnalysisFunctions(
  ctx: ServerContext
): Pick<ServerFunctions, 'getBuildAnalysisStatus' | 'buildBuildAnalysisReport'> {
  return {
    async getBuildAnalysisStatus(): Promise<BuildAnalysisStatus> {
      const reportPath = resolveBuildAnalysisHtmlPath(ctx.config.root);
      const { command } = await resolveBuildScript(ctx.config.root);
      const rpcClient = getServerRpcRequestContext()?.client;
      const canTriggerBuild = isBuildAnalysisRpcAllowed(rpcClient);

      return {
        exists: await fileExists(reportPath),
        reportPath,
        buildCommand: command,
        canTriggerBuild,
        buildTriggerHint: command && !canTriggerBuild ? getBuildAnalysisRpcGuardHint() : undefined,
      };
    },
    async buildBuildAnalysisReport(): Promise<BuildAnalysisRunResult> {
      const rpcClient = getServerRpcRequestContext()?.client;
      if (!isBuildAnalysisRpcAllowed(rpcClient)) {
        return {
          success: false,
          error: getBuildAnalysisRpcGuardError(),
        };
      }

      return runBuildScript(ctx.config.root);
    },
  };
}

export function createBuildAnalysisPlugins(): Plugin[] {
  const reportPath = resolveBuildAnalysisHtmlPath(process.cwd());

  return [
    createBuildAnalysisServePlugin(),
    createBuildAnalysisPrepPlugin(),
    visualizer({
      filename: reportPath,
      template: 'treemap',
      gzipSize: true,
      brotliSize: true,
      open: false,
    }) as Plugin,
  ];
}
