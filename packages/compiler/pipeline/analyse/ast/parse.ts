import { parseSync } from 'oxc-parser';
import type { AstNode } from './ast-types';

export interface ParsedModule {
  program: AstNode;
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
    program: parsed.program as unknown as AstNode,
    errors: (parsed.errors ?? []) as { message?: string }[],
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
