import type { JSXAttributeItem, Program, VariableDeclaration } from 'oxc-parser';
import {
  getIdentifierName,
  getJsxAttributeName,
  getRange,
  isFunctionLike,
  jsxEventToHtmlAttribute,
  unwrapExpression,
} from '../ast-utils';
import type { AstFunction, AstNode } from '../types';
import { getJsxBranchExpression } from './ast-utils';
import type { ExtractedQrls, ModuleDeclaration, Segment, SegmentCapture } from './types';
import { QWIK_CORE_IMPORT, QWIK_IMPORT, QwikHooks } from './words';

type CaptureSource = SegmentCapture['source'];
type ScopeKind = 'module' | 'function' | 'block';

interface Binding {
  id: number;
  name: string;
  owner: number;
  source: CaptureSource;
  module: boolean;
  qrlName: string | null;
  importSource: string | null;
}

interface Scope {
  parent: number | null;
  owner: number;
  kind: ScopeKind;
  bindings: Map<string, Binding>;
}

interface SegmentState {
  segment: Segment;
  owner: number;
  captures: Set<number>;
  moduleReferences: Set<number>;
}

interface QrlCallee {
  name: string;
  qwik: boolean;
}

export function extractQrls(program: Program, path: string): ExtractedQrls {
  return new QrlExtractor(path).extract(program);
}

export function isSetupQrlSegment(segment: Segment): boolean {
  return (
    segment.kind === 'qrl' &&
    segment.qwik &&
    (segment.ctxName === QwikHooks.Dollar ||
      segment.ctxName === QwikHooks.UseComputed ||
      segment.ctxName === QwikHooks.UseAsync ||
      segment.ctxName === QwikHooks.UseSerializer ||
      segment.ctxName === QwikHooks.UseTask ||
      segment.ctxName === QwikHooks.UseVisibleTask)
  );
}

class QrlExtractor {
  private readonly scopes: Scope[] = [];
  private readonly ownerParents: Array<number | null> = [null];
  private readonly bindings = new Map<number, Binding>();
  private readonly segments: Segment[] = [];
  private readonly moduleDeclarations: ModuleDeclaration[] = [];
  private readonly segmentStack: SegmentState[] = [];
  private scope = -1;
  private owner = 0;
  private nextBindingId = 0;
  private nextOwner = 1;
  private nextSegment = 0;

  constructor(private readonly path: string) {}

  extract(program: Program): ExtractedQrls {
    this.scope = this.createScope(null, 0, 'module');
    this.predeclareStatements(program.body);
    for (const statement of program.body) {
      const declaration = this.createModuleDeclaration(statement);
      this.visit(statement);
      if (declaration !== null) {
        this.moduleDeclarations.push(declaration);
      }
    }
    return {
      segments: this.segments,
      moduleDeclarations: this.moduleDeclarations,
    };
  }

  private visit(node: unknown): void {
    if (!isNode(node)) {
      return;
    }
    switch (node.type) {
      case 'ImportDeclaration':
        for (const specifier of node.specifiers) {
          const name = getIdentifierName(specifier.local);
          if (name !== null) {
            this.defineBinding(
              name,
              'local',
              this.scope,
              getImportedName(specifier),
              node.source.value
            );
          }
        }
        return;
      case 'ExportNamedDeclaration':
      case 'ExportDefaultDeclaration':
        this.visit(node.declaration);
        return;
      case 'VariableDeclaration':
        this.visitVariableDeclaration(node);
        return;
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        this.visitFunction(node);
        return;
      case 'BlockStatement':
        this.withScope('block', () => {
          this.predeclareStatements(node.body);
          for (const statement of node.body) {
            this.visit(statement);
          }
        });
        return;
      case 'CallExpression':
        this.visitCallExpression(node);
        return;
      case 'ExpressionStatement':
        this.visit(node.expression);
        return;
      case 'ReturnStatement':
        this.visit(node.argument);
        return;
      case 'NewExpression':
        this.visit(node.callee);
        for (const argument of node.arguments) {
          this.visit(argument);
        }
        return;
      case 'MemberExpression':
        this.visit(node.object);
        if (node.computed) {
          this.visit(node.property);
        }
        return;
      case 'ChainExpression':
        this.visit(node.expression);
        return;
      case 'Identifier':
        this.recordReference(node.name);
        return;
      case 'JSXElement':
        this.visitJsxAttributes(node.openingElement.attributes, node.openingElement);
        for (const child of node.children) {
          this.visitJsxChild(child);
        }
        return;
      case 'JSXFragment':
        for (const child of node.children) {
          this.visitJsxChild(child);
        }
        return;
      case 'JSXAttribute':
        this.visitJsxAttribute(node);
        return;
      case 'JSXSpreadAttribute':
        this.visit(node.argument);
        return;
      case 'JSXExpressionContainer':
        this.visit(node.expression);
        return;
      case 'JSXText':
      case 'JSXEmptyExpression':
        return;
      case 'ObjectExpression':
        for (const property of node.properties) {
          this.visitObjectProperty(property);
        }
        return;
      case 'ArrayExpression':
        for (const element of node.elements) {
          this.visit(element);
        }
        return;
      case 'Property':
      case 'SpreadElement':
        this.visitObjectProperty(node);
        return;
      case 'AssignmentExpression':
      case 'AssignmentPattern':
        this.visit(node.left);
        this.visit(node.right);
        return;
      case 'UpdateExpression':
      case 'UnaryExpression':
      case 'YieldExpression':
        this.visit(node.argument);
        return;
      case 'AwaitExpression':
        this.recordAwait(node);
        this.visit(node.argument);
        return;
      case 'BinaryExpression':
      case 'LogicalExpression':
        this.visit(node.left);
        this.visit(node.right);
        return;
      case 'ConditionalExpression':
        this.visit(node.test);
        this.visit(node.consequent);
        this.visit(node.alternate);
        return;
      case 'TemplateLiteral':
        for (const expression of node.expressions) {
          this.visit(expression);
        }
        return;
      case 'TaggedTemplateExpression':
        this.visit(node.tag);
        this.visit(node.quasi);
        return;
      case 'IfStatement':
        this.visit(node.test);
        this.visit(node.consequent);
        this.visit(node.alternate);
        return;
      case 'ForStatement':
        this.withScope('block', () => {
          if (node.init?.type === 'VariableDeclaration') {
            this.visitVariableDeclaration(node.init, 'loop');
          } else {
            this.visit(node.init);
          }
          this.visit(node.test);
          this.visit(node.update);
          this.visit(node.body);
        });
        return;
      case 'ForInStatement':
      case 'ForOfStatement':
        this.withScope('block', () => {
          this.visit(node.right);
          if (node.left.type === 'VariableDeclaration') {
            this.visitVariableDeclaration(node.left, 'loop');
          } else {
            this.visit(node.left);
          }
          this.visit(node.body);
        });
        return;
      case 'WhileStatement':
      case 'DoWhileStatement':
        this.visit(node.test);
        this.visit(node.body);
        return;
      case 'TSAsExpression':
      case 'TSSatisfiesExpression':
      case 'TSNonNullExpression':
      case 'TSTypeAssertion':
      case 'TSInstantiationExpression':
        this.visit(node.expression);
        return;
      default:
        if (!node.type.startsWith('TS')) {
          this.visitUnknownChildren(node);
        }
    }
  }

  private visitVariableDeclaration(
    node: VariableDeclaration,
    source: CaptureSource = 'local'
  ): void {
    const targetScope = node.kind === 'var' ? this.nearestFunctionScope() : this.scope;
    for (const declaration of node.declarations) {
      this.definePatternBindings(declaration.id, source, targetScope);
      this.visitPatternExpressions(declaration.id);
      this.visit(declaration.init);
    }
  }

  private visitFunction(fn: AstFunction, paramSource: CaptureSource = 'param', segment?: Segment) {
    const previousScope = this.scope;
    const previousOwner = this.owner;
    const owner = this.nextOwner++;
    this.ownerParents[owner] = previousOwner;
    this.scope = this.createScope(previousScope, owner, 'function');
    this.owner = owner;

    if (fn.type === 'FunctionExpression') {
      const name = getIdentifierName(fn.id);
      if (name !== null) {
        this.defineBinding(name, 'local', this.scope);
      }
    }
    for (const param of fn.params) {
      this.definePatternBindings(param, paramSource, this.scope);
    }
    const state = segment
      ? { segment, owner, captures: new Set<number>(), moduleReferences: new Set<number>() }
      : null;
    if (state !== null) {
      this.segmentStack.push(state);
    }
    for (const param of fn.params) {
      this.visitPatternExpressions(param);
    }
    const body = unwrapExpression(fn.body);
    if (body?.type === 'BlockStatement') {
      this.predeclareStatements(body.body);
      for (const statement of body.body) {
        this.visit(statement);
      }
    } else {
      this.visit(body);
    }
    if (state !== null) {
      this.segmentStack.pop();
      this.propagateCaptures(state);
    }
    this.scope = previousScope;
    this.owner = previousOwner;
  }

  private visitCallExpression(node: Extract<AstNode, { type: 'CallExpression' }>) {
    const callee = this.getQrlCallee(node.callee);
    const firstArgument = getArgumentExpression(node.arguments[0]);
    if (
      callee !== null &&
      !(callee.qwik && callee.name === QwikHooks.Component) &&
      isFunctionLike(firstArgument)
    ) {
      if (!callee.qwik) {
        this.visit(node.callee);
      }
      const segment = this.createSegment(
        callee.name,
        node,
        firstArgument,
        null,
        node.callee,
        node.arguments,
        callee.qwik
      );
      if (segment !== null) {
        this.visitFunction(firstArgument, 'param', segment);
      }
      for (let i = 1; i < node.arguments.length; i++) {
        this.visit(node.arguments[i]);
      }
      return;
    }

    this.visit(node.callee);
    const iteration = isIterationCall(node);
    for (let i = 0; i < node.arguments.length; i++) {
      const argument = node.arguments[i];
      const expression = unwrapExpression(
        argument.type === 'SpreadElement' ? argument.argument : argument
      );
      if (i === 0 && iteration && isFunctionLike(expression)) {
        this.visitFunction(expression, 'loop');
      } else {
        this.visit(argument);
      }
    }
  }

  private visitJsxAttribute(node: JSXAttributeItem) {
    if (node.type === 'JSXSpreadAttribute') {
      if (this.visitJsxExpressionSegment('props', unwrapExpression(node.argument))) {
        return;
      }
      this.visit(node.argument);
      return;
    }
    const ctxName = getJsxAttributeName(node.name);
    const expression =
      node.value?.type === 'JSXExpressionContainer'
        ? unwrapExpression(node.value.expression)
        : null;
    if (ctxName?.endsWith('$') && isFunctionLike(expression)) {
      const segment = this.createSegment(
        ctxName,
        node,
        expression,
        jsxEventToHtmlAttribute(ctxName),
        null,
        [],
        true
      );
      if (segment !== null) {
        this.visitFunction(expression, 'param', segment);
      }
      return;
    }
    if (
      ctxName !== null &&
      !ctxName.endsWith('$') &&
      this.visitJsxExpressionSegment(ctxName, expression)
    ) {
      return;
    }
    this.visit(node.value);
  }

  private visitJsxAttributes(attributes: JSXAttributeItem[], boundary: AstNode) {
    const spreads = attributes.filter((attr) => attr.type === 'JSXSpreadAttribute');
    if (spreads.length >= 2) {
      const segment = this.createExpressionSegment('props', boundary);
      if (segment !== null) {
        for (const attr of attributes) {
          if (attr.type === 'JSXAttribute') {
            this.visitJsxAttribute(attr);
          }
        }
        this.visitExpressionsSegment(
          spreads.map((spread) => unwrapExpression(spread.argument)).filter(isNode),
          segment
        );
        return;
      }
    }

    for (const attr of attributes) {
      this.visitJsxAttribute(attr);
    }
  }

  private visitJsxChild(node: unknown) {
    if (isNode(node) && node.type === 'JSXExpressionContainer') {
      const expression = unwrapExpression(node.expression);
      if (
        this.visitJsxBranchSegments(expression) ||
        this.visitJsxExpressionSegment('text', expression)
      ) {
        return;
      }
    }
    this.visit(node);
  }

  private visitJsxBranchSegments(expression: AstNode | null | undefined): boolean {
    const branch = getJsxBranchExpression(expression);
    if (branch === null) {
      return false;
    }
    const parts = [
      ['branch:condition', 'branchCondition', branch.condition],
      ['branch:then', 'branchRender', branch.then],
      ...(branch.else === null ? [] : ([['branch:else', 'branchRender', branch.else]] as const)),
    ] as const;
    if (parts.some(([, , part]) => getRange(part) === null)) {
      return false;
    }
    for (const [ctxName, kind, part] of parts) {
      const segment = this.createExpressionSegment(ctxName, part, kind)!;
      if (kind === 'branchRender') {
        this.visitExpressionsSegment([part], segment, (expression) => {
          if (
            !this.visitJsxBranchSegments(expression) &&
            !this.visitJsxExpressionSegment('text', expression)
          ) {
            this.visit(expression);
          }
        });
      } else {
        this.visitExpressionsSegment([part], segment);
      }
    }
    return true;
  }

  private visitJsxExpressionSegment(
    ctxName: string,
    expression: AstNode | null | undefined
  ): boolean {
    switch (expression?.type) {
      case 'CallExpression':
        if (ctxName === 'text') {
          return false;
        }
        break;
      case 'ConditionalExpression':
      case 'LogicalExpression':
      case 'Identifier':
      case 'BinaryExpression':
      case 'UnaryExpression':
      case 'TemplateLiteral':
      case 'MemberExpression':
      case 'ObjectExpression':
        break;
      default:
        return false;
    }
    const segment = this.createExpressionSegment(ctxName, expression);
    if (segment === null) {
      return false;
    }
    this.visitExpressionsSegment([expression], segment);
    return true;
  }

  private createExpressionSegment(
    ctxName: string,
    expression: AstNode,
    kind: 'expression' | 'branchCondition' | 'branchRender' = 'expression'
  ): Segment | null {
    const range = getRange(expression);
    if (range === null) {
      return null;
    }
    const id = `segment_${this.nextSegment++}`;
    const segment: Segment = {
      id,
      parentId: this.segmentStack[this.segmentStack.length - 1]?.segment.id ?? null,
      name: createSegmentName(this.path, ctxName, id),
      kind,
      ctxName,
      qwik: false,
      range,
      functionRange: range,
      calleeRange: null,
      argumentRanges: [],
      paramRanges: [],
      bodyRange: range,
      bodyKind: 'expression',
      awaits: [],
      captures: [],
      moduleReferences: [],
    };
    this.segments.push(segment);
    return segment;
  }

  private visitExpressionsSegment(
    expressions: readonly AstNode[],
    segment: Segment,
    visitor: (expression: AstNode) => void = (expression) => this.visit(expression)
  ) {
    const previousOwner = this.owner;
    const owner = this.nextOwner++;
    this.ownerParents[owner] = previousOwner;
    this.owner = owner;
    const state = {
      segment,
      owner,
      captures: new Set<number>(),
      moduleReferences: new Set<number>(),
    };
    this.segmentStack.push(state);
    for (const expression of expressions) {
      visitor(expression);
    }
    this.segmentStack.pop();
    this.propagateCaptures(state);
    this.owner = previousOwner;
  }

  private createSegment(
    ctxName: string,
    boundary: unknown,
    fn: AstFunction,
    eventName: string | null,
    callee: unknown = null,
    args: readonly unknown[] = [],
    qwik = false
  ): Segment | null {
    const range = getRange(boundary);
    const functionRange = getRange(fn);
    const bodyRange = getRange(fn.body);
    if (range === null || functionRange === null || bodyRange === null) {
      return null;
    }
    const id = `segment_${this.nextSegment++}`;
    const segment: Segment = {
      id,
      parentId: this.segmentStack[this.segmentStack.length - 1]?.segment.id ?? null,
      name: createSegmentName(this.path, eventName ?? ctxName, id),
      kind: eventName === null ? 'qrl' : 'event',
      ctxName,
      qwik,
      range,
      functionRange,
      calleeRange: getRange(callee),
      argumentRanges: args.map(getArgumentExpression).map(getRange),
      paramRanges: fn.params.map(getRange).filter((range) => range !== null),
      bodyRange,
      bodyKind: unwrapExpression(fn.body)?.type === 'BlockStatement' ? 'block' : 'expression',
      awaits: [],
      captures: [],
      moduleReferences: [],
    };
    this.segments.push(segment);
    return segment;
  }

  private recordAwait(node: Extract<AstNode, { type: 'AwaitExpression' }>) {
    const state = this.segmentStack[this.segmentStack.length - 1];
    if (state === undefined || state.owner !== this.owner) {
      return;
    }
    const range = getRange(node);
    const argumentRange = getRange(node.argument);
    if (range !== null && argumentRange !== null) {
      state.segment.awaits.push({ range, argumentRange });
    }
  }

  private recordReference(name: string) {
    const state = this.segmentStack[this.segmentStack.length - 1];
    const binding = this.resolveBinding(name);
    if (binding === null) {
      return;
    }
    if (state === undefined) {
      return;
    }
    if (binding.module) {
      if (!state.moduleReferences.has(binding.id)) {
        state.moduleReferences.add(binding.id);
        state.segment.moduleReferences.push(name);
      }
      return;
    }
    if (this.isOuterOwner(binding.owner, state.owner) && !state.captures.has(binding.id)) {
      this.addCapture(state, binding);
    }
  }

  private visitObjectProperty(node: Extract<AstNode, { type: 'Property' | 'SpreadElement' }>) {
    if (node.type === 'SpreadElement') {
      this.visit(node.argument);
      return;
    }
    if (node.computed) {
      this.visit(node.key);
    }
    if (node.value !== node.key) {
      this.visit(node.value);
    } else if (node.shorthand) {
      this.visit(node.key);
    }
  }

  private predeclareStatements(statements: AstNode[]) {
    for (const statement of statements) {
      this.predeclareStatement(statement);
    }
  }

  private predeclareStatement(statement: AstNode | null | undefined): void {
    if (
      statement?.type === 'ExportNamedDeclaration' ||
      statement?.type === 'ExportDefaultDeclaration'
    ) {
      this.predeclareStatement(statement.declaration);
    } else if (statement?.type === 'ImportDeclaration') {
      for (const specifier of statement.specifiers) {
        const name = getIdentifierName(specifier.local);
        if (name !== null) {
          this.defineBinding(
            name,
            'local',
            this.scope,
            getImportedName(specifier),
            statement.source.value
          );
        }
      }
    } else if (statement?.type === 'VariableDeclaration') {
      const targetScope = statement.kind === 'var' ? this.nearestFunctionScope() : this.scope;
      for (const declaration of statement.declarations) {
        this.definePatternBindings(declaration.id, 'local', targetScope);
      }
    } else if (
      statement?.type === 'FunctionDeclaration' ||
      statement?.type === 'ClassDeclaration'
    ) {
      const name = getIdentifierName(statement.id);
      if (name !== null) {
        this.defineBinding(name, 'local', this.scope);
      }
    }
  }

  private definePatternBindings(pattern: unknown, source: CaptureSource, scope: number): void {
    const node = unwrapExpression(pattern);
    if (!node) {
      return;
    }
    if (node.type === 'Identifier') {
      this.defineBinding(node.name, source, scope);
    } else if (node.type === 'AssignmentPattern') {
      this.definePatternBindings(node.left, source, scope);
    } else if (node.type === 'RestElement') {
      this.definePatternBindings(node.argument, source, scope);
    } else if (node.type === 'ArrayPattern') {
      for (const element of node.elements) {
        this.definePatternBindings(element, source, scope);
      }
    } else if (node.type === 'ObjectPattern') {
      for (const property of node.properties) {
        this.definePatternBindings(
          property.type === 'RestElement' ? property.argument : property.value,
          source,
          scope
        );
      }
    }
  }

  private visitPatternExpressions(pattern: unknown): void {
    const node = unwrapExpression(pattern);
    if (!node) {
      return;
    }
    if (node.type === 'AssignmentPattern') {
      this.visitPatternExpressions(node.left);
      this.visit(node.right);
    } else if (node.type === 'RestElement') {
      this.visitPatternExpressions(node.argument);
    } else if (node.type === 'ArrayPattern') {
      for (const element of node.elements) {
        this.visitPatternExpressions(element);
      }
    } else if (node.type === 'ObjectPattern') {
      for (const property of node.properties) {
        if (property.type === 'RestElement') {
          this.visitPatternExpressions(property.argument);
        } else {
          if (property.computed) {
            this.visit(property.key);
          }
          this.visitPatternExpressions(property.value);
        }
      }
    }
  }

  private defineBinding(
    name: string,
    source: CaptureSource,
    scopeId: number,
    qrlName: string | null = null,
    importSource: string | null = null
  ): Binding {
    const existing = this.scopes[scopeId].bindings.get(name);
    if (existing !== undefined) {
      return existing;
    }
    const scope = this.scopes[scopeId];
    const binding = {
      id: this.nextBindingId++,
      name,
      owner: scope.owner,
      source,
      module: scope.kind === 'module',
      qrlName,
      importSource,
    };
    scope.bindings.set(name, binding);
    this.bindings.set(binding.id, binding);
    return binding;
  }

  private resolveBinding(name: string): Binding | null {
    let scope: number | null = this.scope;
    while (scope !== null) {
      const binding = this.scopes[scope].bindings.get(name);
      if (binding !== undefined) {
        return binding;
      }
      scope = this.scopes[scope].parent;
    }
    return null;
  }

  private withScope(kind: ScopeKind, visit: () => void) {
    const previous = this.scope;
    this.scope = this.createScope(previous, this.owner, kind);
    visit();
    this.scope = previous;
  }

  private createScope(parent: number | null, owner: number, kind: ScopeKind): number {
    const id = this.scopes.length;
    this.scopes.push({ parent, owner, kind, bindings: new Map() });
    return id;
  }

  private nearestFunctionScope(): number {
    let scope: number | null = this.scope;
    while (scope !== null) {
      if (this.scopes[scope].kind !== 'block') {
        return scope;
      }
      scope = this.scopes[scope].parent;
    }
    return this.scope;
  }

  private isOuterOwner(bindingOwner: number, segmentOwner: number): boolean {
    let owner = this.ownerParents[segmentOwner] ?? null;
    while (owner !== null) {
      if (owner === bindingOwner) {
        return true;
      }
      owner = this.ownerParents[owner] ?? null;
    }
    return false;
  }

  private propagateCaptures(child: SegmentState): void {
    const parent = this.segmentStack[this.segmentStack.length - 1];
    if (parent === undefined) {
      return;
    }
    for (const id of child.captures) {
      const binding = this.bindings.get(id);
      if (binding !== undefined && this.isOuterOwner(binding.owner, parent.owner)) {
        this.addCapture(parent, binding);
      }
    }
  }

  private addCapture(state: SegmentState, binding: Binding): void {
    if (!state.captures.has(binding.id)) {
      state.captures.add(binding.id);
      state.segment.captures.push({ name: binding.name, source: binding.source });
    }
  }

  private getQrlCallee(callee: unknown): QrlCallee | null {
    const expression = unwrapExpression(callee);
    const localName = getIdentifierName(expression);
    if (localName !== null) {
      const binding = this.resolveBinding(localName);
      const name = binding?.qrlName ?? (localName.endsWith('$') ? localName : null);
      return name === null ? null : { name, qwik: isQwikImport(binding?.importSource) };
    }
    if (expression?.type === 'MemberExpression' && !expression.computed) {
      const propertyName = getIdentifierName(expression.property);
      if (!propertyName?.endsWith('$')) {
        return null;
      }
      const namespace = getIdentifierName(unwrapExpression(expression.object));
      const binding = namespace === null ? null : this.resolveBinding(namespace);
      return { name: propertyName, qwik: isQwikImport(binding?.importSource) };
    }
    return null;
  }

  private createModuleDeclaration(statement: AstNode): ModuleDeclaration | null {
    const declaration =
      statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration'
        ? statement.declaration
        : statement;
    const range = getRange(statement);
    if (range === null || declaration === null || declaration === undefined) {
      return null;
    }
    const names = getDeclarationNames(declaration);
    if (names.length === 0) {
      return null;
    }
    return {
      range,
      names,
      exported: statement.type === 'ExportNamedDeclaration',
    };
  }

  private visitUnknownChildren(node: AstNode) {
    for (const [key, value] of Object.entries(node)) {
      if (SKIPPED_KEYS.has(key)) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const child of value) {
          this.visit(child);
        }
      } else {
        this.visit(value);
      }
    }
  }
}

const SKIPPED_KEYS = new Set([
  'type',
  'start',
  'end',
  'range',
  'loc',
  'decorators',
  'typeAnnotation',
  'typeParameters',
  'returnType',
]);

function isIterationCall(node: Extract<AstNode, { type: 'CallExpression' }>): boolean {
  const callee = unwrapExpression(node.callee);
  if (callee?.type !== 'MemberExpression' || callee.computed) {
    return false;
  }
  const name = getIdentifierName(callee.property);
  return name !== null && ITERATION_METHODS.has(name);
}

function getArgumentExpression(argument: unknown): unknown {
  const expression = unwrapExpression(argument);
  return expression?.type === 'SpreadElement' ? expression.argument : expression;
}

function getImportedName(specifier: AstNode): string | null {
  if (specifier.type !== 'ImportSpecifier' || specifier.importKind === 'type') {
    return null;
  }
  const importedName = getIdentifierName(specifier.imported);
  return importedName?.endsWith('$') ? importedName : null;
}

function isQwikImport(source: string | null | undefined): boolean {
  return source === QWIK_IMPORT || source === QWIK_CORE_IMPORT;
}

function getDeclarationNames(node: unknown): string[] {
  const declaration = unwrapExpression(node);
  if (declaration === null || declaration === undefined) {
    return [];
  }
  if (
    declaration.type === 'FunctionDeclaration' ||
    declaration.type === 'ClassDeclaration' ||
    declaration.type === 'TSEnumDeclaration'
  ) {
    const name = getIdentifierName(declaration.id);
    return name === null ? [] : [name];
  }
  if (declaration.type === 'VariableDeclaration') {
    return declaration.declarations.flatMap((item) => getPatternNames(item.id));
  }
  return [];
}

function getPatternNames(pattern: unknown): string[] {
  const node = unwrapExpression(pattern);
  if (node === null || node === undefined) {
    return [];
  }
  if (node.type === 'Identifier') {
    return [node.name];
  }
  if (node.type === 'AssignmentPattern') {
    return getPatternNames(node.left);
  }
  if (node.type === 'RestElement') {
    return getPatternNames(node.argument);
  }
  if (node.type === 'ArrayPattern') {
    return node.elements.flatMap(getPatternNames);
  }
  if (node.type === 'ObjectPattern') {
    return node.properties.flatMap((property) =>
      getPatternNames(property.type === 'RestElement' ? property.argument : property.value)
    );
  }
  return [];
}

const ITERATION_METHODS = new Set([
  'map',
  'filter',
  'forEach',
  'flatMap',
  'some',
  'every',
  'find',
  'findIndex',
  'reduce',
  'reduceRight',
]);

function createSegmentName(path: string, ctxName: string, id: string): string {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  const filename = slash === -1 ? path : path.slice(slash + 1);
  const sourceName = filename.replace(/\.[cm]?[jt]sx?$/, '');
  return sanitizeIdentifier(`${sourceName}_${ctxName}_${id}`);
}

function sanitizeIdentifier(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9_$]/g, '_');
  return /^[A-Za-z_$]/.test(sanitized) ? sanitized : `_${sanitized}`;
}

function isNode(node: unknown): node is AstNode {
  return !!node && typeof node === 'object' && 'type' in node && typeof node.type === 'string';
}
