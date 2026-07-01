import {
  getSignalValueSourceName,
  getIdentifierName,
  getJsxAttributeName,
  getJsxName,
  getParams,
  getRange,
  getStaticExpressionValue,
  isEventProp,
  isStaticSourceTextExpression,
  isFunctionLike,
  isNativeTag,
  normalizeJsxText,
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
  moduleImportSymbols: Set<number>;
}

interface SegmentSpec {
  kind: SegmentRecord['kind'];
  ctxName: string;
  range: SourceRange | null;
  calleeRange?: SourceRange | null;
  calleeNameRange?: SourceRange | null;
  calleeName?: string | null;
  functionRange: SourceRange | null;
  argumentRanges?: Array<SourceRange | null>;
  captureMode: SegmentRecord['captureMode'];
  explicitCaptures: CaptureRecord[];
}

interface FunctionOptions {
  segment?: SegmentSpec;
  paramKind?: BindingKind;
  forKeyExpression?: unknown;
}

interface QrlCalleeRecord {
  ctxName: string;
  localName: string;
  nameRange: SourceRange | null;
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
          if (child.type === 'JSXExpressionContainer') {
            this.visitJsxChildExpression(child.expression);
          } else {
            this.visit(child);
          }
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

  private visitFunction(node: AstFunction, options: FunctionOptions = {}): SegmentState | null {
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

    for (const param of node.params ?? []) {
      this.visitPatternExpressions(param);
    }

    if (options.forKeyExpression !== undefined) {
      const keyRange = getRange(options.forKeyExpression);
      if (keyRange !== null) {
        const keySegment = this.createForKeySegment(node, functionOwnerId, keyRange);
        this.segmentStack.push(keySegment);
        this.visit(options.forKeyExpression);
        this.segmentStack.pop();
      }
    }

    if (segment) {
      this.segmentStack.push(segment);
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
    return segment;
  }

  private visitCallExpression(node: CallExpression) {
    const qrlCallee = this.getQrlCallee(node.callee);
    const qrlName = qrlCallee?.ctxName ?? null;
    const firstArg = getArgumentExpression(node.arguments?.[0]);
    const firstArgExpr = unwrapExpression(firstArg);
    const isQrlFunctionCall = !!qrlName && isFunctionLike(firstArgExpr);
    const isSerializerObjectCall =
      qrlName === 'createSerializer$' && firstArgExpr?.type === 'ObjectExpression';
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
              calleeRange: getRange(node.callee),
              calleeNameRange: qrlCallee?.nameRange ?? null,
              calleeName: qrlCallee?.localName ?? null,
              functionRange: getRange(expr),
              argumentRanges: (node.arguments ?? []).map(getRange),
              captureMode: hasExplicitCaptureArray ? 'explicit' : 'auto',
              explicitCaptures,
            },
          });
        } else {
          this.visitFunction(expr!, {
            paramKind: isIterationCall ? 'loop' : 'param',
          });
        }
      } else if (i === 0 && isSerializerObjectCall && expr) {
        const expressionRange = getRange(expr);
        if (expressionRange === null) {
          this.visit(expr);
          continue;
        }
        const segment = this.createSyntheticSegment(
          'function',
          qrlCallee!.ctxName,
          expressionRange
        );
        segment.record.range = getRange(node);
        segment.record.calleeRange = getRange(node.callee);
        segment.record.calleeNameRange = qrlCallee!.nameRange;
        segment.record.calleeName = qrlCallee!.localName;
        segment.record.functionRange = expressionRange;
        segment.record.argumentRanges = (node.arguments ?? []).map(getRange);
        this.segmentStack.push(segment);
        this.visit(expr);
        this.segmentStack.pop();
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
    const tag = getJsxName(node.openingElement.name);
    const isNativeElement = !!tag && isNativeTag(tag);
    const isSlotElement = tag === 'Slot';
    const isComponentElement = !!tag && !isNativeElement && !isSlotElement;
    const visitAttrs = () => {
      for (const attr of node.openingElement.attributes) {
        this.visitJsxAttribute(attr, isNativeElement);
      }
    };
    if (node.openingElement.attributes.some((attr) => attr.type === 'JSXSpreadAttribute')) {
      const range = getRange(node.openingElement);
      if (range !== null) {
        const parentSegment = this.currentSegment();
        const segment = this.createSyntheticSegment('jsxSpreadProps', 'props', range);
        this.segmentStack.push(segment);
        visitAttrs();
        this.segmentStack.pop();
        this.propagateCapturesToBranchRender(parentSegment, segment);
      } else {
        visitAttrs();
      }
    } else {
      visitAttrs();
    }
    if (isSlotElement) {
      const range = getRange(node);
      if (range !== null && node.children.some((child) => !isEmptyJsxChild(child))) {
        this.visitSlotRenderChildren(node.children, range);
      }
      return;
    }
    if (isComponentElement) {
      for (const child of node.children) {
        if (isEmptyJsxChild(child)) {
          continue;
        }
        const range = getRange(child);
        if (range === null) {
          this.visit(child);
          continue;
        }
        this.visitSlotRenderChildren([child], range);
      }
      return;
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
    if (this.visitJsxBranchExpression(expr)) {
      return;
    }
    if (this.visitJsxForExpression(expr)) {
      return;
    }
    if (getSignalValueSourceName(expr) !== null) {
      this.visit(expr);
      return;
    }
    if (isStaticSourceTextExpression(expr)) {
      this.visit(expr);
      return;
    }
    const range = getRange(expr);
    if (range === null) {
      this.visit(expr);
      return;
    }

    const parentSegment = this.currentSegment();
    const segment = this.createSyntheticJsxTextSegment(range);
    this.segmentStack.push(segment);
    this.visit(expr);
    this.segmentStack.pop();
    this.propagateCapturesToBranchRender(parentSegment, segment);
  }

  private visitSlotRenderChildren(children: readonly unknown[], range: SourceRange) {
    const parentSegment = this.currentSegment();
    const segment = this.createSyntheticSegment('slotRender', 'slot:render', range);
    this.segmentStack.push(segment);
    for (const child of children) {
      if ((child as { type?: string }).type === 'JSXExpressionContainer') {
        this.visitJsxChildExpression((child as { expression: unknown }).expression);
      } else {
        this.visit(child);
      }
    }
    this.segmentStack.pop();
    this.propagateCapturesToBranchRender(parentSegment, segment);
  }

  private visitJsxAttribute(node: JSXAttributeItem, isNativeElement: boolean) {
    if (node.type === 'JSXSpreadAttribute') {
      this.visit(node.argument);
      return;
    }
    if (node.type !== 'JSXAttribute') {
      return;
    }
    const name = getJsxAttributeName(node.name);
    if (name === 'key') {
      return;
    }
    const expr =
      node.value?.type === 'JSXExpressionContainer'
        ? unwrapExpression(node.value.expression)
        : null;
    if (name && isFunctionLike(expr) && name.endsWith('$')) {
      const parentSegment = this.currentSegment();
      const segment = this.visitFunction(expr!, {
        segment: {
          kind: isJsxEventName(name) ? 'eventHandler' : 'jsxProp',
          ctxName: name,
          range: getRange(node),
          functionRange: getRange(expr),
          captureMode: 'auto',
          explicitCaptures: [],
        },
      });
      if (segment) {
        this.propagateCapturesToBranchRender(parentSegment, segment);
      }
      return;
    }
    const currentSegment = this.currentSegment();
    const dynamicAttr =
      isNativeElement && currentSegment?.record.kind !== 'jsxSpreadProps'
        ? getDynamicDomAttribute(name, expr)
        : null;
    if (dynamicAttr) {
      const range = getRange(dynamicAttr.expr);
      if (range !== null) {
        const parentSegment = currentSegment;
        const segment = this.createSyntheticSegment('jsxProp', dynamicAttr.name, range);
        this.segmentStack.push(segment);
        this.visit(dynamicAttr.expr);
        this.segmentStack.pop();
        this.propagateCapturesToBranchRender(parentSegment, segment);
        return;
      }
    }
    this.visit(node.value);
  }

  private visitJsxBranchExpression(expr: AstNode): boolean {
    if (expr.type === 'ConditionalExpression') {
      this.visitBranchCondition(expr.test);
      this.visitBranchRenderer(expr.consequent, 'branch:then');
      if (!isEmptyBranchExpression(expr.alternate)) {
        this.visitBranchRenderer(expr.alternate, 'branch:else');
      }
      return true;
    }
    if (expr.type === 'LogicalExpression' && expr.operator === '&&') {
      this.visitBranchCondition(expr.left);
      this.visitBranchRenderer(expr.right, 'branch:then');
      return true;
    }
    return false;
  }

  private visitJsxForExpression(expr: AstNode): boolean {
    const call = parseJsxMapCall(expr);
    if (call === null) {
      return false;
    }
    const rowJsx = getCallbackReturnedJsx(call.callback);
    const keyExpression = rowJsx === null ? null : findRowKeyExpression(rowJsx);
    const rowRange = getRange(rowJsx);
    if (rowJsx === null || keyExpression === null || rowRange === null) {
      this.visit(expr);
      return true;
    }

    this.visit(call.sourceExpression);
    this.visitFunction(call.callback, {
      paramKind: 'loop',
      forKeyExpression: keyExpression,
      segment: {
        kind: 'forRender',
        ctxName: 'for:render',
        range: rowRange,
        functionRange: getRange(call.callback),
        captureMode: 'auto',
        explicitCaptures: [],
      },
    });
    return true;
  }

  private visitBranchCondition(expr: unknown) {
    const range = getRange(expr);
    if (range === null) {
      this.visit(expr);
      return;
    }
    const parentSegment = this.currentSegment();
    const segment = this.createSyntheticSegment('branchCondition', 'branch:condition', range);
    this.segmentStack.push(segment);
    this.visit(expr);
    this.segmentStack.pop();
    this.propagateCapturesToBranchRender(parentSegment, segment);
  }

  private visitBranchRenderer(expr: unknown, ctxName: string) {
    const range = getRange(expr);
    if (range === null) {
      this.visit(expr);
      return;
    }
    const parentSegment = this.currentSegment();
    const segment = this.createSyntheticSegment('branchRender', ctxName, range);
    this.segmentStack.push(segment);
    this.visitBranchRendererExpression(expr);
    this.segmentStack.pop();
    this.propagateCapturesToBranchRender(parentSegment, segment);
  }

  private visitBranchRendererExpression(expr: unknown) {
    const node = unwrapExpression(expr);
    if (!isNode(node) || isEmptyBranchExpression(node)) {
      this.visit(expr);
      return;
    }
    if (this.visitJsxBranchExpression(node)) {
      return;
    }
    if (this.visitJsxForExpression(node)) {
      return;
    }
    if (
      node.type === 'JSXElement' ||
      node.type === 'JSXFragment' ||
      isStaticBranchTextExpression(node) ||
      getSignalValueSourceName(node) !== null ||
      isStaticSourceTextExpression(node)
    ) {
      this.visit(node);
      return;
    }
    const range = getRange(node);
    if (range === null) {
      this.visit(node);
      return;
    }
    const parentSegment = this.currentSegment();
    const segment = this.createSyntheticJsxTextSegment(range);
    this.segmentStack.push(segment);
    this.visit(node);
    this.segmentStack.pop();
    this.propagateCapturesToBranchRender(parentSegment, segment);
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
    if (binding.kind === 'import') {
      return;
    }
    if (binding.moduleLevel) {
      this.addModuleImport(segment, binding);
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

  private addCaptureRecord(segment: SegmentState, capture: CaptureRecord) {
    if (segment.capturedSymbols.has(capture.symbolId)) {
      return;
    }
    segment.capturedSymbols.add(capture.symbolId);
    segment.record.captures.push(capture);
  }

  private addModuleImport(segment: SegmentState, binding: BindingRecord) {
    if (segment.moduleImportSymbols.has(binding.symbolId)) {
      return;
    }
    segment.moduleImportSymbols.add(binding.symbolId);
    segment.record.moduleImports.push({
      name: binding.name,
      symbolId: binding.symbolId,
      declRange: binding.range,
    });
  }

  private propagateCapturesToBranchRender(
    parentSegment: SegmentState | null,
    childSegment: SegmentState
  ) {
    if (
      parentSegment?.record.kind !== 'branchRender' &&
      parentSegment?.record.kind !== 'forRender' &&
      parentSegment?.record.kind !== 'slotRender'
    ) {
      return;
    }
    for (const capture of childSegment.record.captures) {
      if (parentSegment.record.kind === 'forRender' && capture.source === 'loop') {
        continue;
      }
      this.addCaptureRecord(parentSegment, capture);
    }
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
      calleeRange: spec.calleeRange ?? null,
      calleeNameRange: spec.calleeNameRange ?? null,
      calleeName: spec.calleeName ?? null,
      functionRange: spec.functionRange,
      argumentRanges: spec.argumentRanges ?? [],
      paramRanges: (fn.params ?? []).map(getRange).filter((range) => range !== null),
      bodyRange: getRange(fn.body),
      bodyKind: unwrapExpression(fn.body)?.type === 'BlockStatement' ? 'block' : 'expression',
      async: !!fn.async,
      awaitRanges: fn.async ? collectTopLevelAwaitRanges(fn) : [],
      parentId: this.currentSegment()?.record.id ?? null,
      params: getParams(fn),
      captures: [...spec.explicitCaptures],
      moduleImports: [],
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
      moduleImportSymbols: new Set(),
    };
  }

  private createSyntheticJsxTextSegment(expressionRange: SourceRange): SegmentState {
    return this.createSyntheticSegment('jsxText', 'text', expressionRange);
  }

  private createForKeySegment(
    fn: AstFunction,
    functionOwnerId: number,
    expressionRange: SourceRange
  ): SegmentState {
    const id = `segment_${this.nextSegmentId++}`;
    const record: SegmentRecord = {
      id,
      kind: 'forKey',
      ctxName: 'for:key',
      range: expressionRange,
      calleeRange: null,
      calleeNameRange: null,
      calleeName: null,
      functionRange: getRange(fn),
      argumentRanges: [],
      paramRanges: (fn.params ?? []).map(getRange).filter((range) => range !== null),
      bodyRange: expressionRange,
      bodyKind: 'expression',
      async: false,
      awaitRanges: [],
      parentId: this.currentSegment()?.record.id ?? null,
      params: getParams(fn),
      captures: [],
      moduleImports: [],
      captureMode: 'auto',
      targetFunctionOwnerId: functionOwnerId,
      specialReferences: [],
    };
    this.ctx.manifest.segments.push(record);
    return {
      record,
      functionOwnerId,
      capturedSymbols: new Set(),
      moduleImportSymbols: new Set(),
    };
  }

  private createSyntheticSegment(
    kind: SegmentRecord['kind'],
    ctxName: string,
    expressionRange: SourceRange
  ): SegmentState {
    const functionOwnerId = this.nextFunctionOwnerId++;
    this.functionOwnerParents[functionOwnerId] = this.currentFunctionOwnerId;
    const id = `segment_${this.nextSegmentId++}`;
    const record: SegmentRecord = {
      id,
      kind,
      ctxName,
      range: expressionRange,
      calleeRange: null,
      calleeNameRange: null,
      calleeName: null,
      functionRange: null,
      argumentRanges: [],
      paramRanges: [],
      bodyRange: expressionRange,
      bodyKind: 'expression',
      async: false,
      awaitRanges: [],
      parentId: this.currentSegment()?.record.id ?? null,
      params: [],
      captures: [],
      moduleImports: [],
      captureMode: 'auto',
      targetFunctionOwnerId: functionOwnerId,
      specialReferences: [],
    };
    this.ctx.manifest.segments.push(record);
    return {
      record,
      functionOwnerId,
      capturedSymbols: new Set(),
      moduleImportSymbols: new Set(),
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

  private getQrlCallee(callee: unknown): QrlCalleeRecord | null {
    const local = getSimpleCallee(callee);
    if (!local) {
      return null;
    }
    const importedName = this.getImportedSpecifier(local.name);
    const name = importedName ?? local.name;
    return isQrlMarkerName(name)
      ? {
          ctxName: name,
          localName: local.name,
          nameRange: local.nameRange,
        }
      : null;
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

function getSimpleCallee(callee: unknown): { name: string; nameRange: SourceRange | null } | null {
  const unwrapped = unwrapExpression(callee);
  if (!unwrapped) {
    return null;
  }
  if (unwrapped.type === 'Identifier') {
    return {
      name: unwrapped.name,
      nameRange: getRange(unwrapped),
    };
  }
  if (unwrapped.type === 'MemberExpression' && !unwrapped.computed) {
    const name = getIdentifierName(unwrapped.property);
    return name
      ? {
          name,
          nameRange: getRange(unwrapped.property),
        }
      : null;
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

function parseJsxMapCall(expr: AstNode): {
  sourceExpression: AstNode;
  callback: AstFunction;
} | null {
  if (expr.type !== 'CallExpression') {
    return null;
  }
  const callee = unwrapExpression(expr.callee);
  if (!callee || callee.type !== 'MemberExpression' || callee.computed) {
    return null;
  }
  if (getIdentifierName(callee.property) !== 'map') {
    return null;
  }
  if (getSignalValueSourceName(callee.object) === null) {
    return null;
  }
  const callback = unwrapExpression(getArgumentExpression(expr.arguments?.[0]));
  return callback && isFunctionLike(callback)
    ? { sourceExpression: callee.object, callback }
    : null;
}

function getCallbackReturnedJsx(callback: AstFunction): AstNode | null {
  const body = unwrapExpression(callback.body);
  if (!body) {
    return null;
  }
  if (body.type === 'JSXElement' || body.type === 'JSXFragment') {
    return body;
  }
  if (body.type !== 'BlockStatement') {
    return null;
  }
  for (const statement of body.body ?? []) {
    if (statement.type !== 'ReturnStatement') {
      continue;
    }
    const argument = unwrapExpression(statement.argument);
    return argument && (argument.type === 'JSXElement' || argument.type === 'JSXFragment')
      ? argument
      : null;
  }
  return null;
}

function findRowKeyExpression(rowJsx: AstNode): AstNode | null {
  if (rowJsx.type === 'JSXElement') {
    return findKeyExpression(rowJsx.openingElement.attributes);
  }
  if (rowJsx.type === 'JSXFragment') {
    for (const child of rowJsx.children ?? []) {
      if (child.type === 'JSXElement') {
        const key = findKeyExpression(child.openingElement.attributes);
        if (key !== null) {
          return key;
        }
      }
    }
  }
  return null;
}

function findKeyExpression(attributes: JSXAttributeItem[]): AstNode | null {
  for (const attr of attributes) {
    if (attr.type !== 'JSXAttribute' || getJsxAttributeName(attr.name) !== 'key') {
      continue;
    }
    if (attr.value?.type !== 'JSXExpressionContainer') {
      return null;
    }
    return unwrapExpression(attr.value.expression) ?? null;
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

function getDynamicDomAttribute(name: string | null, expr: AstNode | null | undefined) {
  if (!name || isEventProp(name)) {
    return null;
  }
  if (!expr || expr.type === 'JSXEmptyExpression') {
    return null;
  }
  if (getSignalValueSourceName(expr) !== null) {
    return null;
  }
  if (getStaticExpressionValue(expr).supported) {
    return null;
  }
  return { name, expr };
}

function isEmptyBranchExpression(node: unknown): boolean {
  const expr = unwrapExpression(node);
  if (!expr) {
    return true;
  }
  if (expr.type === 'Literal') {
    return expr.value === null || expr.value === false;
  }
  return false;
}

function isEmptyJsxChild(child: unknown): boolean {
  if (!isNode(child)) {
    return true;
  }
  if (child.type === 'JSXText') {
    return normalizeJsxText(child.value ?? child.raw ?? '') === '';
  }
  return child.type === 'JSXExpressionContainer' && child.expression?.type === 'JSXEmptyExpression';
}

function isStaticBranchTextExpression(node: AstNode): boolean {
  if (node.type !== 'Literal') {
    return false;
  }
  return (
    typeof node.value === 'string' ||
    typeof node.value === 'number' ||
    typeof node.value === 'bigint'
  );
}

function rangesEqual(left: SourceRange | null, right: SourceRange | null): boolean {
  return !!left && !!right && left[0] === right[0] && left[1] === right[1];
}

function collectTopLevelAwaitRanges(fn: AstFunction): SourceRange[] {
  const ranges: SourceRange[] = [];
  visitAwait(fn.body);
  return ranges;

  function visitAwait(value: unknown): void {
    if (Array.isArray(value)) {
      for (const item of value) {
        visitAwait(item);
      }
      return;
    }
    if (!isNode(value) || isFunctionLike(value)) {
      return;
    }
    if (value.type === 'AwaitExpression') {
      const awaitRange = getRange(value);
      const argRange = getRange(value.argument);
      if (awaitRange !== null && argRange !== null) {
        ranges.push([awaitRange[0], argRange[0]]);
      }
      visitAwait(value.argument);
      return;
    }
    for (const key of Object.keys(value)) {
      if (!shouldSkipUnknownChild(key)) {
        visitAwait((value as unknown as Record<string, unknown>)[key]);
      }
    }
  }
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
