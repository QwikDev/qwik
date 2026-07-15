import type { JSXAttributeItem, Program, VariableDeclaration } from 'oxc-parser';
import {
  getIdentifierName,
  getJsxAttributeName,
  getJsxName,
  getRange,
  isNativeTag,
  isFunctionLike,
  jsxEventToHtmlAttribute,
  normalizeJsxText,
  unwrapExpression,
} from './ast-utils';
import type { AstFunction, AstNode } from './types';
import { analyzeModule, containsJsx } from './analysis';
import {
  getExpandableObjectProperties,
  getJsxAttributeExpression,
  getJsxBranchExpression,
  getJsxMapExpression,
  getStaticBranchCondition,
  getStaticJsxAttributeValue,
} from './jsx-ast-utils';
import type {
  BindingId,
  BindingInfo,
  ExtractedQrls,
  ModuleAnalysis,
  ModuleDeclaration,
  QrlBoundaryPlan,
  ReferenceInfo,
  Segment,
  SegmentPropsPartPlan,
} from './plan-types';
import { QWIK_CORE_IMPORT, QWIK_IMPORT, QwikHooks } from './words';

interface SegmentState {
  segment: Segment;
  owner: number;
  captures: Set<number>;
  moduleReferences: Set<number>;
}

interface QrlCallee {
  name: string;
  boundary: QrlBoundaryPlan;
}

export function extractQrls(
  program: Program,
  path: string,
  analysis: ModuleAnalysis = analyzeModule(program)
): ExtractedQrls {
  return new QrlExtractor(path, analysis).extract(program);
}

export function isSetupQrlSegment(segment: {
  readonly kind: string;
  readonly qrl: QrlBoundaryPlan | null;
}): boolean {
  return segment.kind === 'qrl' && segment.qrl !== null;
}

class QrlExtractor {
  private readonly bindings: Map<BindingId, BindingInfo>;
  private readonly references: Map<string, ReferenceInfo>;
  private readonly exportedBindings: Set<BindingId>;
  private readonly segments: Segment[] = [];
  private readonly moduleDeclarations: ModuleDeclaration[] = [];
  private readonly invalidBoundaries: Array<{ range: [number, number]; message: string }> = [];
  private readonly segmentStack: SegmentState[] = [];
  private owner = 0;
  private nextOwner = 1;
  private nextSegment = 0;

  constructor(
    private readonly path: string,
    private readonly analysis: ModuleAnalysis
  ) {
    this.bindings = new Map(analysis.bindings.map((binding) => [binding.id, binding]));
    this.references = new Map(
      analysis.references.map((reference) => [rangeKey(reference.range), reference])
    );
    this.exportedBindings = new Set(analysis.exports.map((item) => item.bindingId));
  }

  extract(program: Program): ExtractedQrls {
    for (const statement of program.body) {
      const declaration = this.createModuleDeclaration(statement);
      this.visit(statement);
      if (declaration !== null) {
        this.moduleDeclarations.push(declaration);
      }
    }
    return {
      analysis: this.analysis,
      segments: this.segments,
      moduleDeclarations: this.moduleDeclarations,
      invalidBoundaries: this.invalidBoundaries,
    };
  }

  private visit(node: unknown): void {
    if (!isNode(node)) {
      return;
    }
    switch (node.type) {
      case 'ImportDeclaration':
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
        for (const statement of node.body) {
          this.visit(statement);
        }
        return;
      case 'CallExpression':
        this.visitCallExpression(node);
        return;
      case 'ExpressionStatement':
        this.visit(node.expression);
        return;
      case 'ReturnStatement':
        this.visitFunctionResult(node.argument);
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
        this.recordReference(node);
        return;
      case 'JSXElement': {
        const name = getJsxName(node.openingElement.name);
        const slot = name !== null && this.isQwikSlot(node.openingElement.name);
        if (name !== null && !isNativeTag(name) && !slot) {
          this.recordReference(node.openingElement.name);
        }
        if (name !== null && isNativeTag(name)) {
          this.visitJsxAttributes(node.openingElement.attributes, node.openingElement);
        } else {
          this.visitComponentJsxAttributes(node.openingElement.attributes, node.openingElement);
        }
        const children = node.children.filter((child) => !isEmptyJsxChild(child));
        if (slot) {
          if (children.length > 0) {
            this.visitSlotRender(node, children);
          }
          return;
        }
        if (name !== null && !isNativeTag(name)) {
          for (const child of children) {
            this.visitSlotRender(child, [child]);
          }
          return;
        }
        for (const child of node.children) {
          this.visitJsxChild(child);
        }
        return;
      }
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
        this.visit(node.init);
        this.visit(node.test);
        this.visit(node.update);
        this.visit(node.body);
        return;
      case 'ForInStatement':
      case 'ForOfStatement':
        this.visit(node.right);
        this.visit(node.left);
        this.visit(node.body);
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

  private visitVariableDeclaration(node: VariableDeclaration): void {
    for (const declaration of node.declarations) {
      this.visitPatternExpressions(declaration.id);
      this.visit(declaration.init);
    }
  }

  private visitFunction(fn: AstFunction, segment?: Segment) {
    const previousOwner = this.owner;
    const owner = this.nextOwner++;
    this.owner = owner;

    const state = segment === undefined ? null : this.createSegmentState(segment, owner);
    if (state !== null) {
      this.segmentStack.push(state);
    }
    for (const param of fn.params) {
      this.visitPatternExpressions(param);
    }
    const body = unwrapExpression(fn.body);
    if (body?.type === 'BlockStatement') {
      for (const statement of body.body) {
        this.visit(statement);
      }
    } else {
      this.visitFunctionResult(body);
    }
    if (state !== null) {
      this.segmentStack.pop();
      this.propagateCaptures(state);
    }
    this.owner = previousOwner;
  }

  private visitFunctionResult(expression: AstNode | null | undefined): void {
    if (containsJsx(expression)) {
      this.visitJsxExpression(expression);
    } else {
      this.visit(expression);
    }
  }

  private visitCallExpression(node: Extract<AstNode, { type: 'CallExpression' }>) {
    const callee = this.getQrlCallee(node.callee);
    const firstArgument = getArgumentExpression(node.arguments[0]);
    if (
      callee !== null &&
      (!isNode(firstArgument) || node.arguments[0]?.type === 'SpreadElement')
    ) {
      const range = getRange(node.callee) ?? getRange(node);
      if (range !== null) {
        this.invalidBoundaries.push({
          range,
          message: `Boundary "${callee.name}" requires a statically extractable first argument.`,
        });
      }
      for (const argument of node.arguments) {
        this.visit(argument);
      }
      return;
    }
    if (callee !== null && isNode(firstArgument)) {
      const segment = isFunctionLike(firstArgument)
        ? this.createSegment(
            callee.name,
            node,
            firstArgument,
            null,
            node.callee,
            node.arguments,
            callee.boundary
          )
        : this.createValueQrlSegment(callee, node, firstArgument, node.arguments);
      if (segment !== null && isFunctionLike(firstArgument)) {
        this.visitFunction(firstArgument, segment);
      } else if (segment !== null) {
        this.visitExpressionsSegment([firstArgument], segment);
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
        this.visitFunction(expression);
      } else {
        this.visit(argument);
      }
    }
  }

  private visitJsxAttribute(node: JSXAttributeItem) {
    if (node.type === 'JSXSpreadAttribute') {
      if (getExpandableObjectProperties(node.argument) !== null) {
        return;
      }
      if (this.visitJsxExpressionSegment('props', unwrapExpression(node.argument))) {
        return;
      }
      this.visit(node.argument);
      return;
    }
    const ctxName = getJsxAttributeName(node.name);
    if (ctxName === 'key') {
      return;
    }
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
        null
      );
      if (segment !== null) {
        this.visitFunction(expression, segment);
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
    const domAttributes = attributes.filter(
      (attribute) =>
        attribute.type === 'JSXSpreadAttribute' ||
        !['key', 'q:slot'].includes(getJsxAttributeName(attribute.name) ?? '')
    );
    const hasDynamicSpread = domAttributes.some(
      (attribute) =>
        attribute.type === 'JSXSpreadAttribute' &&
        getExpandableObjectProperties(attribute.argument) === null
    );
    if (domAttributes.length > 1 && hasDynamicSpread) {
      const propsParts = createPropsParts(domAttributes);
      const segment = this.createExpressionSegment('props', boundary);
      if (segment !== null && propsParts !== null) {
        segment.propsParts = propsParts;
        this.visitPropsSegment(domAttributes, segment);
        return;
      }
    }

    for (const attr of attributes) {
      this.visitJsxAttribute(attr);
    }
  }

  private visitComponentJsxAttributes(attributes: JSXAttributeItem[], boundary: AstNode): void {
    const spreadExpressions: AstNode[] = [];
    const dynamicAttributes = new Map<JSXAttributeItem, AstNode>();
    for (const attribute of attributes) {
      if (attribute.type === 'JSXSpreadAttribute') {
        if (getExpandableObjectProperties(attribute.argument) !== null) {
          continue;
        }
        const expression = unwrapExpression(attribute.argument);
        if (isNode(expression)) {
          spreadExpressions.push(expression);
        }
        continue;
      }
      const name = getJsxAttributeName(attribute.name);
      const expression = getJsxAttributeExpression(attribute.value);
      if (
        name !== null &&
        name !== 'key' &&
        jsxEventToHtmlAttribute(name) === null &&
        expression !== null &&
        expression.type !== 'Literal' &&
        expression.type !== 'JSXEmptyExpression'
      ) {
        dynamicAttributes.set(attribute, expression);
      }
    }
    if (
      spreadExpressions.length >= 2 ||
      (spreadExpressions.length > 0 && dynamicAttributes.size > 0)
    ) {
      const segment = this.createExpressionSegment('props', boundary);
      if (segment !== null) {
        for (const attribute of attributes) {
          if (attribute.type === 'JSXAttribute' && !dynamicAttributes.has(attribute)) {
            this.visitJsxAttribute(attribute);
          }
        }
        this.visitExpressionsSegment(
          [...spreadExpressions, ...dynamicAttributes.values()],
          segment
        );
        return;
      }
    }
    for (const attribute of attributes) {
      this.visitJsxAttribute(attribute);
    }
  }

  private visitPropsSegment(attributes: readonly JSXAttributeItem[], segment: Segment): void {
    const previousOwner = this.owner;
    const owner = this.nextOwner++;
    this.owner = owner;
    const state = this.createSegmentState(segment, owner);
    this.segmentStack.push(state);
    for (const attribute of attributes) {
      this.visitUnsegmentedJsxAttribute(attribute);
    }
    this.segmentStack.pop();
    this.propagateCaptures(state);
    this.owner = previousOwner;
  }

  private visitUnsegmentedJsxAttribute(attribute: JSXAttributeItem): void {
    if (attribute.type === 'JSXSpreadAttribute') {
      this.visit(attribute.argument);
      return;
    }
    const expression = getJsxAttributeExpression(attribute.value);
    const name = getJsxAttributeName(attribute.name);
    if (name?.endsWith('$') && isFunctionLike(expression)) {
      this.visitJsxAttribute(attribute);
    } else {
      this.visit(expression);
    }
  }

  private visitJsxChild(node: unknown) {
    if (isNode(node) && node.type === 'JSXExpressionContainer') {
      this.visitJsxExpression(unwrapExpression(node.expression));
      return;
    }
    this.visit(node);
  }

  private visitJsxExpression(expression: AstNode | null | undefined) {
    if (
      !this.visitJsxBranchSegments(expression) &&
      !this.visitJsxForSegments(expression) &&
      !this.visitJsxExpressionSegment('text', expression)
    ) {
      this.visit(expression);
    }
  }

  private visitSlotRender(boundary: AstNode, children: readonly AstNode[]) {
    const segment = this.createExpressionSegment('slot:render', boundary, 'slotRender');
    if (segment !== null) {
      this.visitExpressionsSegment(children, segment, (child) => this.visitJsxChild(child));
    }
  }

  private visitJsxForSegments(expression: AstNode | null | undefined): boolean {
    const loop = getJsxMapExpression(expression);
    if (loop === null) {
      return false;
    }
    const renderSegment = this.createForSegment('forRender', 'for:render', loop.callback, loop.row);
    const keySegment = this.createForSegment('forKey', 'for:key', loop.callback, loop.key);
    if (renderSegment === null || keySegment === null) {
      return false;
    }
    // The collection thunk executes in the enclosing render scope, not in the row callback.
    this.visit(loop.source);
    const previousOwner = this.owner;
    const owner = this.nextOwner++;
    this.owner = owner;
    for (const param of loop.callback.params) {
      this.visitPatternExpressions(param);
    }
    this.visitForSegment(keySegment, loop.key);
    this.visitForSegment(renderSegment, loop.row);
    this.owner = previousOwner;
    return true;
  }

  private createForSegment(
    kind: 'forKey' | 'forRender',
    ctxName: string,
    callback: AstFunction,
    body: AstNode
  ): Segment | null {
    const functionRange = getRange(callback);
    if (functionRange === null) {
      return null;
    }
    const segment = this.createExpressionSegment(ctxName, body, kind);
    if (segment === null) {
      return null;
    }
    segment.functionRange = functionRange;
    segment.async = callback.async;
    segment.paramRanges = callback.params.map(getRange).filter((range) => range !== null);
    return segment;
  }

  private visitForSegment(segment: Segment, expression: AstNode) {
    const state = this.createSegmentState(segment, this.owner);
    this.segmentStack.push(state);
    this.visit(expression);
    this.segmentStack.pop();
    this.propagateCaptures(state);
  }

  private visitJsxBranchSegments(expression: AstNode | null | undefined): boolean {
    const branch = getJsxBranchExpression(expression);
    if (branch === null) {
      return false;
    }
    const staticCondition = getStaticBranchCondition(branch.condition);
    if (staticCondition !== null) {
      this.visitJsxExpression(staticCondition ? branch.then : branch.else);
      return true;
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
        this.visitExpressionsSegment([part], segment, (expression) =>
          this.visitJsxExpression(expression)
        );
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
      case 'ArrayExpression':
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
    kind:
      | 'expression'
      | 'branchCondition'
      | 'branchRender'
      | 'forKey'
      | 'forRender'
      | 'slotRender' = 'expression'
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
      qrl: null,
      payload: 'value',
      range,
      functionRange: range,
      calleeRange: null,
      argumentRanges: [],
      paramRanges: [],
      bodyRange: range,
      bodyKind: 'expression',
      async: false,
      awaits: [],
      captures: [],
      moduleReferences: [],
      moduleReferenceBindingIds: [],
      references: this.referencesInRange(range),
      visibleTaskStrategy: null,
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
    this.owner = owner;
    const state = this.createSegmentState(segment, owner);
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
    qrl: QrlBoundaryPlan | null = null
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
      qrl,
      payload: 'function',
      range,
      functionRange,
      calleeRange: getRange(callee),
      argumentRanges: args.map(getArgumentExpression).map(getRange),
      paramRanges: fn.params.map(getRange).filter((range) => range !== null),
      bodyRange,
      bodyKind: unwrapExpression(fn.body)?.type === 'BlockStatement' ? 'block' : 'expression',
      async: fn.async,
      awaits: [],
      captures: [],
      moduleReferences: [],
      moduleReferenceBindingIds: [],
      references: this.referencesInRange(bodyRange),
      visibleTaskStrategy: getVisibleTaskStrategy(qrl, args),
    };
    this.segments.push(segment);
    return segment;
  }

  private createValueQrlSegment(
    callee: QrlCallee,
    boundary: Extract<AstNode, { type: 'CallExpression' }>,
    value: AstNode,
    args: readonly unknown[]
  ): Segment | null {
    const range = getRange(boundary);
    const valueRange = getRange(value);
    if (range === null || valueRange === null) {
      return null;
    }
    const id = `segment_${this.nextSegment++}`;
    const segment: Segment = {
      id,
      parentId: this.segmentStack[this.segmentStack.length - 1]?.segment.id ?? null,
      name: createSegmentName(this.path, callee.name, id),
      kind: 'qrl',
      ctxName: callee.name,
      qrl: callee.boundary,
      payload: 'value',
      range,
      functionRange: valueRange,
      calleeRange: getRange(boundary.callee),
      argumentRanges: args.map(getArgumentExpression).map(getRange),
      paramRanges: [],
      bodyRange: valueRange,
      bodyKind: 'expression',
      async: false,
      awaits: [],
      captures: [],
      moduleReferences: [],
      moduleReferenceBindingIds: [],
      references: this.referencesInRange(valueRange),
      visibleTaskStrategy: getVisibleTaskStrategy(callee.boundary, args),
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

  private recordReference(node: unknown): BindingInfo | null {
    const state = this.segmentStack[this.segmentStack.length - 1];
    const binding = this.bindingForReference(node);
    if (binding === null) {
      return null;
    }
    if (state === undefined) {
      return binding;
    }
    if (binding.kind === 'import' || binding.kind === 'module') {
      if (!state.moduleReferences.has(binding.id)) {
        state.moduleReferences.add(binding.id);
        state.segment.moduleReferences.push(binding.name);
        state.segment.moduleReferenceBindingIds?.push(binding.id);
      }
      return binding;
    }
    if (!this.isLocalBinding(state, binding)) {
      this.addCapture(state, binding);
    }
    return binding;
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

  private propagateCaptures(child: SegmentState): void {
    const parent = this.segmentStack[this.segmentStack.length - 1];
    if (parent === undefined) {
      return;
    }
    for (const id of child.captures) {
      const binding = this.bindings.get(id);
      if (binding !== undefined && !this.isLocalBinding(parent, binding)) {
        this.addCapture(parent, binding);
      }
    }
  }

  private addCapture(state: SegmentState, binding: BindingInfo): void {
    if (!state.captures.has(binding.id)) {
      state.captures.add(binding.id);
      state.segment.captures.push({
        bindingId: binding.id,
        name: binding.name,
        source: binding.kind === 'param' || binding.kind === 'loop' ? binding.kind : 'local',
      });
    }
  }

  private createSegmentState(segment: Segment, owner: number): SegmentState {
    return {
      segment,
      owner,
      captures: new Set(),
      moduleReferences: new Set(),
    };
  }

  private isLocalBinding(state: SegmentState, binding: BindingInfo): boolean {
    const range = binding.declarationRange;
    return (
      range !== null &&
      range[0] >= state.segment.functionRange[0] &&
      range[1] <= state.segment.functionRange[1]
    );
  }

  private bindingForReference(node: unknown): BindingInfo | null {
    const range = getRange(node);
    if (range === null) {
      return null;
    }
    const bindingId = this.references.get(rangeKey(range))?.bindingId;
    return bindingId === null || bindingId === undefined
      ? null
      : (this.bindings.get(bindingId) ?? null);
  }

  private referencesInRange(range: [number, number]) {
    return this.analysis.references.filter(
      (reference) => reference.range[0] >= range[0] && reference.range[1] <= range[1]
    );
  }

  private getQrlCallee(callee: unknown): QrlCallee | null {
    const expression = unwrapExpression(callee);
    const localName = getIdentifierName(expression);
    if (localName === null) {
      return null;
    }
    const binding = this.bindingForReference(expression);
    if (binding === null) {
      return null;
    }
    const imported = binding.import;
    const name =
      imported !== null &&
      !imported.typeOnly &&
      imported.importedName !== 'default' &&
      imported.importedName !== '*' &&
      imported.importedName.endsWith('$')
        ? imported.importedName
        : binding.kind === 'module' &&
            localName.endsWith('$') &&
            this.exportedBindings.has(binding.id)
          ? localName
          : null;
    if (name === null) {
      return null;
    }
    const qwik = imported !== null && isQwikImport(imported.source);
    if (qwik && name === QwikHooks.ComponentDollar) {
      return null;
    }
    const boundary: QrlBoundaryPlan =
      qwik && name === QwikHooks.Dollar
        ? { kind: 'explicit', markerBindingId: binding.id }
        : qwik && name === QwikHooks.SyncDollar
          ? { kind: 'sync', markerBindingId: binding.id, source: imported.source }
          : {
              kind: 'implicit',
              markerBindingId: binding.id,
              markerLocalName: binding.name,
              baseName: name.slice(0, -1),
              source: imported?.source ?? null,
              attributes: imported?.attributes ?? [],
              role:
                qwik && name === QwikHooks.UseTaskDollar
                  ? 'task'
                  : qwik && name === QwikHooks.UseVisibleTaskDollar
                    ? 'visible-task'
                    : qwik && name === QwikHooks.UseStylesDollar
                      ? 'style'
                      : qwik && name === QwikHooks.UseStylesScopedDollar
                        ? 'scoped-style'
                        : qwik && name === QwikHooks.UseSerializerDollar
                          ? 'serializer'
                          : 'generic',
            };
    return { name, boundary };
  }

  private isQwikSlot(node: unknown): boolean {
    const imported = this.bindingForReference(node)?.import;
    return imported?.importedName === QwikHooks.Slot && isQwikImport(imported.source);
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

function createPropsParts(attributes: readonly JSXAttributeItem[]): SegmentPropsPartPlan[] | null {
  const parts: SegmentPropsPartPlan[] = [];
  for (const attribute of attributes) {
    if (attribute.type === 'JSXSpreadAttribute') {
      const range = getRange(unwrapExpression(attribute.argument));
      if (range === null) {
        return null;
      }
      parts.push({ kind: 'spread', range });
      continue;
    }
    const name = getJsxAttributeName(attribute.name);
    if (name === null) {
      return null;
    }
    const staticValue = getStaticJsxAttributeValue(attribute.value ?? null);
    if (staticValue !== undefined) {
      parts.push({ kind: 'static', prop: { name, value: staticValue } });
      continue;
    }
    const range = getRange(getJsxAttributeExpression(attribute.value));
    if (range === null) {
      return null;
    }
    parts.push({ kind: 'expression', name, range });
  }
  return parts;
}

function getVisibleTaskStrategy(
  qrl: QrlBoundaryPlan | null,
  args: readonly unknown[]
): Segment['visibleTaskStrategy'] {
  if (qrl?.kind !== 'implicit' || qrl.role !== 'visible-task') {
    return null;
  }
  const options = unwrapExpression(getArgumentExpression(args[1]));
  if (options?.type === 'ObjectExpression') {
    for (const property of options.properties) {
      if (
        property.type !== 'Property' ||
        property.computed ||
        getStaticPropertyName(property.key) !== 'strategy'
      ) {
        continue;
      }
      const value = unwrapExpression(property.value);
      if (
        value?.type === 'Literal' &&
        (value.value === 'intersection-observer' ||
          value.value === 'document-ready' ||
          value.value === 'document-idle')
      ) {
        return value.value;
      }
    }
  }
  return 'intersection-observer';
}

function getStaticPropertyName(node: unknown): string | null {
  const expression = unwrapExpression(node);
  if (expression?.type === 'Identifier') {
    return expression.name;
  }
  return expression?.type === 'Literal' && typeof expression.value === 'string'
    ? expression.value
    : null;
}

function isQwikImport(source: string | null | undefined): boolean {
  return source === QWIK_IMPORT || source === QWIK_CORE_IMPORT;
}

function rangeKey(range: readonly [number, number]): string {
  return `${range[0]}:${range[1]}`;
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

function isEmptyJsxChild(child: AstNode): boolean {
  if (child.type === 'JSXText') {
    return normalizeJsxText(child.value) === '';
  }
  return child.type === 'JSXExpressionContainer' && child.expression.type === 'JSXEmptyExpression';
}
