/**
 * Legacy `transformModules` surface over analyse → link(complete: false) → generate; must match the
 * legacy pipeline's full `TransformOutput` field-by-field until cutover.
 */
import type { TransformModulesOptions, TransformOutput } from '@qwik.dev/optimizer';
import { analyseModule } from '../analyse/analyse-module';
import { linkPlans, type LinkEntry } from '../link/link-plans';
import { generateJsCsr } from '../generate/js-csr';
import { generateJsSsr } from '../generate/js-ssr';
import { BuildMode, Environment, EntryKind, LinkResultKind, type Specialization } from '../schema';

export async function transformModules(options: TransformModulesOptions): Promise<TransformOutput> {
  const plans = await Promise.all(
    options.input.map((input) =>
      analyseModule(
        { path: input.path, code: input.code, devPath: input.devPath ?? undefined },
        { transpileTs: options.transpileTs, rootDir: options.rootDir, scope: options.scope }
      )
    )
  );
  const specialization: Specialization = {
    environment: options.isServer === false ? Environment.Browser : Environment.Server,
    mode:
      options.mode === 'dev'
        ? BuildMode.Dev
        : options.mode === 'lib'
          ? BuildMode.Lib
          : BuildMode.Prod,
    stripExports: options.stripExports ?? [],
  };
  const entries: LinkEntry[] = options.input.map((input) => ({
    kind: EntryKind.Module,
    module: input.path,
  }));
  const linked = linkPlans(
    plans,
    entries,
    specialization,
    { edges: {} },
    { claims: [], policies: [], emissions: [] },
    false
  );
  if (linked.kind === LinkResultKind.Failed) {
    throw new Error(`pipeline link failed: ${linked.diagnostics.map((d) => d.message).join('; ')}`);
  }
  const presentation = {
    outputSourceMaps: !!options.sourceMaps,
    explicitExtensions: options.explicitExtensions,
    rootDir: options.rootDir,
  };
  const generated =
    options.isServer === false
      ? await generateJsCsr(linked.plan, presentation)
      : await generateJsSsr(linked.plan, presentation);
  return {
    modules: generated.modules,
    // Diagnostic mapping to the legacy shape lands with the failure-path slices.
    diagnostics: [],
    isTypeScript: generated.isTypeScript,
    isJsx: generated.isJsx,
  };
}
