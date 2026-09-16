import { Node, SyntaxKind, type Identifier, type SourceFile } from 'ts-morph';

/**
 * Local identifiers bound to the named import `name` from a module whose specifier starts with
 * `modulePrefix`.
 */
export function findNamedImports(
  file: SourceFile,
  modulePrefix: string,
  name: string
): Identifier[] {
  const result: Identifier[] = [];
  for (const decl of file.getImportDeclarations()) {
    if (!decl.getModuleSpecifierValue().startsWith(modulePrefix)) {
      continue;
    }
    for (const named of decl.getNamedImports()) {
      if (named.getName() === name) {
        result.push(named.getAliasNode() ?? named.getNameNode());
      }
    }
  }
  return result;
}

/** Identifiers in the file with the same name as `local`, except `local` itself and property names. */
export function findReferences(local: Identifier): Identifier[] {
  const name = local.getText();
  return local
    .getSourceFile()
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .filter((id) => id !== local && id.getText() === name && isReference(id));
}

/** Calls whose callee is one of the given identifiers' names, e.g. `createQwikCity(...)`. */
export function findCalls(file: SourceFile, locals: Identifier[]) {
  const names = new Set(locals.map((l) => l.getText()));
  return file
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => names.has(call.getExpression().getText()));
}

/** Excludes identifiers that are property names, e.g. `a.name` or `{ name: 1 }`. */
export function isReference(identifier: Node) {
  const parent = identifier.getParent();
  if (
    Node.isPropertyAccessExpression(parent) ||
    Node.isPropertyAssignment(parent) ||
    Node.isPropertySignature(parent) ||
    Node.isPropertyDeclaration(parent) ||
    Node.isMethodDeclaration(parent) ||
    Node.isMethodSignature(parent) ||
    Node.isJsxAttribute(parent)
  ) {
    return (parent as any).getNameNode() !== identifier;
  }
  if (Node.isBindingElement(parent)) {
    return parent.getPropertyNameNode() !== identifier;
  }
  if (Node.isQualifiedName(parent)) {
    return parent.getLeft() === identifier;
  }
  return !Node.isImportSpecifier(parent);
}
