import type {
  ArrowFunctionExpression,
  BindingIdentifier,
  BindingPattern,
  Function,
  Node,
  Program,
} from 'oxc-parser';
import { BindingScope, ReadRole, VarKind, type LocalId, type ModulePlan } from '../../schema';
import { isNode, type WalkableNode } from './ast-types';

type Binding = ModulePlan['bindings'][number];

interface Scope {
  parent: Scope | null;
  bindings: Map<string, LocalId>;
  functionBoundary: boolean;
}

interface BindingReference {
  node: Extract<Node, { type: 'Identifier' | 'JSXIdentifier' }>;
  binding: LocalId;
  role: ReadRole;
}

export interface BindingGraph {
  readonly bindings: Binding[];
  declaration(node: Node): LocalId | null;
  reference(node: Node): LocalId | null;
  declarationsOf(binding: LocalId): readonly Node[];
  bindingsOf(pattern: BindingPattern): readonly LocalId[];
  freeReferences(roots: Node | Node[]): BindingReference[];
  dependenciesOf<T extends Node>(expression: Node | Node[], candidates: readonly T[]): T[];
  addSynthetic(name: string, scope: BindingScope, declarationRange?: [number, number]): LocalId;
}

function bindingIdentifiers(pattern: BindingPattern): BindingIdentifier[] {
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
  const declarationNodes: Node[][] = [];
  const patternBindings = new WeakMap<BindingPattern, LocalId[]>();
  const orderedReferences: BindingReference[] = [];
  const referenceSpans = new WeakMap<Node, [number, number]>();
  const scopes = new WeakMap<Node, Scope>();
  const moduleScope = createScope(null, true);
  scopes.set(program, moduleScope);

  const declare = (
    node: Node,
    scope: Scope,
    bindingScope: BindingScope,
    varKind: VarKind | null,
    owner: Node = node
  ): LocalId => {
    const name = node.type === 'Identifier' ? node.name : '';
    const existing = scope.bindings.get(name);
    if (existing !== undefined) {
      declarations.set(node, existing);
      if (!declarationNodes[existing].includes(owner)) {
        declarationNodes[existing].push(owner);
      }
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
    declarationNodes.push([owner]);
    return id;
  };

  const declarePattern = (
    pattern: BindingPattern,
    scope: Scope,
    bindingScope: BindingScope,
    varKind: VarKind | null,
    owner: Node = pattern
  ): void => {
    patternBindings.set(
      pattern,
      bindingIdentifiers(pattern).map((identifier) =>
        declare(identifier, scope, bindingScope, varKind, owner)
      )
    );
  };

  function collectFunction(node: Function | ArrowFunctionExpression, parentScope: Scope): void {
    const nameScope =
      node.type === 'FunctionExpression' && node.id !== null
        ? createScope(parentScope, false)
        : parentScope;
    const functionScope = createScope(nameScope, true);
    scopes.set(node, functionScope);
    if (node.type === 'FunctionExpression' && node.id !== null) {
      declare(node.id, nameScope, BindingScope.Local, null, node);
    }
    let hasParameterExpressions = false;
    for (const param of node.params) {
      const pattern =
        param.type === 'TSParameterProperty'
          ? param.parameter
          : param.type === 'RestElement'
            ? param.argument
            : param;
      declarePattern(pattern, functionScope, BindingScope.Param, null);
      hasParameterExpressions =
        collectPatternExpressions(pattern, functionScope) || hasParameterExpressions;
    }
    if (node.body === null) {
      return;
    }
    const bodyScope = hasParameterExpressions ? createScope(functionScope, true) : functionScope;
    scopes.set(node.body, bodyScope);
    if (node.body.type === 'BlockStatement') {
      node.body.body.forEach((statement) => collect(statement, bodyScope));
    } else {
      collect(node.body, bodyScope);
    }
  }

  function collectClass(
    node: Extract<Node, { type: 'ClassDeclaration' | 'ClassExpression' }>,
    parentScope: Scope
  ): void {
    const classScope = createScope(parentScope, false);
    scopes.set(node, classScope);
    if (node.type === 'ClassExpression' && node.id !== null) {
      declare(node.id, classScope, BindingScope.Local, null, node);
    }
    if (node.superClass !== null) {
      scopes.set(node.superClass, parentScope);
    }
    collect(node.superClass, parentScope);
    collect(node.body, classScope);
  }

  function collectPatternExpressions(pattern: BindingPattern, scope: Scope): boolean {
    let hasExpressions = false;
    switch (pattern.type) {
      case 'Identifier':
        return false;
      case 'AssignmentPattern':
        collect(pattern.right, scope);
        collectPatternExpressions(pattern.left, scope);
        return true;
      case 'ArrayPattern':
        for (const element of pattern.elements) {
          if (element !== null) {
            hasExpressions =
              collectPatternExpressions(
                element.type === 'RestElement' ? element.argument : element,
                scope
              ) || hasExpressions;
          }
        }
        return hasExpressions;
      case 'ObjectPattern':
        for (const property of pattern.properties) {
          if (property.type === 'Property') {
            if (property.computed) {
              collect(property.key, scope);
              hasExpressions = true;
            }
            hasExpressions = collectPatternExpressions(property.value, scope) || hasExpressions;
          } else {
            hasExpressions = collectPatternExpressions(property.argument, scope) || hasExpressions;
          }
        }
        return hasExpressions;
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
          declare(specifier.local, scope, BindingScope.Import, null, specifier);
        }
        return;
      case 'VariableDeclaration': {
        const target = value.kind === 'var' ? nearestFunctionScope(scope) : scope;
        const bindingScope = target.parent === null ? BindingScope.Module : BindingScope.Local;
        const varKind = toVarKind(value.kind);
        for (const declarator of value.declarations) {
          declarePattern(declarator.id, target, bindingScope, varKind, declarator);
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
            null,
            value
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
            null,
            value
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
    const start = orderedReferences.length;
    const activeScope = scopes.get(value) ?? scope;
    if (value.type === 'Identifier') {
      if (!declarations.has(value) && isReference(parent, key)) {
        const binding = findBinding(activeScope, value.name);
        if (binding !== null) {
          references.set(value, binding);
          orderedReferences.push({
            node: value,
            binding,
            role: referenceRole(parent, key),
          });
        }
      }
    } else if (value.type === 'JSXIdentifier' && isJsxTagReference(parent, key)) {
      const binding = findBinding(activeScope, value.name);
      if (binding !== null) {
        references.set(value, binding);
        orderedReferences.push({ node: value, binding, role: ReadRole.Read });
      }
    } else if (value.type === 'ParenthesizedExpression') {
      resolveReferences(value.expression, activeScope, parent, key);
    } else {
      for (const childKey of Object.keys(value)) {
        if (!IGNORED_KEYS.has(childKey)) {
          resolveReferences((value as WalkableNode)[childKey], activeScope, value, childKey);
        }
      }
    }
    if (start !== orderedReferences.length) {
      referenceSpans.set(value, [start, orderedReferences.length]);
    }
  };
  resolveReferences(program, moduleScope, null, '');

  const freeReferences = (node: Node | Node[]): BindingReference[] => {
    const roots = Array.isArray(node) ? node : [node];
    const free: BindingReference[] = [];
    for (const root of roots) {
      const span = referenceSpans.get(root);
      if (span === undefined) {
        continue;
      }
      for (let index = span[0]; index < span[1]; index++) {
        const reference = orderedReferences[index];
        const range = bindings[reference.binding].declarationRange;
        if (
          range === null ||
          !roots.some((root) => range[0] >= root.start && range[1] <= root.end)
        ) {
          free.push(reference);
        }
      }
    }
    return free;
  };

  return {
    bindings,
    freeReferences,
    declaration: (node) => declarations.get(node) ?? null,
    reference: (node) => references.get(node) ?? null,
    declarationsOf: (binding) => declarationNodes[binding] ?? [],
    bindingsOf: (pattern) => {
      let found = patternBindings.get(pattern);
      if (found === undefined) {
        found = bindingIdentifiers(pattern).map((identifier) => {
          const binding = declarations.get(identifier);
          if (binding === undefined) {
            throw new Error(`Unknown declaration "${identifier.name}"`);
          }
          return binding;
        });
        patternBindings.set(pattern, found);
      }
      return found;
    },
    dependenciesOf: (expression, candidates) => {
      const allowed = new Set<Node>(candidates);
      const selected = new Set<Node>();
      const pending = Array.isArray(expression) ? [...expression] : [expression];
      for (const node of pending) {
        for (const { binding } of freeReferences(node)) {
          for (const declaration of declarationNodes[binding] ?? []) {
            if (allowed.has(declaration) && !selected.has(declaration)) {
              selected.add(declaration);
              pending.push(declaration);
            }
          }
        }
      }
      return candidates.filter((candidate) => selected.has(candidate));
    },
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

function referenceRole(parent: Node | null, key: string): ReadRole {
  if (parent?.type === 'Property' && parent.shorthand) {
    return ReadRole.Shorthand;
  }
  if (
    (parent?.type === 'CallExpression' && key === 'callee') ||
    (parent?.type === 'TaggedTemplateExpression' && key === 'tag')
  ) {
    return ReadRole.Call;
  }
  return ReadRole.Read;
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
