import { Node, SyntaxKind, type SourceFile } from 'ts-morph';
import { warn } from '../report';
import { ensureNamedImport, findCalls, findNamedImports, HANDLER_EXPORT } from './utils';

/**
 * `@builder.io/qwik-city/service-worker` was removed in v2. Its only export, `setupServiceWorker`,
 * was already a no-op in v1, so the import and its calls are removed.
 */
export const removeSetupServiceWorker = (file: SourceFile) => {
  const decls = file
    .getImportDeclarations()
    .filter((d) => d.getModuleSpecifierValue() === '@builder.io/qwik-city/service-worker');
  if (decls.length === 0) {
    return false;
  }
  const locals = decls.flatMap((d) =>
    d.getNamedImports().map((n) => n.getAliasNode() ?? n.getNameNode())
  );
  for (const call of findCalls(file, locals).reverse()) {
    const statement = call.getParent();
    if (Node.isExpressionStatement(statement)) {
      statement.remove();
    }
  }
  decls.forEach((d) => d.remove());
  return true;
};

const ROOT_VIEW_TRANSITION_STYLE = 'useStyles$(`:root{view-transition-name:none}`);';

/**
 * View transitions were enabled by default in v1 and are opt-in in v2. v1 also always added
 * `:root{view-transition-name:none}` from the provider.
 */
export const keepV1ViewTransitions = (file: SourceFile) => {
  const providers = findNamedImports(file, '@builder.io/qwik-city', 'QwikCityProvider').map((id) =>
    id.getText()
  );
  const elements = [
    ...file.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
    ...file.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
  ].filter((e) => providers.includes(e.getTagNameNode().getText()));
  if (elements.length !== 1) {
    return false;
  }
  const element = elements[0];
  const fn = element.getFirstAncestor(
    (n) => Node.isArrowFunction(n) || Node.isFunctionExpression(n)
  );
  const attr = element
    .getAttributes()
    .find((a) => Node.isJsxAttribute(a) && a.getNameNode().getText() === 'viewTransition');
  if (!attr) {
    element.addAttribute({ name: 'viewTransition', initializer: '{true}' });
  } else if (Node.isJsxAttribute(attr)) {
    const value = attr.getInitializer();
    const expression = Node.isJsxExpression(value) ? value.getExpression() : undefined;
    if (expression && !['true', 'false'].includes(expression.getText())) {
      expression.replaceWithText(`${expression.getText()} !== false`);
    }
  }
  if (Node.isArrowFunction(fn) || Node.isFunctionExpression(fn)) {
    const body = fn.getBody();
    if (Node.isBlock(body)) {
      body.insertStatements(0, ROOT_VIEW_TRANSITION_STYLE);
    } else if (body) {
      body.replaceWithText(`{\n  ${ROOT_VIEW_TRANSITION_STYLE}\n  return ${body.getText()};\n}`);
    }
    ensureNamedImport(file, '@builder.io/qwik', 'useStyles$');
  }
  return true;
};

/**
 * V1 merged the `head` exports from the page to the root layout, calling functions and merging
 * objects in that order. v2 merges all objects first (root to page) and then calls the functions
 * (page to root). Using only functions keeps the v1 order.
 */
export const keepV1HeadOrder = (file: SourceFile) => {
  if (!/\/routes\//.test(file.getFilePath())) {
    return false;
  }
  const exported = new Set(
    file
      .getExportDeclarations()
      .flatMap((d) => (d.getModuleSpecifier() ? [] : d.getNamedExports()))
      .filter((e) => (e.getAliasNode()?.getText() ?? e.getName()) === 'head')
      .map((e) => e.getName())
  );
  let changed = false;
  for (const decl of file.getVariableDeclarations()) {
    const initializer = decl.getInitializer();
    const isHead =
      (decl.getName() === 'head' && decl.getVariableStatement()?.isExported()) ||
      exported.has(decl.getName());
    if (
      !isHead ||
      !initializer ||
      Node.isArrowFunction(initializer) ||
      Node.isFunctionExpression(initializer)
    ) {
      continue;
    }
    initializer.replaceWithText(`() => (${initializer.getText()})`);
    changed = true;
  }
  return changed;
};

/**
 * V1 `<Link>` prefetched data when visible by default, v2 only on intent. The deprecated `prefetch`
 * prop is replaced with the v2 props that keep the v1 behavior.
 */
export const keepV1LinkPrefetch = (file: SourceFile) => {
  const links = findNamedImports(file, '@builder.io/qwik-city', 'Link').map((id) => id.getText());
  let changed = false;
  const elements = [
    ...file.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
    ...file.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
  ].filter((e) => links.includes(e.getTagNameNode().getText()));
  for (const element of elements.reverse()) {
    const attrs = element.getAttributes();
    if (attrs.some((a) => Node.isJsxSpreadAttribute(a))) {
      warn(
        file.getFilePath(),
        '`<Link>` prefetches data on intent in v2, set `prefetchData="visible"` to prefetch when visible like v1.'
      );
      continue;
    }
    const prefetch = attrs.find(
      (a) => Node.isJsxAttribute(a) && a.getNameNode().getText() === 'prefetch'
    );
    if (
      attrs.some(
        (a) =>
          Node.isJsxAttribute(a) &&
          a.getNameNode().getText().startsWith('prefetch') &&
          a !== prefetch
      )
    ) {
      continue;
    }
    if (!prefetch) {
      element.addAttribute({ name: 'prefetchData', initializer: '"visible"' });
      changed = true;
      continue;
    }
    const initializer = Node.isJsxAttribute(prefetch) ? prefetch.getInitializer() : undefined;
    const value = !initializer
      ? 'true'
      : Node.isJsxExpression(initializer)
        ? initializer.getExpression()?.getText()
        : initializer.getText().slice(1, -1);
    const replacement = {
      true: 'prefetchData="visible"',
      false: 'prefetchBundles="off" prefetchData="off"',
      js: 'prefetchData="off"',
    }[value as string];
    if (replacement) {
      prefetch.replaceWithText(replacement);
      changed = true;
    }
  }
  return changed;
};

/**
 * V1 fetched route data on SPA navigation bypassing the browser cache. v2 fetches each route loader
 * as a normal request, so `Cache-Control` set by middleware would serve stale loader data. The
 * middleware keeps setting it for page requests only.
 */
export const keepLoaderRequestsUncached = (file: SourceFile) => {
  if (!/\/routes\//.test(file.getFilePath())) {
    return false;
  }
  let changed = false;
  for (const decl of file.getVariableDeclarations()) {
    const handler = decl.getInitializer();
    if (
      !HANDLER_EXPORT.test(decl.getName()) ||
      !decl.isExported() ||
      !(Node.isArrowFunction(handler) || Node.isFunctionExpression(handler))
    ) {
      continue;
    }
    const param = handler.getParameters()[0]?.getNameNode();
    let condition: string | undefined;
    let isCacheControl: (callee: string) => boolean;
    if (Node.isIdentifier(param)) {
      condition = `${param.getText()}.internalRequest !== 'loader'`;
      isCacheControl = (callee) => callee === `${param.getText()}.cacheControl`;
    } else if (Node.isObjectBindingPattern(param)) {
      const element = param
        .getElements()
        .find((e) => (e.getPropertyNameNode() ?? e.getNameNode()).getText() === 'cacheControl');
      if (!element) {
        continue;
      }
      const local = element.getNameNode().getText();
      isCacheControl = (callee) => callee === local;
      condition = `internalRequest !== 'loader'`;
    } else {
      continue;
    }
    const statements = handler
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter((call) => isCacheControl(call.getExpression().getText()))
      .map((call) => call.getParent())
      .filter(Node.isExpressionStatement);
    if (statements.length === 0) {
      continue;
    }
    for (const statement of statements.reverse()) {
      statement.replaceWithText(`if (${condition}) {\n  ${statement.getText()}\n}`);
    }
    if (
      Node.isObjectBindingPattern(param) &&
      !param.getElements().some((e) => e.getName() === 'internalRequest')
    ) {
      param.replaceWithText(
        `{ ${[...param.getElements().map((e) => e.getText()), 'internalRequest'].join(', ')} }`
      );
    }
    changed = true;
  }
  return changed;
};
