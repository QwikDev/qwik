import { Node, SyntaxKind, type SourceFile } from 'ts-morph';
import { ensureNamedImport, findCalls, findNamedImports } from './utils';

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
  const fn = file
    .getDescendantsOfKind(SyntaxKind.JsxOpeningElement)
    .concat(file.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement) as any)
    .find((e) => providers.includes(e.getTagNameNode().getText()))!
    .getFirstAncestor((n) => Node.isArrowFunction(n) || Node.isFunctionExpression(n));
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
