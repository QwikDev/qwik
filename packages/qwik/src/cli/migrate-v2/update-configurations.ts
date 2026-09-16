import { JsonObjectNode, JsonParser } from '@croct/json5-parser';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { log } from '@clack/prompts';
import { warn } from './report';
import { visitNotIgnoredFiles } from './tools/visit-not-ignored-files';

export function updateConfigurations() {
  try {
    updateTsconfig();
  } catch (error) {
    log.error('Failed to update tsconfig.json configuration.');
  }
  try {
    setTypeModule();
  } catch (error) {
    log.error('Failed to update package.json configuration.');
  }
}

const CJS = /\bmodule\.exports\b|\bexports\.\w+\s*=|\brequire\(/;

/**
 * V2 packages are ESM only, so the app must be an ES module (e.g. the Vite config is loaded as
 * ESM). `.js` files written as CommonJS need to be renamed to `.cjs`.
 */
function setTypeModule() {
  const packageJsonPath = 'package.json';
  if (!existsSync(packageJsonPath)) {
    return;
  }
  const packageJson = JsonParser.parse(readFileSync(packageJsonPath, 'utf-8'), JsonObjectNode);
  if (packageJson.has('type') && packageJson.get('type').toJSON() === 'module') {
    return;
  }
  packageJson.set('type', 'module');
  writeFileSync(packageJsonPath, packageJson.toString());
  visitNotIgnoredFiles('.', (path) => {
    if (path.endsWith('.js') && CJS.test(readFileSync(path, 'utf-8'))) {
      warn(path, 'the app is now an ES module, rename this CommonJS file to `.cjs`.');
    }
  });
}

const NODE_MODULES = ['node16', 'node18', 'nodenext'];
const EXPORTS_RESOLUTIONS = ['bundler', ...NODE_MODULES];
const COMMONJS_MODULES = ['commonjs', 'amd', 'umd', 'system', 'none'];

/**
 * V2 packages resolve their subpaths through package.json `exports`, which the `node`/`classic`
 * module resolutions don't support. tsconfig.json is only used for type checking in Qwik apps.
 */
function updateTsconfig() {
  const tsConfigPath = 'tsconfig.json';
  if (!existsSync(tsConfigPath)) {
    return;
  }
  const tsConfig = JsonParser.parse(readFileSync(tsConfigPath, 'utf-8'), JsonObjectNode);
  if (!tsConfig.has('compilerOptions')) {
    return;
  }
  const options = tsConfig.get('compilerOptions', JsonObjectNode);
  const read = (name: string) =>
    options.has(name) ? String(options.get(name).toJSON()).toLowerCase() : undefined;
  const module = read('module');
  const moduleResolution = read('moduleResolution');
  if (
    (moduleResolution && EXPORTS_RESOLUTIONS.includes(moduleResolution)) ||
    (!moduleResolution && module && NODE_MODULES.includes(module))
  ) {
    return;
  }
  options.set('moduleResolution', 'Bundler');
  if (!module || COMMONJS_MODULES.includes(module)) {
    options.set('module', 'ESNext');
  }
  writeFileSync(tsConfigPath, tsConfig.toString());
}
