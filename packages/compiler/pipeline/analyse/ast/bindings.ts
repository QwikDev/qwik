import type {
  ArrowFunctionExpression,
  BindingIdentifier,
  BindingPattern,
  Function,
  Node,
  Program,
} from 'oxc-parser';
import { BindingScope, VarKind, type LocalId, type ModulePlan } from '../../schema';
import { isNode, type WalkableNode } from './ast-types';

type Binding = ModulePlan['bindings'][number];

interface Scope {
  parent: Scope | null;
  bindings: Map<string, LocalId>;
  functionBoundary: boolean;
}

export interface BindingGraph {
  readonly bindings: Binding[];
  declaration(node: Node): LocalId | null;
  reference(node: Node): LocalId | null;
  addSynthetic(name: string, scope: BindingScope, declarationRange?: [number, number]): LocalId;
}

export function bindingIdentifiers(pattern: BindingPattern): BindingIdentifier[] {
  switch (pattern.type) {
    case 'Identifier':
      return [pattern];
    case 'AssignmentPattern':
      return bindingIdentifiers(pattern.left);
    case 'ArrayPattern':
      return pattern.elements.flatMap((element) =>
        element === null
          ? []
          : bindingIdentifiers(element.type === 'RestElement' ? element.argument : element)
      );
    case 'ObjectPattern':
      return pattern.properties.flatMap((property) =>
        bindingIdentifiers(property.type === 'Property' ? property.value : property.argument)
      );
  }
}

export function createBindingGraph(program: Program): BindingGraph {
  const bindings: Binding[] = [];
  const declarations = new WeakMap<Node, LocalId>();
  const references = new WeakMap<Node, LocalId>();
  const scopes = new WeakMap<Node, Scope>();
  const moduleScope = createScope(null, true);
  scopes.set(program, moduleScope);

  const declare = (
    node: Node,
    scope: Scope,
    bindingScope: BindingScope,
    varKind: VarKind | null
  ): LocalId => {
    const name = node.type === 'Identifier' ? node.name : '';
    const existing = scope.bindings.get(name);
    if (existing !== undefined) {
      declarations.set(node, existing);
      return existing;
    }
    const id = bindings.length;
    bindings.push({
      id,
      name,
      scope: bindingScope,
      varKind,
      declarationRange: [node.start, node.end],
    });
    scope.bindings.set(name, id);
    declarations.set(node, id);
    return id;
  };

  const declarePattern = (
    pattern: BindingPattern,
    scope: Scope,
    bindingScope: BindingScope,
    varKind: VarKind | null
  ): void => {
    for (const identifier of bindingIdentifiers(pattern)) {
      declare(identifier, scope, bindingScope, varKind);
    }
  };

  function collectFunction(node: Function | ArrowFunctionExpression, parentScope: Scope): void {
    const nameScope =
      node.type === 'FunctionExpression' && node.id !== null
        ? createScope(parentScope, false)
        : parentScope;
    const functionScope = createScope(nameScope, true);
    scopes.set(node, functionScope);
    if (node.type === 'FunctionExpression' && node.id !== null) {
      declare(node.id, nameScope, BindingScope.Local, null);
    }
    for (const param of node.params) {
      const pattern =
        param.type === 'TSParameterProperty'
          ? param.parameter
          : param.type === 'RestElement'
            ? param.argument
            : param;
      declarePattern(pattern, functionScope, BindingScope.Param, null);
      collectPatternExpressions(pattern, functionScope);
    }
    if (node.body === null) {
      return;
    }
    scopes.set(node.body, functionScope);
    if (node.body.type === 'BlockStatement') {
      node.body.body.forEach((statement) => collect(statement, functionScope));
    } else {
      collect(node.body, functionScope);
    }
  }

  function collectClass(
    node: Extract<Node, { type: 'ClassDeclaration' | 'ClassExpression' }>,
    parentScope: Scope
  ): void {
    const classScope = createScope(parentScope, false);
    scopes.set(node, classScope);
    if (node.type === 'ClassExpression' && node.id !== null) {
      declare(node.id, classScope, BindingScope.Local, null);
    }
    if (node.superClass !== null) {
      scopes.set(node.superClass, parentScope);
    }
    collect(node.superClass, parentScope);
    collect(node.body, classScope);
  }

  function collectPatternExpressions(pattern: BindingPattern, scope: Scope): void {
    switch (pattern.type) {
      case 'Identifier':
        return;
      case 'AssignmentPattern':
        collect(pattern.right, scope);
        collectPatternExpressions(pattern.left, scope);
        return;
      case 'ArrayPattern':
        for (const element of pattern.elements) {
          if (element !== null) {
            collectPatternExpressions(
              element.type === 'RestElement' ? element.argument : element,
              scope
            );
          }
        }
        return;
      case 'ObjectPattern':
        for (const property of pattern.properties) {
          if (property.type === 'Property') {
            if (property.computed) {
              collect(property.key, scope);
            }
            collectPatternExpressions(property.value, scope);
          } else {
            collectPatternExpressions(property.argument, scope);
          }
        }
    }
  }

  const collect = (value: unknown, scope: Scope): void => {
    if (Array.isArray(value)) {
      value.forEach((item) => collect(item, scope));
      return;
    }
    if (!isNode(value)) {
      return;
    }
    switch (value.type) {
      case 'Program':
        value.body.forEach((statement) => collect(statement, scope));
        return;
      case 'ImportDeclaration':
        for (const specifier of value.specifiers) {
          declare(specifier.local, scope, BindingScope.Import, null);
        }
        return;
      case 'VariableDeclaration': {
        const target = value.kind === 'var' ? nearestFunctionScope(scope) : scope;
        const bindingScope = target.parent === null ? BindingScope.Module : BindingScope.Local;
        const varKind = toVarKind(value.kind);
        for (const declarator of value.declarations) {
          declarePattern(declarator.id, target, bindingScope, varKind);
          collectPatternExpressions(declarator.id, scope);
          collect(declarator.init, scope);
        }
        return;
      }
      case 'FunctionDeclaration':
        if (value.id !== null) {
          declare(
            value.id,
            scope,
            scope.parent === null ? BindingScope.Module : BindingScope.Local,
            null
          );
        }
        collectFunction(value, scope);
        return;
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        collectFunction(value, scope);
        return;
      case 'BlockStatement': {
        const blockScope = createScope(scope, false);
        scopes.set(value, blockScope);
        value.body.forEach((statement) => collect(statement, blockScope));
        return;
      }
      case 'CatchClause': {
        const catchScope = createScope(scope, false);
        scopes.set(value, catchScope);
        if (value.param !== null) {
          declarePattern(value.param, catchScope, BindingScope.Local, null);
          collectPatternExpressions(value.param, catchScope);
        }
        collect(value.body, catchScope);
        return;
      }
      case 'ForStatement':
      case 'ForInStatement':
      case 'ForOfStatement':
      case 'SwitchStatement': {
        const blockScope = createScope(scope, false);
        scopes.set(value, blockScope);
        collectChildren(value, (child) => collect(child, blockScope));
        return;
      }
      case 'ClassDeclaration':
        if (value.id !== null) {
          declare(
            value.id,
            scope,
            scope.parent === null ? BindingScope.Module : BindingScope.Local,
            null
          );
        }
        collectClass(value, scope);
        return;
      case 'ClassExpression':
        collectClass(value, scope);
        return;
      default:
        collectChildren(value, (child) => collect(child, scope));
    }
  };

  collect(program, moduleScope);

  const resolveReferences = (
    value: unknown,
    scope: Scope,
    parent: Node | null,
    key: string
  ): void => {
    if (Array.isArray(value)) {
      value.forEach((item) => resolveReferences(item, scope, parent, key));
      return;
    }
    if (!isNode(value)) {
      return;
    }
    const activeScope = scopes.get(value) ?? scope;
    if (value.type === 'Identifier') {
      if (!declarations.has(value) && isReference(parent, key)) {
        const binding = findBinding(activeScope, value.name);
        if (binding !== null) {
          references.set(value, binding);
        }
      }
      return;
    }
    if (value.type === 'JSXIdentifier' && isJsxTagReference(parent, key)) {
      const binding = findBinding(activeScope, value.name);
      if (binding !== null) {
        references.set(value, binding);
      }
      return;
    }
    for (const childKey of Object.keys(value)) {
      if (!IGNORED_KEYS.has(childKey)) {
        resolveReferences((value as WalkableNode)[childKey], activeScope, value, childKey);
      }
    }
  };
  resolveReferences(program, moduleScope, null, '');

  return {
    bindings,
    declaration: (node) => declarations.get(node) ?? null,
    reference: (node) => references.get(node) ?? null,
    addSynthetic: (name, scope, declarationRange) => {
      const id = bindings.length;
      bindings.push({ id, name, scope, varKind: null, declarationRange: declarationRange ?? null });
      return id;
    },
  };
}

function isJsxTagReference(parent: Node | null, key: string): boolean {
  return (
    key === 'name' && (parent?.type === 'JSXOpeningElement' || parent?.type === 'JSXClosingElement')
  );
}

function createScope(parent: Scope | null, functionBoundary: boolean): Scope {
  return { parent, bindings: new Map(), functionBoundary };
}

function nearestFunctionScope(scope: Scope): Scope {
  let current = scope;
  while (!current.functionBoundary) {
    current = current.parent!;
  }
  return current;
}

function findBinding(scope: Scope, name: string): LocalId | null {
  let current: Scope | null = scope;
  while (current !== null) {
    const binding = current.bindings.get(name);
    if (binding !== undefined) {
      return binding;
    }
    current = current.parent;
  }
  return null;
}

function toVarKind(kind: string): VarKind | null {
  switch (kind) {
    case 'const':
      return VarKind.Const;
    case 'let':
      return VarKind.Let;
    case 'var':
      return VarKind.Var;
    default:
      return null;
  }
}

function isReference(parent: Node | null, key: string): boolean {
  if (parent === null) {
    return false;
  }
  if (parent.type === 'MemberExpression' && key === 'property' && !parent.computed) {
    return false;
  }
  if (parent.type === 'Property' && key === 'key' && !parent.computed) {
    return false;
  }
  if (
    (parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition') &&
    key === 'key' &&
    !parent.computed
  ) {
    return false;
  }
  if (
    (parent.type === 'ImportSpecifier' && key === 'imported') ||
    (parent.type === 'ExportSpecifier' && key === 'exported')
  ) {
    return false;
  }
  if (
    (parent.type === 'LabeledStatement' && key === 'label') ||
    ((parent.type === 'BreakStatement' || parent.type === 'ContinueStatement') && key === 'label')
  ) {
    return false;
  }
  return parent.type !== 'MetaProperty';
}

const IGNORED_KEYS = new Set(['type', 'start', 'end', 'range', 'parent']);

function collectChildren(node: Node, visit: (child: unknown) => void): void {
  for (const key of Object.keys(node)) {
    if (!IGNORED_KEYS.has(key)) {
      visit((node as WalkableNode)[key]);
    }
  }
}
