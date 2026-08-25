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
  let map: string | null = null;
  if (options.sourceMaps && result.map) {
    if (result.map.sources.length === 1) {
      result.map.sources[0] = sourceRelativeToMap(input.path, input.path);
    }
    map = JSON.stringify(result.map);
  }
  return createModule(input.path, result.code, map);
}

/**
 * Consumers resolve `sources` entries against the map's own location, so emit the source path
 * relative to the output module's directory. Bundler-safe: no node:path (dist runs in browsers).
 */
export function sourceRelativeToMap(outputPath: string, sourcePath: string): string {
  const outputDir = outputPath.split('/').slice(0, -1);
  const source = sourcePath.split('/');
  let shared = 0;
  while (
    shared < outputDir.length &&
    shared < source.length - 1 &&
    outputDir[shared] === source[shared]
  ) {
    shared++;
  }
  return [...outputDir.slice(shared).map(() => '..'), ...source.slice(shared)].join('/');
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
  if (/\.qwik\.[mc]?js$/.test(path)) {
    return 'jsx';
  }
  return 'js';
}

export function isTypeScriptPath(path: string) {
  return path.endsWith('.ts') || path.endsWith('.tsx');
}

export function isJsxPath(path: string) {
  return path.endsWith('.jsx') || path.endsWith('.tsx') || /\.qwik\.[mc]?js$/.test(path);
}
