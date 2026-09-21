import { parseSync } from 'oxc-parser';
import type { Program } from 'oxc-parser';

export interface ParsedModule {
  program: Program;
  errors: { message?: string }[];
}

export function parseModule(path: string, code: string): ParsedModule {
  const parsed = parseSync(path, code, {
    lang: getLang(path),
    sourceType: 'module',
    astType: 'ts',
    range: true,
  });
  return {
    program: parsed.program,
    errors: parsed.errors ?? [],
  };
}

export function getLang(path: string): 'js' | 'jsx' | 'ts' | 'tsx' {
  if (path.endsWith('.tsx')) {
    return 'tsx';
  }
  if (path.endsWith('.ts')) {
    return 'ts';
  }
  return isJsxPath(path) ? 'jsx' : 'js';
}

export const isTypeScriptPath = (path: string) => path.endsWith('.ts') || path.endsWith('.tsx');
// Library twins and markdown (authored JSX from the router's MDX transform) parse as JSX.
export const isJsxPath = (path: string) => /\.(?:[jt]sx|qwik\.[mc]?js|mdx?|markdown)$/.test(path);
