import {
  getSignalValueSourceName,
  getIdentifierName,
  getJsxName,
  getParams,
  getRange,
  isFunctionLike,
  unwrapExpression,
} from '../ast-utils';
import type {
  Argument,
  CallExpression,
  Class,
  ForInStatement,
  ForOfStatement,
  ForStatement,
  ImportDeclaration,
  ImportDeclarationSpecifier,
  JSXAttributeItem,
  JSXAttributeName,
  JSXElement,
  MemberExpression,
  MetaProperty,
  Program,
  VariableDeclaration,
} from 'oxc-parser';
import type {
  AstFunction,
  AstNode,
  CaptureRecord,
  CompilerContext,
  SegmentRecord,
  SourceRange,
} from '../types';
import { QwikSymbol } from '../words';

const MODULE_FUNCTION_OWNER_ID = 0;

type BindingKind =
  | 'import'
  | 'param'
  | 'loop'
  | 'var'
  | 'let'
  | 'const'
  | 'function'
  | 'class'
  | 'catch';

interface ScopeRecord {
  parentId: number | null;
  functionOwnerId: number;
  kind: 'module' | 'function' | 'block';
  bindings: Map<string, BindingRecord>;
}

interface BindingRecord {
  symbolId: number;
  name: string;
  importedName: string | null;
  scopeId: number;
  functionOwnerId: number;
  kind: BindingKind;
  range: SourceRange | null;
  moduleLevel: boolean;
}

interface SegmentState {
  record: SegmentRecord;
  functionOwnerId: number;
  capturedSymbols: Set<number>;
}

interface SegmentSpec {
  kind: SegmentRecord['kind'];
  ctxName: string;
  range: SourceRange | null;
  functionRange: SourceRange | null;
  captureMode: SegmentRecord['captureMode'];
  explicitCaptures: CaptureRecord[];
}

interface FunctionOptions {
  segment?: SegmentSpec;
  paramKind?: BindingKind;
}

export function analyzeCaptures(ctx: CompilerContext) {
  if (ctx.program === null || !Array.isArray(ctx.program.body)) {
    return;
  }
  new CaptureAnalyzer(ctx).analyze(ctx.program);
}

class CaptureAnalyzer {
  private scopes: ScopeRecord[] = [];
  private currentScopeId = -1;
  private currentFunctionOwnerId = MODULE_FUNCTION_OWNER_ID;
  private functionOwnerParents: Array<number | null> = [null];
  private nextSymbolId = 1;
  private nextFunctionOwnerId = 1;
  private nextSegmentId = 0;
  private segmentStack: SegmentState[] = [];

  constructor(private ctx: CompilerContext) {}

  analyze(program: Program) {
    this.currentScopeId = this.createScope(null, MODULE_FUNCTION_OWNER_ID, 'module');
    this.predeclareStatements(program.body ?? []);
    for (const statement of program.body ?? []) {
      this.visit(statement);
    }
  }

  private visit(node: unknown): void {
    if (!isNode(node)) {
      return;
    }

    switch (node.type) {
      case 'Program':
        this.predeclareStatements(node.body ?? []);
        for (const statement of node.body ?? []) {
          this.visit(statement);
        }
        return;
      case 'ImportDeclaration':
        this.visitImportDeclaration(node);
        return;
      case 'ExportNamedDeclaration':
      case 'ExportDefaultDeclaration':
        this.visit(node.declaration);
        return;
      case 'VariableDeclaration':
        this.visitVariableDeclaration(node);
        return;
      case 'FunctionDeclaration':
        this.visitFunction(node);
        return;
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        this.visitFunction(node);
        return;
      case 'BlockStatement':
        this.withScope('block', () => {
          this.predeclareStatements(node.body ?? []);
          for (const statement of node.body ?? []) {
            this.visit(statement);
          }
        });
        return;
      case 'ExpressionStatement':
        this.visit(node.expression);
        return;
      case 'ReturnStatement':
        this.visit(node.argument);
        return;
      case 'CallExpression':
        this.visitCallExpression(node);
        return;
      case 'NewExpression':
        this.visit(node.callee);
        for (const arg of node.arguments ?? []) {
          this.visit(arg);
        }
        return;
      case 'MemberExpression':
        this.visitMemberExpression(node);
        return;
      case 'ChainExpression':
        this.visit(node.expression);
        return;
      case 'Identifier':
        this.recordReference(node);
        return;
      case 'ThisExpression':
        this.recordSpecialReference('this', node);
        return;
      case 'Super':
        this.recordSpecialReference('super', node);
        return;
      case 'MetaProperty':
        this.visitMetaProperty(node);
        return;
      case 'JSXElement':
        this.visitJsxElement(node);
        return;
      case 'JSXFragment':
        for (const child of node.children ?? []) {
          this.visit(child);
        }
        return;
      case 'JSXExpressionContainer':
        if (node.expression?.type !== 'JSXEmptyExpression') {
          this.visit(node.expression);
        }
        return;
      case 'JSXText':
      case 'JSXEmptyExpression':
        return;
      case 'ObjectExpression':
        for (const prop of node.properties ?? []) {
          this.visitObjectProperty(prop);
        }
        return;
      case 'ArrayExpression':
        for (const element of node.elements ?? []) {
          this.visit(element);
        }
        return;
      case 'Property':
        this.visitObjectProperty(node);
        return;
      case 'SpreadElement':
        this.visit(node.argument);
        return;
      case 'AssignmentExpression':
      case 'AssignmentPattern':
        this.visit(node.left);
        this.visit(node.right);
        return;
      case 'UpdateExpression':
      case 'UnaryExpression':
      case 'AwaitExpression':
      case 'YieldExpression':
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
        for (const expr of node.expressions ?? []) {
          this.visit(expr);
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
        this.visitForStatement(node);
        return;
      case 'ForOfStatement':
      case 'ForInStatement':
        this.visitForInOfStatement(node);
        return;
      case 'WhileStatement':
      case 'DoWhileStatement':
        this.visit(node.test);
        this.visit(node.body);
        return;
      case 'SwitchStatement':
        this.visit(node.discriminant);
        this.withScope('block', () => {
          for (const switchCase of node.cases ?? []) {
            this.visit(switchCase);
          }
        });
        return;
      case 'SwitchCase':
        this.visit(node.test);
        this.predeclareStatements(node.consequent ?? []);
        for (const statement of node.consequent ?? []) {
          this.visit(statement);
        }
        return;
      case 'TryStatement':
        this.visit(node.block);
        this.visit(node.handler);
        this.visit(node.finalizer);
        return;
      case 'CatchClause':
        this.withScope('block', () => {
          if (node.param) {
            this.definePatternBindings(node.param, 'catch', this.currentScopeId);
          }
          this.visit(node.body);
        });
        return;
      case 'ClassDeclaration':
      case 'ClassExpression':
        this.visitClass(node);
        return;
      case 'MethodDefinition':
      case 'PropertyDefinition':
      case 'AccessorProperty':
        if (node.computed) {
          this.visit(node.key);
        }
        this.visit(node.value);
        return;
      case 'TSAsExpression':
      case 'TSSatisfiesExpression':
      case 'TSNonNullExpression':
      case 'TSTypeAssertion':
      case 'TSInstantiationExpression':
        this.visit(node.expression);
        return;
      default:
        if (node.type.startsWith('TS')) {
          return;
        }
        this.visitUnknownChildren(node);
    }
  }

  private visitImportDeclaration(node: ImportDeclaration) {
    for (const specifier of node.specifiers ?? []) {
      const local = specifier.local;
      const name = getIdentifierName(local);
      if (name) {
        this.defineBinding(
          name,
          'import',
          local,
          this.currentScopeId,
          getImportSpecifierName(specifier) ?? name
        );
      }
    }
  }

  private visitVariableDeclaration(node: VariableDeclaration, bindingKind?: BindingKind) {
    const kind = bindingKind ?? variableKindToBindingKind(node.kind);
    const targetScopeId = kind === 'var' ? this.nearestFunctionScopeId() : this.currentScopeId;
    for (const declaration of node.declarations ?? []) {
      this.definePatternBindings(declaration.id, kind, targetScopeId);
      this.visitPatternExpressions(declaration.id);
      this.visit(declaration.init);
    }
  }

  private visitFunction(node: AstFunction, options: FunctionOptions = {}) {
    const previousScopeId = this.currentScopeId;
    const previousFunctionOwnerId = this.currentFunctionOwnerId;
    const functionOwnerId = this.nextFunctionOwnerId++;
    this.functionOwnerParents[functionOwnerId] = previousFunctionOwnerId;
    const functionScopeId = this.createScope(previousScopeId, functionOwnerId, 'function');
    this.currentScopeId = functionScopeId;
    this.currentFunctionOwnerId = functionOwnerId;

    if (node.type === 'FunctionExpression') {
      const name = getIdentifierName(node.id);
      if (name) {
        this.defineBinding(name, 'function', node.id, functionScopeId);
      }
    }

    const paramKind = options.paramKind ?? 'param';
    for (const param of node.params ?? []) {
      this.definePatternBindings(param, paramKind, functionScopeId);
    }

    const segment = options.segment
      ? this.createSegment(options.segment, functionOwnerId, node)
      : null;
    if (segment) {
      this.segmentStack.push(segment);
    }

    for (const param of node.params ?? []) {
      this.visitPatternExpressions(param);
    }

    const body = unwrapExpression(node.body);
    if (body?.type === 'BlockStatement') {
      this.predeclareStatements(body.body ?? []);
      for (const statement of body.body ?? []) {
        this.visit(statement);
      }
    } else {
      this.visit(body);
    }

    if (segment) {
      this.segmentStack.pop();
    }
    this.currentScopeId = previousScopeId;
    this.currentFunctionOwnerId = previousFunctionOwnerId;
  }

  private visitCallExpression(node: CallExpression) {
    const qrlName = this.getQrlCalleeName(node.callee);
    const firstArg = getArgumentExpression(node.arguments?.[0]);
    const isQrlFunctionCall = !!qrlName && isFunctionLike(unwrapExpression(firstArg));
    const isIterationCall = !isQrlFunctionCall && isIterationMethodCall(node);
    const isInlinedQrl = qrlName === QwikSymbol.InlinedQrl;
    const hasExplicitCaptureArray =
      isInlinedQrl &&
      unwrapExpression(getArgumentExpression(node.arguments?.[2]))?.type === 'ArrayExpression';
    const explicitCaptures =
      hasExplicitCaptureArray && node.arguments?.[2]
        ? this.collectExplicitCaptures(getArgumentExpression(node.arguments[2]))
        : [];

    this.visit(node.callee);

    for (let i = 0; i < (node.arguments ?? []).length; i++) {
      const arg = node.arguments[i];
      const expr = unwrapExpression(getArgumentExpression(arg));
      if (i === 0 && isFunctionLike(expr)) {
        if (isQrlFunctionCall) {
          this.visitFunction(expr!, {
            segment: {
              kind: 'function',
              ctxName: qrlName,
              range: getRange(node),
              functionRange: getRange(expr),
              captureMode: hasExplicitCaptureArray ? 'explicit' : 'auto',
              explicitCaptures,
            },
          });
        } else {
          this.visitFunction(expr!, {
            paramKind: isIterationCall ? 'loop' : 'param',
          });
        }
      } else {
        this.visit(arg);
      }
    }
  }

  private visitMemberExpression(node: MemberExpression) {
    this.visit(node.object);
    if (node.computed) {
      this.visit(node.property);
    }
  }

  private visitJsxElement(node: JSXElement) {
    for (const attr of node.openingElement.attributes) {
      this.visitJsxAttribute(attr);
    }
    for (const child of node.children) {
      if (child.type === 'JSXExpressionContainer') {
        this.visitJsxChildExpression(child.expression);
      } else {
        this.visit(child);
      }
    }
  }

  private visitJsxChildExpression(expression: unknown) {
    const expr = unwrapExpression(expression);
    if (!expr || expr.type === 'JSXEmptyExpression') {
      return;
    }
    if (getSignalValueSourceName(expr) !== null) {
      this.visit(expr);
      return;
    }
    const range = getRange(expr);
    if (range === null) {
      this.visit(expr);
      return;
    }

    const segment = this.createSyntheticJsxTextSegment(range);
    this.segmentStack.push(segment);
    this.visit(expr);
    this.segmentStack.pop();
  }

  private visitJsxAttribute(node: JSXAttributeItem) {
    if (node.type === 'JSXSpreadAttribute') {
      this.visit(node.argument);
      return;
    }
    if (node.type !== 'JSXAttribute') {
      return;
    }
    const name = getJsxAttributeName(node.name);
    const expr =
      node.value?.type === 'JSXExpressionContainer'
        ? unwrapExpression(node.value.expression)
        : null;
    if (name && isFunctionLike(expr) && name.endsWith('$')) {
      this.visitFunction(expr!, {
        segment: {
          kind: isJsxEventName(name) ? 'eventHandler' : 'jsxProp',
          ctxName: name,
          range: getRange(node),
          functionRange: getRange(expr),
          captureMode: 'auto',
          explicitCaptures: [],
        },
      });
      return;
    }
    this.visit(node.value);
  }

  private visitObjectProperty(
    node: Extract<AstNode, { type: 'Property' }> | Extract<AstNode, { type: 'SpreadElement' }>
  ) {
    if (node.type === 'SpreadElement') {
      this.visit(node.argument);
      return;
    }
    if (node.computed) {
      this.visit(node.key);
    }
    if (node.value && node.value !== node.key) {
      this.visit(node.value);
    } else if (node.shorthand) {
      this.visit(node.key);
    }
  }

  private visitForStatement(node: ForStatement) {
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
  }

  private visitForInOfStatement(node: ForInStatement | ForOfStatement) {
    this.withScope('block', () => {
      this.visit(node.right);
      if (node.left?.type === 'VariableDeclaration') {
        this.visitVariableDeclaration(node.left, 'loop');
      } else {
        this.visit(node.left);
      }
      this.visit(node.body);
    });
  }

  private visitClass(node: Class) {
    this.visit(node.superClass);
    this.withScope('block', () => {
      const name = node.type === 'ClassExpression' ? getIdentifierName(node.id) : null;
      if (name) {
        this.defineBinding(name, 'class', node.id, this.currentScopeId);
      }
      for (const element of node.body?.body ?? []) {
        if (element.type === 'StaticBlock') {
          this.withScope('block', () => {
            this.predeclareStatements(element.body ?? []);
            for (const statement of element.body ?? []) {
              this.visit(statement);
            }
          });
        } else {
          this.visit(element);
        }
      }
    });
  }

  private visitMetaProperty(node: MetaProperty) {
    const meta = getIdentifierName(node.meta);
    const property = getIdentifierName(node.property);
    if (meta === 'new' && property === 'target') {
      this.recordSpecialReference('new.target', node);
    }
  }

  private visitUnknownChildren(node: AstNode) {
    for (const [key, value] of Object.entries(node)) {
      if (shouldSkipUnknownChild(key)) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          this.visit(item);
        }
      } else {
        this.visit(value);
      }
    }
  }

  private predeclareStatements(statements: AstNode[]) {
    for (const statement of statements) {
      this.predeclareStatement(statement);
      this.predeclareHoistedVars(statement);
    }
  }

  private predeclareStatement(statement: AstNode | null | undefined) {
    if (!statement) {
      return;
    }
    if (
      statement.type === 'ExportNamedDeclaration' ||
      statement.type === 'ExportDefaultDeclaration'
    ) {
      this.predeclareStatement(statement.declaration);
      return;
    }
    if (statement.type === 'VariableDeclaration') {
      const kind = variableKindToBindingKind(statement.kind);
      const targetScopeId = kind === 'var' ? this.nearestFunctionScopeId() : this.currentScopeId;
      for (const declaration of statement.declarations ?? []) {
        this.definePatternBindings(declaration.id, kind, targetScopeId);
      }
      return;
    }
    if (statement.type === 'FunctionDeclaration') {
      const name = getIdentifierName(statement.id);
      if (name) {
        this.defineBinding(name, 'function', statement.id, this.currentScopeId);
      }
      return;
    }
    if (statement.type === 'ClassDeclaration') {
      const name = getIdentifierName(statement.id);
      if (name) {
        this.defineBinding(name, 'class', statement.id, this.currentScopeId);
      }
    }
  }

  private predeclareHoistedVars(node: unknown) {
    if (!isNode(node) || isFunctionLike(node) || node.type.startsWith('Class')) {
      return;
    }
    if (node.type === 'VariableDeclaration') {
      if (node.kind === 'var') {
        const targetScopeId = this.nearestFunctionScopeId();
        for (const declaration of node.declarations ?? []) {
          this.definePatternBindings(declaration.id, 'var', targetScopeId);
        }
      }
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (shouldSkipUnknownChild(key)) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          this.predeclareHoistedVars(item);
        }
      } else {
        this.predeclareHoistedVars(value);
      }
    }
  }

  private definePatternBindings(pattern: unknown, kind: BindingKind, scopeId: number) {
    if (!pattern) {
      return;
    }
    const unwrapped = unwrapExpression(pattern);
    if (!unwrapped) {
      return;
    }
    if (unwrapped.type === 'Identifier') {
      this.defineBinding(unwrapped.name, kind, unwrapped, scopeId);
      return;
    }
    if (unwrapped.type === 'AssignmentPattern') {
      this.definePatternBindings(unwrapped.left, kind, scopeId);
      return;
    }
    if (unwrapped.type === 'RestElement') {
      this.definePatternBindings(unwrapped.argument, kind, scopeId);
      return;
    }
    if (unwrapped.type === 'ArrayPattern') {
      for (const element of unwrapped.elements ?? []) {
        this.definePatternBindings(element, kind, scopeId);
      }
      return;
    }
    if (unwrapped.type === 'ObjectPattern') {
      for (const prop of unwrapped.properties ?? []) {
        if (prop.type === 'RestElement') {
          this.definePatternBindings(prop.argument, kind, scopeId);
        } else {
          this.definePatternBindings(prop.value, kind, scopeId);
        }
      }
    }
  }

  private visitPatternExpressions(pattern: unknown) {
    if (!pattern) {
      return;
    }
    const unwrapped = unwrapExpression(pattern);
    if (!unwrapped) {
      return;
    }
    if (unwrapped.type === 'AssignmentPattern') {
      this.visitPatternExpressions(unwrapped.left);
      this.visit(unwrapped.right);
      return;
    }
    if (unwrapped.type === 'RestElement') {
      this.visitPatternExpressions(unwrapped.argument);
      return;
    }
    if (unwrapped.type === 'ArrayPattern') {
      for (const element of unwrapped.elements ?? []) {
        this.visitPatternExpressions(element);
      }
      return;
    }
    if (unwrapped.type === 'ObjectPattern') {
      for (const prop of unwrapped.properties ?? []) {
        if (prop.type === 'RestElement') {
          this.visitPatternExpressions(prop.argument);
          continue;
        }
        if (prop.computed) {
          this.visit(prop.key);
        }
        this.visitPatternExpressions(prop.value);
      }
    }
  }

  private defineBinding(
    name: string,
    kind: BindingKind,
    node: unknown,
    scopeId: number,
    importedName: string | null = null
  ): BindingRecord {
    const scope = this.scopes[scopeId];
    const existing = scope.bindings.get(name);
    if (existing) {
      return existing;
    }
    const binding: BindingRecord = {
      symbolId: this.nextSymbolId++,
      name,
      importedName,
      scopeId,
      functionOwnerId: scope.functionOwnerId,
      kind,
      range: getRange(node),
      moduleLevel: scope.functionOwnerId === MODULE_FUNCTION_OWNER_ID,
    };
    scope.bindings.set(name, binding);
    return binding;
  }

  private recordReference(node: Extract<AstNode, { type: 'Identifier' }>) {
    const name = getIdentifierName(node);
    if (!name) {
      return;
    }
    const binding = this.resolveBinding(name);
    if (!binding) {
      if (name === 'arguments') {
        this.recordSpecialReference('arguments', node);
      }
      return;
    }
    const segment = this.currentSegment();
    if (!segment || segment.record.captureMode === 'explicit') {
      return;
    }
    if (binding.kind === 'import' || binding.moduleLevel) {
      return;
    }
    if (this.isOuterFunctionOwner(binding.functionOwnerId, segment.functionOwnerId)) {
      this.addCapture(segment, binding);
    }
  }

  private recordSpecialReference(
    kind: SegmentRecord['specialReferences'][number]['kind'],
    node: AstNode
  ) {
    const segment = this.currentSegment();
    if (!segment) {
      return;
    }
    segment.record.specialReferences.push({
      kind,
      range: getRange(node),
    });
  }

  private collectExplicitCaptures(node: unknown): CaptureRecord[] {
    const expr = unwrapExpression(node);
    if (!expr || expr.type !== 'ArrayExpression') {
      return [];
    }
    const captures: CaptureRecord[] = [];
    const seen = new Set<number>();
    for (const element of expr.elements ?? []) {
      const captureExpr = unwrapExpression(getArgumentExpression(element));
      if (!captureExpr || captureExpr.type !== 'Identifier') {
        continue;
      }
      const binding = this.resolveBinding(captureExpr.name);
      if (
        !binding ||
        binding.kind === 'import' ||
        binding.moduleLevel ||
        seen.has(binding.symbolId)
      ) {
        continue;
      }
      seen.add(binding.symbolId);
      captures.push(this.createCaptureRecord(binding));
    }
    return captures;
  }

  private addCapture(segment: SegmentState, binding: BindingRecord) {
    if (segment.capturedSymbols.has(binding.symbolId)) {
      return;
    }
    segment.capturedSymbols.add(binding.symbolId);
    segment.record.captures.push(this.createCaptureRecord(binding));
  }

  private createCaptureRecord(binding: BindingRecord): CaptureRecord {
    return {
      name: binding.name,
      symbolId: binding.symbolId,
      declRange: binding.range,
      source: binding.kind === 'loop' ? 'loop' : binding.kind === 'param' ? 'param' : 'local',
      readonlyConst: binding.kind === 'const' ? true : undefined,
    };
  }

  private createSegment(spec: SegmentSpec, functionOwnerId: number, fn: AstFunction): SegmentState {
    const id = `segment_${this.nextSegmentId++}`;
    const capturedSymbols = new Set(spec.explicitCaptures.map((capture) => capture.symbolId));
    const record: SegmentRecord = {
      id,
      kind: spec.kind,
      ctxName: spec.ctxName,
      range: spec.range,
      functionRange: spec.functionRange,
      paramRanges: (fn.params ?? []).map(getRange).filter((range) => range !== null),
      bodyRange: getRange(fn.body),
      bodyKind: unwrapExpression(fn.body)?.type === 'BlockStatement' ? 'block' : 'expression',
      async: !!fn.async,
      parentId: this.currentSegment()?.record.id ?? null,
      params: getParams(fn),
      captures: [...spec.explicitCaptures],
      captureMode: spec.captureMode,
      targetFunctionOwnerId: functionOwnerId,
      specialReferences: [],
    };
    this.ctx.manifest.segments.push(record);
    if (record.ctxName === 'component$' && spec.functionRange) {
      this.linkComponentSegment(record.id, spec.functionRange);
    }
    return {
      record,
      functionOwnerId,
      capturedSymbols,
    };
  }

  private createSyntheticJsxTextSegment(expressionRange: SourceRange): SegmentState {
    const functionOwnerId = this.nextFunctionOwnerId++;
    this.functionOwnerParents[functionOwnerId] = this.currentFunctionOwnerId;
    const id = `segment_${this.nextSegmentId++}`;
    const record: SegmentRecord = {
      id,
      kind: 'jsxText',
      ctxName: 'text',
      range: expressionRange,
      functionRange: null,
      paramRanges: [],
      bodyRange: expressionRange,
      bodyKind: 'expression',
      async: false,
      parentId: this.currentSegment()?.record.id ?? null,
      params: [],
      captures: [],
      captureMode: 'auto',
      targetFunctionOwnerId: functionOwnerId,
      specialReferences: [],
    };
    this.ctx.manifest.segments.push(record);
    return {
      record,
      functionOwnerId,
      capturedSymbols: new Set(),
    };
  }

  private linkComponentSegment(segmentId: string, functionRange: SourceRange) {
    const component = this.ctx.manifest.components.find(
      (candidate) =>
        candidate.qrlBoundary === QwikSymbol.Component &&
        candidate.segmentId === null &&
        rangesEqual(candidate.functionRange, functionRange)
    );
    if (component) {
      component.segmentId = segmentId;
    }
  }

  private getQrlCalleeName(callee: unknown): string | null {
    const localName = getSimpleCalleeName(callee);
    if (!localName) {
      return null;
    }
    const importedName = this.getImportedSpecifier(localName);
    const name = importedName ?? localName;
    return isQrlMarkerName(name) ? name : null;
  }

  private getImportedSpecifier(localName: string): string | null {
    const binding = this.resolveBinding(localName);
    if (!binding || binding.kind !== 'import') {
      return null;
    }
    return binding.importedName ?? localName;
  }

  private resolveBinding(name: string): BindingRecord | null {
    let scopeId: number | null = this.currentScopeId;
    while (scopeId !== null) {
      const scope: ScopeRecord = this.scopes[scopeId];
      const binding = scope.bindings.get(name);
      if (binding) {
        return binding;
      }
      scopeId = scope.parentId;
    }
    return null;
  }

  private currentSegment(): SegmentState | null {
    return this.segmentStack[this.segmentStack.length - 1] ?? null;
  }

  private withScope(kind: ScopeRecord['kind'], visit: () => void) {
    const previousScopeId = this.currentScopeId;
    this.currentScopeId = this.createScope(previousScopeId, this.currentFunctionOwnerId, kind);
    visit();
    this.currentScopeId = previousScopeId;
  }

  private createScope(
    parentId: number | null,
    functionOwnerId: number,
    kind: ScopeRecord['kind']
  ): number {
    const id = this.scopes.length;
    this.scopes.push({
      parentId,
      functionOwnerId,
      kind,
      bindings: new Map(),
    });
    return id;
  }

  private nearestFunctionScopeId(): number {
    let scopeId: number | null = this.currentScopeId;
    while (scopeId !== null) {
      const scope: ScopeRecord = this.scopes[scopeId];
      if (scope.kind === 'function' || scope.kind === 'module') {
        return scopeId;
      }
      scopeId = scope.parentId;
    }
    return this.currentScopeId;
  }

  private isOuterFunctionOwner(bindingOwnerId: number, segmentOwnerId: number): boolean {
    let ownerId = this.functionOwnerParents[segmentOwnerId] ?? null;
    while (ownerId !== null) {
      if (ownerId === bindingOwnerId) {
        return true;
      }
      ownerId = this.functionOwnerParents[ownerId] ?? null;
    }
    return false;
  }
}

function variableKindToBindingKind(kind: string | null | undefined): BindingKind {
  if (kind === 'var') {
    return 'var';
  }
  if (kind === 'let') {
    return 'let';
  }
  return 'const';
}

function getSimpleCalleeName(callee: unknown): string | null {
  const unwrapped = unwrapExpression(callee);
  if (!unwrapped) {
    return null;
  }
  if (unwrapped.type === 'Identifier') {
    return unwrapped.name;
  }
  if (unwrapped.type === 'MemberExpression' && !unwrapped.computed) {
    return getIdentifierName(unwrapped.property);
  }
  return null;
}

function getImportSpecifierName(specifier: ImportDeclarationSpecifier): string | null {
  if (specifier.type === 'ImportSpecifier') {
    return getIdentifierName(specifier.imported) ?? getIdentifierName(specifier.local);
  }
  if (specifier.type === 'ImportDefaultSpecifier') {
    return 'default';
  }
  if (specifier.type === 'ImportNamespaceSpecifier') {
    return '*';
  }
  return null;
}

function isQrlMarkerName(name: string): boolean {
  return name === '$' || name.endsWith('$') || name.endsWith('Qrl');
}

function isIterationMethodCall(node: CallExpression): boolean {
  const callee = unwrapExpression(node.callee);
  if (!callee || callee.type !== 'MemberExpression' || callee.computed) {
    return false;
  }
  const name = getIdentifierName(callee.property);
  return (
    name === 'map' ||
    name === 'filter' ||
    name === 'forEach' ||
    name === 'flatMap' ||
    name === 'some' ||
    name === 'every' ||
    name === 'find' ||
    name === 'findIndex' ||
    name === 'reduce' ||
    name === 'reduceRight'
  );
}

function getArgumentExpression(node: Argument | null | undefined): AstNode | null | undefined {
  if (node?.type === 'SpreadElement') {
    return node.argument;
  }
  return node;
}

function getJsxAttributeName(name: JSXAttributeName | null | undefined): string | null {
  const simpleName = getJsxName(name);
  if (simpleName) {
    return simpleName;
  }
  if (name?.type === 'JSXNamespacedName') {
    const namespace = getJsxName(name.namespace);
    const property = getJsxName(name.name);
    return namespace && property ? `${namespace}:${property}` : null;
  }
  return null;
}

function isJsxEventName(name: string): boolean {
  return (
    name.endsWith('$') &&
    (name.startsWith('on') ||
      name.startsWith('window:on') ||
      name.startsWith('document:on') ||
      name.startsWith('host:on') ||
      name.includes(':on'))
  );
}

function rangesEqual(left: SourceRange | null, right: SourceRange | null): boolean {
  return !!left && !!right && left[0] === right[0] && left[1] === right[1];
}

function shouldSkipUnknownChild(key: string): boolean {
  return (
    key === 'type' ||
    key === 'start' ||
    key === 'end' ||
    key === 'range' ||
    key === 'loc' ||
    key === 'decorators' ||
    key === 'typeAnnotation' ||
    key === 'typeParameters' ||
    key === 'returnType'
  );
}

function isNode(node: unknown): node is AstNode {
  return !!node && typeof node === 'object' && 'type' in node && typeof node.type === 'string';
}
