import { isNode, type AstNode } from './ast-types';

/** Every binding name the module declares, at any depth — the generated-name collision set. */
export function collectBindingNames(program: AstNode): string[] {
  const names = new Set<string>();
  const pattern = (node: unknown): void => {
    if (!isNode(node)) {
      return;
    }
    switch (node.type) {
      case 'Identifier':
        names.add(String((node as AstNode & { name: string }).name));
        break;
      case 'ObjectPattern':
        for (const property of node.properties as AstNode[]) {
          pattern(property.value ?? property.argument);
        }
        break;
      case 'ArrayPattern':
        for (const element of (node.elements as (AstNode | null)[]) ?? []) {
          pattern(element);
        }
        break;
      case 'AssignmentPattern':
        pattern(node.left);
        break;
      case 'RestElement':
        pattern(node.argument);
        break;
      case 'ImportSpecifier':
      case 'ImportDefaultSpecifier':
      case 'ImportNamespaceSpecifier':
        pattern(node.local);
        break;
    }
  };
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item);
      }
      return;
    }
    if (!isNode(node)) {
      return;
    }
    switch (node.type) {
      case 'ImportDeclaration':
        for (const specifier of node.specifiers as AstNode[]) {
          pattern(specifier);
        }
        return;
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        if (isNode(node.id)) {
          pattern(node.id);
        }
        for (const param of node.params as AstNode[]) {
          pattern(param);
        }
        walk(node.body);
        return;
      case 'VariableDeclarator':
        pattern(node.id);
        walk(node.init);
        return;
      case 'CatchClause':
        pattern(node.param);
        walk(node.body);
        return;
    }
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'range') {
        continue;
      }
      walk(node[key]);
    }
  };
  walk(program.body);
  return [...names];
}
