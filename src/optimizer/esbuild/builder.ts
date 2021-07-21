import type { Diagnostic, OutputFile, OutputPlatform } from '../types';
import type { EsbuildResult } from './types';
import type { BuildOptions, BuildResult, OutputFile as ESOutputFile, Message } from 'esbuild';
import { createTimer } from '../utils';

/**
 * @alpha
 */
export function createEsbuilder(opts: { outDir: string; clientOpts?: any; serverOpts?: any }) {
  const results: EsBuildPluginData = {};

  const builder = {
    build: async () => {
      const buildTime = createTimer();

      const buildResult: EsbuildResult = {
        outputFiles: [],
        diagnostics: [],
        timers: {
          clientBuild: 0,
          serverBuild: 0,
          totalBuild: 0,
        },
      };

      try {
        if (opts.clientOpts) {
          opts.clientOpts.outdir = opts.outDir;
          const clientTime = createTimer();
          results.client = await runEsBuild(opts.clientOpts, results.client);
          convertOutFile(
            opts.outDir,
            buildResult.outputFiles,
            'client',
            results.client.outputFiles
          );
          convertMessages(buildResult, results.client, 'client');
          buildResult.timers.clientBuild = clientTime();
        }

        if (opts.serverOpts) {
          opts.serverOpts.outdir = opts.outDir;
          const serverTime = createTimer();
          results.server = await runEsBuild(opts.serverOpts, results.server);
          convertOutFile(
            opts.outDir,
            buildResult.outputFiles,
            'server',
            results.server.outputFiles
          );
          convertMessages(buildResult, results.server, 'server');
          buildResult.timers.serverBuild = serverTime();
        }
      } catch (e) {
        if (Array.isArray(e.errors)) {
          for (const err of e.errors as Message[]) {
            buildResult.diagnostics.push({
              type: 'error',
              message: err.text,
              location: err.location,
            });
          }
        } else {
          buildResult.diagnostics.push({ type: 'error', message: String(e.stack || e) });
        }
      }

      if (buildResult.diagnostics.length > 0) {
        buildResult.diagnosticsSummary = diagnosticsSummary(buildResult.diagnostics);
      }

      buildResult.timers.totalBuild = buildTime();
      return buildResult;
    },
    dispose: () => {
      if (results.client) {
        results.client.rebuild?.dispose();
        results.client = undefined;
      }
      if (results.server) {
        results.server.rebuild?.dispose();
        results.server = undefined;
      }
    },
  };

  return builder;
}

async function runEsBuild(buildOpts: BuildOptions, buildResults: BuildResult | undefined) {
  if (buildResults?.rebuild) {
    return buildResults.rebuild();
  }
  const esbuild = await import('esbuild');
  return esbuild.build(buildOpts);
}

function convertOutFile(
  rootDir: string,
  outFiles: OutputFile[],
  platform: OutputPlatform,
  esbuildFiles?: ESOutputFile[]
) {
  if (Array.isArray(esbuildFiles)) {
    for (const esbuildFile of esbuildFiles) {
      const out: OutputFile = {
        path: esbuildFile.path.replace(rootDir, ''),
        text: esbuildFile.text,
        platform,
      };
      if (out.path.startsWith('/') || out.path.startsWith('\\')) {
        out.path = out.path.substring(1);
      }
      outFiles.push(out);
    }
  }
  return [];
}

function convertMessages(
  esbuildResult: EsbuildResult,
  result: BuildResult,
  platform: OutputPlatform
) {
  for (const err of result.errors) {
    esbuildResult.diagnostics.push({
      type: 'error',
      message: err.text,
      location: err.location,
      platform,
    });
  }
  for (const warn of result.warnings) {
    esbuildResult.diagnostics.push({
      type: 'warn',
      message: warn.text,
      location: warn.location,
      platform,
    });
  }
}

function diagnosticsSummary(diagnostics: Diagnostic[]) {
  return diagnostics
    .map((d) => {
      let m = d.message;
      if (d.location) {
        m += `\nFile: ${d.location.file}\n${d.location.lineText}`;
      }
      return m;
    })
    .join('\n\n');
}

interface EsBuildPluginData {
  client?: BuildResult;
  server?: BuildResult;
}
