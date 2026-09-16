import { Node, SyntaxKind, type SourceFile } from 'ts-morph';
import { warn } from '../report';
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

const NOT_FOUND_HEADERS = `{ 'Content-Type': 'text/html; charset=utf-8' }`;

/**
 * The `notFound` middleware is a no-op in v2 because the router renders 404 pages. The router only
 * falls through for `/.well-known/*`, where v1 answered with a 404, so keep answering with a 404.
 */
export const replaceNotFound = (file: SourceFile) => {
  let changed = false;
  for (const call of createRouterCalls(file)) {
    const decl = call.getParentIfKind(SyntaxKind.VariableDeclaration);
    const pattern = decl?.getNameNode();
    if (!Node.isObjectBindingPattern(pattern)) {
      continue;
    }
    const element = pattern
      .getElements()
      .find(
        (e) =>
          e.getPropertyNameNode()?.getText() === 'notFound' ||
          (!e.getPropertyNameNode() && e.getName() === 'notFound')
      );
    if (!element) {
      continue;
    }
    const local = element.getNameNode();
    if (!Node.isIdentifier(local)) {
      continue;
    }
    for (const ref of findReferences(local).reverse()) {
      if (ref.wasForgotten()) {
        continue;
      }
      const parent = ref.getParent();
      if (Node.isCallExpression(parent) && parent.getExpression() === ref) {
        const args = parent.getArguments();
        if (args.length === 1) {
          parent.replaceWithText(
            `new Response('Not Found', { status: 404, headers: ${NOT_FOUND_HEADERS} })`
          );
          continue;
        }
        if (args.length === 3) {
          const res = args[1].getText();
          parent.replaceWithText(
            `(${res}.headersSent || ${res}.writeHead(404, ${NOT_FOUND_HEADERS}).end('Not Found'))`
          );
          continue;
        }
      } else if (Node.isCallExpression(parent)) {
        // passed as a middleware, e.g. `app.use(notFound)`
        ref.replaceWithText(
          `(_req, res) => res.headersSent || res.writeHead(404, ${NOT_FOUND_HEADERS}).end('Not Found')`
        );
        continue;
      }
      warn(file.getFilePath(), '`notFound` was removed in v2, the router renders 404 pages.');
      return changed;
    }
    const others = pattern.getElements().filter((e) => e !== element);
    pattern.replaceWithText(`{ ${others.map((e) => e.getText()).join(', ')} }`);
    changed = true;
  }
  return changed;
};

/** `QwikCityPlatform` global type was renamed to `QwikRouterPlatform`. */
export const renameQwikCityPlatform = (file: SourceFile) => {
  let changed = false;
  for (const id of file.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (!id.wasForgotten() && id.getText() === 'QwikCityPlatform') {
      id.replaceWithText('QwikRouterPlatform');
      changed = true;
    }
  }
  return changed;
};
