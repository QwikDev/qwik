import { transform } from 'oxc-transform';
import type {
  SegmentAnalysis,
  TransformModule,
  TransformModuleInput,
  TransformModulesOptions,
} from '@qwik.dev/optimizer';

export async function transformWithOxc(
  input: TransformModuleInput,
  options: TransformModulesOptions
): Promise<TransformModule> {
  const result = await transform(input.path, input.code, {
    lang: getLang(input.path),
    sourceType: 'module',
    cwd: options.rootDir,
    sourcemap: !!options.sourceMaps,
  });
  return createModule(
    input.path,
    result.code,
    options.sourceMaps && result.map ? JSON.stringify(result.map) : null
  );
}

export function createModule(
  path: string,
  code: string,
  map: string | null = null,
  options?: {
    isEntry?: boolean;
    segment?: SegmentAnalysis | null;
    origPath?: string | null;
  }
): TransformModule {
  return {
    path,
    isEntry: options?.isEntry ?? false,
    code,
    map,
    segment: options?.segment ?? null,
    origPath: options?.origPath ?? null,
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
  return 'js';
}

export function isTypeScriptPath(path: string) {
  return path.endsWith('.ts') || path.endsWith('.tsx');
}

export function isJsxPath(path: string) {
  return path.endsWith('.jsx') || path.endsWith('.tsx');
}
