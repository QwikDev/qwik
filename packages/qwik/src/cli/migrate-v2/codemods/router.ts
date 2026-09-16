import { Node, type SourceFile } from 'ts-morph';
import { findCalls } from './utils';

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
