import type { TSESLint, TSESTree } from '@typescript-eslint/utils';

type NodeWithParent = TSESTree.Node & {
  parent?: NodeWithParent;
  [key: string]: unknown;
};

type RuleContextLike = {
  sourceCode: TSESLint.SourceCode;
};

const QWIK_MODULE_PREFIXES = [
  '@qwik.dev/core',
  '@qwik.dev/router',
  '@builder.io/qwik',
  '@builder.io/qwik-city',
];

export function hasJsxImportSourceComment(context: RuleContextLike): boolean {
  return context.sourceCode
    .getAllComments()
    .some((comment) => comment.value.includes('@jsxImportSource'));
}

export function isAstNode(value: unknown): value is TSESTree.Node {
  return (
    !!value && typeof value === 'object' && typeof (value as { type?: unknown }).type === 'string'
  );
}

export function forEachChild(
  node: TSESTree.Node,
  visit: (child: TSESTree.Node) => boolean | void
): boolean {
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === 'parent' || key === 'range' || key === 'loc') {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isAstNode(item) && visit(item)) {
          return true;
        }
      }
      continue;
    }
    if (isAstNode(value) && visit(value)) {
      return true;
    }
  }
  return false;
}

export function traverse(
  node: TSESTree.Node,
  visit: (node: TSESTree.Node) => boolean | void
): boolean {
  if (visit(node)) {
    return true;
  }
  return forEachChild(node, (child) => traverse(child, visit));
}

export function traverseWithParents(
  node: TSESTree.Node,
  visit: (node: TSESTree.Node, parent: TSESTree.Node | null) => boolean | void,
  parent: TSESTree.Node | null = null
): boolean {
  if (visit(node, parent)) {
    return true;
  }
  return forEachChild(node, (child) => traverseWithParents(child, visit, node));
}

export function isDescendantOf(
  descendant: TSESTree.Node,
  ancestor: TSESTree.Node | null | undefined
): boolean {
  let current = (descendant as NodeWithParent).parent;
  while (current) {
    if (current === ancestor) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

export function resolveVariableForIdentifier(
  context: RuleContextLike,
  identifier: TSESTree.Identifier
): TSESLint.Scope.Variable | null {
  const scope = context.sourceCode.getScope(identifier);
  const reference = scope.references.find((ref) => ref.identifier === identifier);
  if (reference?.resolved) {
    return reference.resolved;
  }

  let currentScope: TSESLint.Scope.Scope | null = scope;
  while (currentScope) {
    const variable = currentScope.variables.find((item) => item.name === identifier.name);
    if (variable) {
      return variable;
    }
    currentScope = currentScope.upper;
  }
  return null;
}

export function isFromQwikModule(variable: TSESLint.Scope.Variable | null | undefined): boolean {
  return !!variable?.defs.some((def) => {
    if (def.type !== 'ImportBinding') {
      return false;
    }
    const source = def.parent.source.value;
    return (
      typeof source === 'string' && QWIK_MODULE_PREFIXES.some((prefix) => source.startsWith(prefix))
    );
  });
}

export function isQwikQrlCallee(
  context: RuleContextLike,
  callee: TSESTree.Node | null | undefined
): callee is TSESTree.Identifier {
  return (
    callee?.type === 'Identifier' &&
    callee.name.endsWith('$') &&
    isFromQwikModule(resolveVariableForIdentifier(context, callee))
  );
}

export function getStaticPropertyName(
  property: TSESTree.Property | TSESTree.MethodDefinition | TSESTree.JSXAttribute
): string | null {
  const key = property.type === 'JSXAttribute' ? property.name : property.key;
  if (key.type === 'Identifier' || key.type === 'JSXIdentifier') {
    return key.name;
  }
  if (key.type === 'Literal') {
    return String(key.value);
  }
  return null;
}

export function findObjectProperty(
  objectExpression: TSESTree.ObjectExpression,
  name: string
): TSESTree.Property | undefined {
  return objectExpression.properties.find(
    (property): property is TSESTree.Property =>
      property.type === 'Property' && !property.computed && getStaticPropertyName(property) === name
  );
}

export function isFunctionExpression(
  node: TSESTree.Node | null | undefined
): node is TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression {
  return node?.type === 'ArrowFunctionExpression' || node?.type === 'FunctionExpression';
}

export function findJsxAttribute(
  attributes: TSESTree.JSXOpeningElement['attributes'],
  name: string
): TSESTree.JSXAttribute | undefined {
  return attributes.find(
    (attribute): attribute is TSESTree.JSXAttribute =>
      attribute.type === 'JSXAttribute' &&
      attribute.name.type === 'JSXIdentifier' &&
      attribute.name.name === name
  );
}

export function hasJsxAttribute(
  attributes: TSESTree.JSXOpeningElement['attributes'],
  name: string
): boolean {
  return !!findJsxAttribute(attributes, name);
}

export function findContainingFunction(
  node: TSESTree.Node
):
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | null {
  let current: NodeWithParent | undefined = node as NodeWithParent;
  while (current) {
    if (
      current.type === 'ArrowFunctionExpression' ||
      current.type === 'FunctionDeclaration' ||
      current.type === 'FunctionExpression'
    ) {
      return current as
        | TSESTree.ArrowFunctionExpression
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression;
    }
    current = current.parent;
  }
  return null;
}
