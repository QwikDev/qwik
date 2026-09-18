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
  if (path.endsWith('.jsx')) {
    return 'jsx';
  }
  if (/\.qwik\.[mc]?js$/.test(path)) {
    return 'jsx';
  }
  return 'js';
}

export const isTypeScriptPath = (path: string) => path.endsWith('.ts') || path.endsWith('.tsx');
export const isJsxPath = (path: string) =>
  path.endsWith('.jsx') || path.endsWith('.tsx') || /\.qwik\.[mc]?js$/.test(path);
