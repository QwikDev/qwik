/**
 * `generateJsSsr(serverLinkedPlan, options)` — the BASELINE generator.
 *
 * Consumes the exact same server LinkedPlan as `generateRustSsr`. Validates by EXHAUSTIVE MATCH
 * over linked leaf variants; JS payload bodies are native format here, so every variant is
 * supported and the exhaustiveness check is purely structural.
 *
 * MOCK STAGE: only `ModuleKind.Foreign` modules generate (authored source transpiled with oxc,
 * mirroring the legacy fallback). Qwik modules throw until slice 1 lands the real emitter.
 */
import { transform } from 'oxc-transform';
import { Environment, ModuleKind, type LinkedModule, type LinkedPlan } from '../schema';
import { getLang, isJsxPath, isTypeScriptPath } from '../analyse/analyse-module';
import type { GenerateOutput, PresentationOptions } from './output';

export async function generateJsSsr(
  plan: LinkedPlan,
  options: PresentationOptions
): Promise<GenerateOutput> {
  if (plan.specialization.environment !== Environment.Server) {
    throw new Error('generateJsSsr requires a server LinkedPlan');
  }
  const modules: GenerateOutput['modules'] = [];
  for (const module of plan.modules) {
    modules.push(await generateModule(module, options));
  }
  return {
    modules,
    diagnostics: plan.diagnostics.map((entry) => entry.diagnostic),
    isTypeScript: plan.modules.some((module) => isTypeScriptPath(module.path)),
    isJsx: plan.modules.some((module) => isJsxPath(module.path)),
  };
}

async function generateModule(
  module: LinkedModule,
  options: PresentationOptions
): Promise<GenerateOutput['modules'][number]> {
  switch (module.kind) {
    case ModuleKind.Foreign: {
      const result = await transform(module.path, module.source.code, {
        lang: getLang(module.path),
        sourceType: 'module',
        cwd: options.rootDir,
        sourcemap: !!options.outputSourceMaps,
      });
      return {
        path: module.path,
        code: result.code,
        map: options.outputSourceMaps && result.map ? JSON.stringify(result.map) : null,
        isEntry: false,
        origPath: null,
        segment: null,
      };
    }
    case ModuleKind.Qwik:
    case ModuleKind.ExportsOnly:
    case ModuleKind.Failed:
      throw new Error(
        `pipeline.generateJsSsr: ${module.kind} modules not implemented yet (slice 1): ${module.path}`
      );
  }
}
