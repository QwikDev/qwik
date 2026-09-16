import { JsonObjectNode, JsonParser } from '@croct/json5-parser';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { log } from '@clack/prompts';

export function updateConfigurations() {
  try {
    updateTsconfig();
  } catch (error) {
    log.error('Failed to update tsconfig.json configuration.');
  }
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
