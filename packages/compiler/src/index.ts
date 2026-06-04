import { transform } from 'oxc-transform';
import type {
  TransformModule,
  TransformModuleInput,
  TransformModulesOptions,
  TransformOutput,
} from '@qwik.dev/optimizer';

const JSX_FACTORY = '__qwikJsx';
const JSX_FRAGMENT = '__qwikFragment';
const JSX_MOCK = `const ${JSX_FACTORY} = () => "hello world";\nconst ${JSX_FRAGMENT} = Symbol.for("qwik.fragment");\n`;

/** @public */
export async function transformModules(options: TransformModulesOptions): Promise<TransformOutput> {
  const modules = await Promise.all(options.input.map((input) => transformModule(input, options)));

  return {
    modules,
    diagnostics: [],
    isTypeScript: options.input.some((input) => isTypeScriptPath(input.path)),
    isJsx: options.input.some((input) => isJsxPath(input.path)),
  };
}

async function transformModule(
  input: TransformModuleInput,
  options: TransformModulesOptions
): Promise<TransformModule> {
  const result = await transform(input.path, input.code, {
    lang: getLang(input.path),
    sourceType: 'module',
    cwd: options.rootDir,
    sourcemap: !!options.sourceMaps,
    typescript: {
      jsxPragma: JSX_FACTORY,
      jsxPragmaFrag: JSX_FRAGMENT,
    },
    jsx: {
      runtime: 'classic',
      pragma: JSX_FACTORY,
      pragmaFrag: JSX_FRAGMENT,
      pure: false,
    },
  });

  return {
    path: input.path,
    isEntry: false,
    code: result.code.includes(JSX_FACTORY) ? JSX_MOCK + result.code : result.code,
    map: options.sourceMaps && result.map ? JSON.stringify(result.map) : null,
    segment: null,
    origPath: null,
  };
}

function getLang(path: string): 'js' | 'jsx' | 'ts' | 'tsx' {
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

function isTypeScriptPath(path: string) {
  return path.endsWith('.ts') || path.endsWith('.tsx');
}

function isJsxPath(path: string) {
  return path.endsWith('.jsx') || path.endsWith('.tsx');
}
