import { Node, type SourceFile } from 'ts-morph';
import { findCalls, findNamedImports, findReferences } from './utils';

const MIDDLEWARE = '@builder.io/qwik-city/middleware/';

const createRouterCalls = (file: SourceFile) =>
  findCalls(file, [
    ...findNamedImports(file, MIDDLEWARE, 'createQwikCity'),
    ...findNamedImports(file, MIDDLEWARE, 'createQwikRouter'),
  ]);

/**
 * `createQwikCity({ render, qwikCityPlan })` -> `createQwikCity({ render })`. v2 loads the router
 * config itself and removed the option.
 */
export const removeQwikCityPlan = (file: SourceFile) => {
  let changed = false;
  for (const call of createRouterCalls(file)) {
    const options = call.getArguments()[0];
    if (!Node.isObjectLiteralExpression(options)) {
      continue;
    }
    const prop = options.getProperty('qwikCityPlan');
    if (prop) {
      prop.remove();
      changed = true;
    }
  }
  for (const decl of file.getImportDeclarations()) {
    const defaultImport = decl.getDefaultImport();
    if (
      decl.getModuleSpecifierValue() === '@qwik-city-plan' &&
      defaultImport &&
      decl.getNamedImports().length === 0 &&
      findReferences(defaultImport).length === 0
    ) {
      decl.remove();
      changed = true;
    }
  }
  return changed;
};
