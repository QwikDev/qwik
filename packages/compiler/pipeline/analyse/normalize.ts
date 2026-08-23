import { transform } from 'oxc-transform';
import { getLang, isJsxPath, isTypeScriptPath } from './ast/parse';
import type { AnalyseOptions } from './analyse-module';

export interface NormalizedSource {
  code: string;
  errors: { message?: string }[];
}

// JSX stays preserved: lowering happens on plan ops, never on transpiled JSX calls.
export async function normalizeSource(
  path: string,
  code: string,
  options: AnalyseOptions
): Promise<NormalizedSource> {
  if (options.transpileTs !== true || !isTypeScriptPath(path)) {
    return { code, errors: [] };
  }
  const normalized = await transform(path, code, {
    lang: getLang(path),
    sourceType: 'module',
    cwd: options.rootDir,
    sourcemap: false,
    jsx: isJsxPath(path) ? 'preserve' : undefined,
  });
  return { code: normalized.code, errors: normalized.errors };
}
