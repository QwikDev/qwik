import { warn } from '../report';
import {
  Node,
  SyntaxKind,
  type CallExpression,
  type Identifier,
  type ObjectLiteralExpression,
  type SourceFile,
} from 'ts-morph';

/** Names of the request handlers a route module can export. */
export const HANDLER_EXPORT = /^on(Request|Get|Post|Put|Patch|Delete|Head|Options)$/;

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

/**
 * Appends `name: value` to an object literal, following its formatting (single or multi line,
 * indentation and trailing comma). Nodes of the file are forgotten afterwards.
 */
export function appendProperty(obj: ObjectLiteralExpression, text: string) {
  const file = obj.getSourceFile();
  const props = obj.getProperties();
  const last = props[props.length - 1];
  if (!last) {
    obj.replaceWithText(`{ ${text} }`);
    return;
  }
  const afterLast = file.getFullText().slice(last.getEnd(), obj.getEnd());
  const hasTrailingComma = afterLast.trimStart().startsWith(',');
  if (!obj.getText().includes('\n')) {
    file.insertText(last.getEnd(), `, ${text}`);
    return;
  }
  const indent = ' '.repeat(
    last.getStartLinePos() === last.getStart() ? 0 : last.getStart() - last.getStartLinePos()
  );
  if (hasTrailingComma) {
    const commaPos = last.getEnd() + afterLast.indexOf(',') + 1;
    file.insertText(commaPos, `\n${indent}${text},`);
  } else {
    file.insertText(last.getEnd(), `,\n${indent}${text}`);
  }
}

/** Adds `name` to the named imports of `module`, creating the import declaration if needed. */
export function ensureNamedImport(
  file: SourceFile,
  module: string,
  name: string,
  isTypeOnly = false
) {
  const decls = file.getImportDeclarations().filter((d) => d.getModuleSpecifierValue() === module);
  if (
    decls.some((d) => d.getNamedImports().some((n) => n.getName() === name && !n.getAliasNode()))
  ) {
    return;
  }
  const decl =
    decls.find((d) => !d.isTypeOnly() && !d.getNamespaceImport()) ??
    decls.find((d) => d.isTypeOnly() && isTypeOnly);
  if (decl) {
    decl.addNamedImport({ name, isTypeOnly: isTypeOnly && !decl.isTypeOnly() });
    return;
  }
  file.addImportDeclaration({
    moduleSpecifier: module,
    namedImports: [name],
    isTypeOnly,
  });
}

/**
 * Adds the `name: value` option to the first argument of a call, unless it is already set. Returns
 * whether the file changed. Nodes of the file may be forgotten afterwards.
 */
export function ensureCallOption(call: CallExpression, name: string, value: string) {
  const options = call.getArguments()[0];
  if (!options) {
    call.addArgument(`{ ${name}: ${value} }`);
    return true;
  }
  if (!Node.isObjectLiteralExpression(options)) {
    warn(
      call.getSourceFile().getFilePath(),
      `add \`${name}: ${value}\` to \`${call.getExpression().getText()}()\` to keep the v1 behavior.`
    );
    return false;
  }
  if (options.getProperty(name)) {
    return false;
  }
  appendProperty(options, `${name}: ${value}`);
  return true;
}
