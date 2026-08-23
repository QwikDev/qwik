/**
 * `analyseModule(file, options) -> ModulePlan` — one file, one plan, pure (DESIGN.md rule 7).
 *
 * MOCK STAGE: every module currently analyses to `ModuleKind.Foreign` (authored source retained;
 * transpiled at generate), which is enough to run the whole flow end to end. Slice 1 replaces this
 * with real component/QRL lowering; modules it cannot lower yet must throw
 * {@link SliceUnsupportedError} — an honest "not this slice yet", never silently wrong output.
 */
import { parseSync } from 'oxc-parser';
import { DiagnosticCategory, ModuleKind, PlanFormat, type ModulePlan } from '../schema';

export interface AnalyseOptions {
  transpileTs?: boolean;
  rootDir?: string;
  /** Identity-affecting: feeds QRL naming/hashing. */
  scope?: string;
}

export interface AnalyseInput {
  path: string;
  code: string;
  devPath?: string;
}

export class SliceUnsupportedError extends Error {
  constructor(what: string) {
    super(`pipeline slice 1 does not support: ${what}`);
  }
}

export async function analyseModule(
  input: AnalyseInput,
  options: AnalyseOptions
): Promise<ModulePlan> {
  void options;
  const plan = emptyPlan(input.path);
  plan.source = { code: input.code, originalPath: input.path, normalizationMap: null };

  const parsed = parseSync(input.path, input.code, {
    lang: getLang(input.path),
    sourceType: 'module',
    astType: 'ts',
    range: true,
  });
  if (parsed.errors && parsed.errors.length > 0) {
    plan.kind = ModuleKind.Failed;
    for (const error of parsed.errors) {
      plan.diagnostics.push({
        code: 'parse-error',
        message: (error as { message?: string }).message ?? 'Unable to parse module',
        span: null,
        category: DiagnosticCategory.Error,
      });
    }
    return plan;
  }

  // MOCK: no Qwik lowering yet — everything passes through as a foreign module.
  plan.kind = ModuleKind.Foreign;
  return plan;
}

function emptyPlan(path: string): ModulePlan {
  return {
    format: PlanFormat.ModulePlan,
    version: 1,
    path,
    kind: ModuleKind.Qwik,
    source: { code: '', originalPath: path, normalizationMap: null },
    bindings: [],
    lifetimes: [],
    payloads: [],
    programs: [],
    qrls: [],
    components: [],
    hooks: [],
    callables: [],
    values: [],
    contexts: [],
    contextProviders: [],
    natives: [],
    defs: [],
    pluginSites: [],
    edges: [],
    imports: [],
    exports: [],
    assembly: [],
    diagnostics: [],
  };
}

export function getLang(path: string): 'js' | 'jsx' | 'ts' | 'tsx' {
  if (path.endsWith('.tsx')) return 'tsx';
  if (path.endsWith('.ts')) return 'ts';
  if (path.endsWith('.jsx')) return 'jsx';
  if (/\.qwik\.[mc]?js$/.test(path)) return 'jsx';
  return 'js';
}

export const isTypeScriptPath = (path: string) => path.endsWith('.ts') || path.endsWith('.tsx');
export const isJsxPath = (path: string) =>
  path.endsWith('.jsx') || path.endsWith('.tsx') || /\.qwik\.[mc]?js$/.test(path);
