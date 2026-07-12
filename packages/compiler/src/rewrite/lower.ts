import type {
  FunctionBody,
  JSXAttributeName,
  JSXAttributeValue,
  JSXChild,
  JSXElement,
  JSXOpeningElement,
  Node,
} from 'oxc-parser';
import {
  getIdentifierName,
  getJsxAttributeName,
  getJsxName,
  getRange,
  isCallExpression,
  isNativeTag,
  jsxEventToHtmlAttribute,
  normalizeJsxText,
  unwrapExpression,
} from '../ast-utils';
import { escapeAttr, escapeText } from '../stages/emit-utils';
import type { SourceRange } from '../types';
import { visit } from './ast-utils';
import { isRewriteSourceFactoryName } from './discover';
import { isSetupQrlSegment } from './extract';
import type {
  AttributeHtmlPart,
  EventBinding,
  EventHtmlPart,
  ExtractedQrls,
  HtmlHtmlPart,
  HtmlPart,
  Op,
  Ref,
  RefStep,
  RenderResult,
  RewriteComponent,
  RewriteContextProviderImports,
  RewriteSourceFactoryImports,
  Segment,
  TextEffectBinding,
  ValueEffectBinding,
} from './types';
import { QwikHooks } from './words';

interface TemplateRoot {
  id: number;
  html: HtmlPart[];
  refs: RefInRoot[];
}

type PendingTextEffect = Omit<Extract<Op, { kind: 'textEffect' }>, 'target'>;

type DynamicAttrValue =
  | { kind: 'source'; expr: SourceRange; range: SourceRange }
  | { kind: 'expression'; expr: SourceRange; segment: Segment };

type DynamicEvent =
  | { kind: 'segment'; name: string; segment: Segment }
  | { kind: 'value'; name: string; range: SourceRange };

interface RenderedContent {
  kind: 'content';
  html: HtmlPart[];
  refs: RefInRoot[];
}

interface RenderedText {
  kind: 'text';
  html: HtmlPart[];
  refs: RefInRoot[];
  marker: number;
  effect: PendingTextEffect;
}

type RenderedJsx = RenderedContent | RenderedText;

interface RefInRoot {
  id: number;
  path: RefStep[];
}

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

interface LowerState {
  nextRefId: () => number;
  setup: SourceRange[];
  ops: Op[];
  sourceFactoryImports: RewriteSourceFactoryImports;
  contextProviderImports: RewriteContextProviderImports;
  shadowedSourceFactoryImports: Set<string>;
  shadowedContextProviderImports: Set<string>;
  trackedSources: Set<string>;
  extractedQrls: ExtractedQrls;
  segments: Map<string, Segment>;
  providesContext: boolean;
}

export function lowerRewriteComponent(
  component: RewriteComponent,
  extractedQrls: ExtractedQrls
): RenderResult | null {
  return lowerFunctionBody(component, extractedQrls);
}

function lowerFunctionBody(
  component: RewriteComponent,
  extractedQrls: ExtractedQrls
): RenderResult | null {
  const state: LowerState = {
    nextRefId: createRefIdAllocator(),
    setup: [],
    ops: [],
    sourceFactoryImports: component.sourceFactoryImports,
    contextProviderImports: component.contextProviderImports,
    shadowedSourceFactoryImports: createParamSourceFactoryShadows(
      component.params,
      component.sourceFactoryImports
    ),
    shadowedContextProviderImports: createParamContextProviderShadows(
      component.params,
      component.contextProviderImports
    ),
    trackedSources: new Set(),
    extractedQrls,
    segments: new Map(),
    providesContext: false,
  };
  const roots: TemplateRoot[] = [];
  if (component.body.type === 'BlockStatement') {
    visit(component.body, (node, { parent, key }) =>
      visitComponentBodyNode(node, parent, key, state, roots)
    );
  } else {
    addReturnRoots(component.body, state, roots);
  }

  return createRenderResult(roots, state);
}

function visitComponentBodyNode(
  node: Node,
  parent: Node | null,
  key: string | null,
  state: LowerState,
  roots: TemplateRoot[]
) {
  switch (node.type) {
    case 'ReturnStatement': {
      addReturnRoots(node.argument, state, roots);
      return false;
    }
    case 'BlockStatement':
    case 'IfStatement':
      return;
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
      return false;
    default:
      if (isSetupStatement(node, parent, key)) {
        addSetupStatement(node, state);
        return false;
      }
  }
}

function addReturnRoots(node: unknown, state: LowerState, roots: TemplateRoot[]) {
  const expr = unwrapExpression(node);
  if (expr?.type === 'JSXElement') {
    const root = renderTemplateRoot(expr, state);
    if (root !== null) {
      roots.push(root);
    }
    return;
  }

  if (expr?.type === 'JSXFragment') {
    for (const child of expr.children) {
      addReturnRoots(child, state, roots);
    }
  }
}

function isSetupStatement(
  node: Node,
  parent: Node | null,
  key: string | null
): node is FunctionBody['body'][number] {
  return (
    parent !== null &&
    ((parent.type === 'BlockStatement' && key === 'body') ||
      (parent.type === 'IfStatement' && (key === 'consequent' || key === 'alternate'))) &&
    node.type !== 'ReturnStatement' &&
    node.type !== 'BlockStatement' &&
    node.type !== 'IfStatement'
  );
}

function renderTemplateRoot(node: JSXElement, state: LowerState): TemplateRoot | null {
  const id = state.nextRefId();
  const rendered = renderJsxElementHtml(node, state, id);
  if (rendered === null) {
    return null;
  }
  return {
    id,
    html: rendered.html,
    refs: rendered.refs,
  };
}

function renderJsxElementHtml(
  node: JSXElement,
  state: LowerState,
  existingId?: number
): RenderedJsx | null {
  const opening = node.openingElement;
  const tag = getJsxName(opening.name);
  if (!tag || !isNativeTag(tag)) {
    return null;
  }
  const isVoid = VOID_ELEMENTS.has(tag);
  const children = isVoid ? [] : renderJsxChildren(node.children, state);
  const elementText = children.length === 1 && children[0].kind === 'text' ? children[0] : null;
  const elementId =
    existingId ??
    (elementText !== null || needsElementRef(opening, state) ? state.nextRefId() : undefined);
  for (const child of children) {
    if (child.kind === 'text') {
      // A single dynamic child targets the parent element, so SSR does not need a <!t> marker.
      const target =
        child === elementText
          ? { kind: 'element' as const, id: elementId!, marker: child.marker }
          : { kind: 'range' as const, marker: child.marker };
      state.ops.push({ ...child.effect, target });
    }
  }
  const html: HtmlPart[] = [createHtmlRecord(`<${tag}`)];
  if (elementText !== null && elementId !== undefined && elementId !== existingId) {
    html.push({ kind: 'target', id: elementId });
  }
  html.push(...renderJsxAttributes(opening, state, elementId));
  html.push(createHtmlRecord('>'));

  const refs: RefInRoot[] =
    elementId === undefined || elementId === existingId ? [] : [{ id: elementId, path: [] }];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const path = createChildRefPath({ childIndex: i, siblingCount: children.length });
    html.push(...child.html);
    refs.push(...child.refs.map((ref) => ({ id: ref.id, path: [...path, ...ref.path] })));
  }
  if (!isVoid) {
    html.push(createHtmlRecord(`</${tag}>`));
  }
  return { kind: 'content', html, refs };
}

function renderJsxAttributes(
  opening: JSXOpeningElement,
  state: LowerState,
  target: number | undefined
): HtmlPart[] {
  const attrs: HtmlPart[] = [];
  for (const attr of opening.attributes) {
    switch (attr.type) {
      case 'JSXAttribute': {
        const name = getAttrName(attr.name);
        const value = attr.value;
        if (name === null || value === undefined) {
          break;
        }

        pushAttr(state, attrs, target, name, value);
        break;
      }

      case 'JSXSpreadAttribute':
        // TODO: valid future case
        break;
    }
  }
  return attrs;
}

function getAttrName(attr: JSXAttributeName): string | null {
  const name = getJsxAttributeName(attr);
  if (name === 'key') {
    return null;
  }
  if (name === 'className') {
    return 'class';
  }
  return name;
}

function pushAttr(
  state: LowerState,
  attrs: HtmlPart[],
  target: number | undefined,
  name: string,
  value: JSXAttributeValue | null
): void {
  const event = getEventAttr(name, value, state);
  if (event !== null) {
    if (target !== undefined) {
      let key: string;
      let binding: EventBinding;
      switch (event.kind) {
        case 'segment': {
          const captures = event.segment.captures.map((capture) => capture.name);
          key = event.segment.name;
          binding = {
            kind: 'segment',
            segment: event.segment.name,
            captures,
          };
          retainSegment(state, event.segment);
          break;
        }
        case 'value':
          key = `value:${event.range[0]}:${event.range[1]}`;
          binding = { kind: 'value', range: event.range };
          break;
      }
      attrs.push(createEventRecord(target, event.name, key));
      state.ops.push({
        kind: 'event',
        target,
        name: event.name,
        key,
        binding,
      });
    }
    return;
  }

  const serialized = getStaticAttrValue(name, value);
  if (serialized !== undefined) {
    attrs.push(
      createHtmlRecord(serialized === '' ? ` ${name}` : ` ${name}="${escapeAttr(serialized)}"`)
    );
    return;
  }

  if (target === undefined) {
    return;
  }

  const dynamic = getDynamicAttrValue(value, state);
  if (dynamic !== null) {
    attrs.push(createAttributeRecord(target, name, dynamic.expr));
    let binding: ValueEffectBinding;
    switch (dynamic.kind) {
      case 'source':
        binding = { kind: 'source', range: dynamic.range };
        break;
      case 'expression':
        binding = createExpressionEffectBinding(state, dynamic.segment);
        break;
    }
    state.ops.push({
      kind: 'attrEffect',
      target,
      name,
      expr: dynamic.expr,
      binding,
    });
  }
}

function getStaticAttrValue(name: string, value: JSXAttributeValue | null): string | undefined {
  if (value === null) {
    return '';
  }

  switch (value.type) {
    case 'Literal':
      return String(value.value);
    case 'JSXExpressionContainer':
      if (value.expression.type === 'Literal') {
        if (value.expression.value === null) {
          return undefined;
        }
        if (typeof value.expression.value === 'boolean') {
          if (
            name.startsWith('aria-') ||
            name === 'spellcheck' ||
            name === 'draggable' ||
            name === 'contenteditable'
          ) {
            return String(value.expression.value);
          }
          return value.expression.value ? '' : undefined;
        }
        return String(value.expression.value);
      }
      return undefined;

    default:
      return undefined;
  }
}

function needsElementRef(opening: JSXOpeningElement, state: LowerState): boolean {
  for (const attr of opening.attributes) {
    if (attr.type !== 'JSXAttribute') {
      continue;
    }
    const name = getAttrName(attr.name);
    if (name === null) {
      continue;
    }
    if (getEventAttr(name, attr.value ?? null, state) !== null) {
      return true;
    }
    if (
      attr.value !== undefined &&
      getStaticAttrValue(name, attr.value) === undefined &&
      getDynamicAttrValue(attr.value, state) !== null
    ) {
      return true;
    }
  }
  return false;
}

function getEventAttr(
  name: string,
  value: JSXAttributeValue | null,
  state: LowerState
): DynamicEvent | null {
  const eventName = jsxEventToHtmlAttribute(name);
  if (eventName === null || value?.type !== 'JSXExpressionContainer') {
    return null;
  }
  const expression = unwrapExpression(value.expression);
  if (expression === null || expression === undefined) {
    return null;
  }

  switch (expression.type) {
    case 'ArrowFunctionExpression':
    case 'FunctionExpression': {
      const range = getRange(expression);
      if (range === null) {
        return null;
      }
      const segment = state.extractedQrls.segments.find(
        (segment) => segment.functionRange[0] === range[0] && segment.functionRange[1] === range[1]
      );
      return segment?.kind === 'event' ? { kind: 'segment', name: eventName, segment } : null;
    }
    case 'Identifier':
    case 'MemberExpression': {
      const range = getRange(expression);
      return range === null ? null : { kind: 'value', name: eventName, range };
    }
    default:
      return null;
  }
}

function getDynamicAttrValue(
  value: JSXAttributeValue | null,
  state: LowerState
): DynamicAttrValue | null {
  if (value === null || value.type !== 'JSXExpressionContainer') {
    return null;
  }
  const expression = unwrapExpression(value.expression);
  const expr = getRange(expression);
  if (expression === null || expression === undefined || expr === null) {
    return null;
  }

  switch (expression.type) {
    case 'MemberExpression': {
      const range = getDirectTrackedSourceRange(expression, state.trackedSources);
      if (range !== null) {
        return { kind: 'source', expr, range };
      }
      return createDynamicAttrExpression(expr, state);
    }
    case 'Identifier':
    case 'BinaryExpression':
    case 'UnaryExpression':
    case 'TemplateLiteral':
      return createDynamicAttrExpression(expr, state);
    default:
      return null;
  }
}

function createDynamicAttrExpression(
  expr: SourceRange,
  state: LowerState
): DynamicAttrValue | null {
  const segment = getExpressionSegment(expr, state);
  return segment === undefined ? null : { kind: 'expression', expr, segment };
}

function renderJsxChildren(children: JSXChild[], state: LowerState): RenderedJsx[] {
  const rendered: RenderedJsx[] = [];
  for (const child of children) {
    switch (child.type) {
      case 'JSXText': {
        const text = normalizeJsxText(child.value);
        if (text !== '') {
          rendered.push({
            kind: 'content',
            html: [createHtmlRecord(escapeText(text))],
            refs: [],
          });
        }
        break;
      }
      case 'JSXExpressionContainer': {
        const expression = renderJsxExpression(child.expression, state);
        if (expression !== null) {
          rendered.push(expression);
        }
        break;
      }
      case 'JSXElement': {
        const childElement = renderJsxElementHtml(child, state);
        if (childElement !== null) {
          rendered.push(childElement);
        }
        break;
      }
      case 'JSXFragment':
        rendered.push(...renderJsxChildren(child.children, state));
        break;
      default:
        break;
    }
  }
  return rendered;
}

function renderJsxExpression(expression: unknown, state: LowerState): RenderedJsx | null {
  const expr = unwrapExpression(expression);
  if (expr === null || expr === undefined) {
    return null;
  }

  const range = getRange(expr);
  if (range === null) {
    return null;
  }

  switch (expr.type) {
    case 'JSXEmptyExpression':
      return null;
    case 'MemberExpression': {
      const source = getDirectTrackedSourceRange(expr, state.trackedSources);
      if (source !== null) {
        return createTextEffect(range, { kind: 'source', range: source }, state);
      }
      return createExpressionTextEffect(range, state);
    }
    case 'Identifier':
    case 'BinaryExpression':
    case 'UnaryExpression':
    case 'TemplateLiteral':
      return createExpressionTextEffect(range, state);
    default:
      return createTextEffect(range, { kind: 'unsupported' }, state);
  }
}

function createExpressionTextEffect(range: SourceRange, state: LowerState): RenderedJsx {
  const segment = getExpressionSegment(range, state)!;
  return createTextEffect(range, createExpressionEffectBinding(state, segment), state);
}

function getExpressionSegment(range: SourceRange, state: LowerState): Segment | undefined {
  return state.extractedQrls.segments.find(
    (segment) =>
      segment.kind === 'expression' &&
      segment.bodyRange[0] === range[0] &&
      segment.bodyRange[1] === range[1]
  );
}

function createExpressionEffectBinding(state: LowerState, segment: Segment): ValueEffectBinding {
  retainSegment(state, segment);
  return {
    kind: 'expression',
    segment: segment.name,
    captures: segment.captures.map((capture) => capture.name),
  };
}

function createTextEffect(
  expr: SourceRange,
  binding: TextEffectBinding,
  state: LowerState
): RenderedJsx {
  const marker = state.nextRefId();
  const effect: PendingTextEffect = {
    kind: 'textEffect',
    expr,
    binding,
  };
  return {
    kind: 'text',
    html: [{ kind: 'marker', id: marker }],
    refs: [{ id: marker, path: [] }],
    marker,
    effect,
  };
}

function createRenderResult(roots: TemplateRoot[], state: LowerState): RenderResult | null {
  if (roots.length === 0) {
    return null;
  }
  return {
    setup: state.setup,
    providesContext: state.providesContext,
    html: roots.flatMap((root) => root.html),
    roots: roots.map((root) => root.id),
    refs: createRefs(roots),
    ops: state.ops,
    segments: [...state.segments.values()],
    visibleTasks: [...state.segments.values()].filter(
      (segment) => segment.parentId === null && segment.ctxName === QwikHooks.UseVisibleTask
    ),
  };
}

function createRefs(roots: TemplateRoot[]): Ref[] {
  return roots.flatMap((root, childIndex) => {
    const path = createChildRefPath({ childIndex, siblingCount: roots.length });
    return [
      { id: root.id, path },
      ...root.refs.map((ref) => ({ id: ref.id, path: [...path, ...ref.path] })),
    ];
  });
}

function addSetupStatement(statement: FunctionBody['body'][number], state: LowerState) {
  if (statement.type === 'VariableDeclaration') {
    recordVariableDeclaration(statement, state);
    recordContextProviderVariableShadows(statement, state);
  } else if (statement.type === 'FunctionDeclaration') {
    recordSourceFactoryShadow(getIdentifierName(statement.id), state);
    recordContextProviderShadow(getIdentifierName(statement.id), state);
  } else if (
    statement.type === 'ExpressionStatement' &&
    isCallExpression(statement.expression) &&
    isContextProviderCallee(statement.expression.callee, state)
  ) {
    state.providesContext = true;
  }
  const range = getRange(statement);
  if (range !== null) {
    state.setup.push(range);
    for (const segment of state.extractedQrls.segments) {
      if (
        isSetupQrlSegment(segment) &&
        segment.parentId === null &&
        segment.range[0] >= range[0] &&
        segment.range[1] <= range[1]
      ) {
        retainSegment(state, segment);
      }
    }
  }
}

function retainSegment(state: LowerState, segment: Segment): void {
  if (state.segments.has(segment.id)) {
    return;
  }
  state.segments.set(segment.id, segment);
  for (const child of state.extractedQrls.segments) {
    if (child.parentId === segment.id && isSetupQrlSegment(child)) {
      retainSegment(state, child);
    }
  }
}

function createRefIdAllocator() {
  let id = 0;
  return () => id++;
}

function createParamSourceFactoryShadows(
  params: RewriteComponent['params'],
  imports: RewriteSourceFactoryImports
) {
  const shadowed = new Set<string>();
  for (const param of params) {
    const name = param.name;
    if (name !== null && isSourceFactoryImport(name, imports)) {
      shadowed.add(name);
    }
  }
  return shadowed;
}

function createParamContextProviderShadows(
  params: RewriteComponent['params'],
  imports: RewriteContextProviderImports
) {
  const shadowed = new Set<string>();
  for (const param of params) {
    const name = param.name;
    if (name !== null && isContextProviderImport(name, imports)) {
      shadowed.add(name);
    }
  }
  return shadowed;
}

function recordVariableDeclaration(
  statement: Extract<FunctionBody['body'][number], { type: 'VariableDeclaration' }>,
  state: LowerState
) {
  for (const declarator of statement.declarations) {
    recordSourceFactoryShadow(getIdentifierName(declarator.id), state);
  }
  for (const declarator of statement.declarations) {
    const name = getIdentifierName(declarator.id);
    if (name !== null && isSourceFactoryCall(declarator.init, state)) {
      state.trackedSources.add(name);
    }
  }
}

function recordContextProviderVariableShadows(
  statement: Extract<FunctionBody['body'][number], { type: 'VariableDeclaration' }>,
  state: LowerState
) {
  for (const declarator of statement.declarations) {
    recordContextProviderShadow(getIdentifierName(declarator.id), state);
  }
}

function recordSourceFactoryShadow(name: string | null, state: LowerState) {
  if (name !== null && isSourceFactoryImport(name, state.sourceFactoryImports)) {
    state.shadowedSourceFactoryImports.add(name);
  }
}

function recordContextProviderShadow(name: string | null, state: LowerState) {
  if (name !== null && isContextProviderImport(name, state.contextProviderImports)) {
    state.shadowedContextProviderImports.add(name);
  }
}

function isSourceFactoryCall(node: unknown, state: LowerState): boolean {
  const expr = unwrapExpression(node);
  if (!isCallExpression(expr)) {
    return false;
  }
  const callee = unwrapExpression(expr.callee);
  const localName = getIdentifierName(callee);
  if (localName !== null) {
    return (
      state.sourceFactoryImports.named.has(localName) &&
      !state.shadowedSourceFactoryImports.has(localName)
    );
  }
  if (!callee || callee.type !== 'MemberExpression' || callee.computed) {
    return false;
  }
  const objectName = getIdentifierName(callee.object);
  const propertyName = getIdentifierName(callee.property);
  return (
    objectName !== null &&
    propertyName !== null &&
    state.sourceFactoryImports.namespaces.has(objectName) &&
    !state.shadowedSourceFactoryImports.has(objectName) &&
    isRewriteSourceFactoryName(propertyName)
  );
}

function isSourceFactoryImport(name: string, imports: RewriteSourceFactoryImports): boolean {
  return imports.named.has(name) || imports.namespaces.has(name);
}

function isContextProviderCallee(callee: unknown, state: LowerState): boolean {
  const expr = unwrapExpression(callee);
  const localName = getIdentifierName(expr);
  if (localName !== null) {
    return (
      state.contextProviderImports.named.has(localName) &&
      !state.shadowedContextProviderImports.has(localName)
    );
  }
  if (!expr || expr.type !== 'MemberExpression' || expr.computed) {
    return false;
  }
  const objectName = getIdentifierName(expr.object);
  const propertyName = getIdentifierName(expr.property);
  return (
    objectName !== null &&
    propertyName === QwikHooks.UseContextProvider &&
    state.contextProviderImports.namespaces.has(objectName) &&
    !state.shadowedContextProviderImports.has(objectName)
  );
}

function isContextProviderImport(name: string, imports: RewriteContextProviderImports): boolean {
  return imports.named.has(name) || imports.namespaces.has(name);
}

function getDirectTrackedSourceRange(
  node: unknown,
  trackedSources: ReadonlySet<string>
): SourceRange | null {
  const expr = unwrapExpression(node);
  if (
    typeof expr !== 'object' ||
    expr === null ||
    expr.type !== 'MemberExpression' ||
    expr.computed
  ) {
    // Not direct member access: `{count.value + 1}`, `{count['value']}`, `{fn()}`.
    return null;
  }
  const property = expr.property;
  if (
    typeof property !== 'object' ||
    property === null ||
    property.type !== 'Identifier' ||
    property.name !== 'value'
  ) {
    // Member access, but not signal value: `{count.peek}`, `{count.foo}`.
    return null;
  }
  const sourceName = getIdentifierName(expr.object);
  if (sourceName === null || !trackedSources.has(sourceName)) {
    // `.value` on a non-Qwik source: `{plain.value}`.
    return null;
  }
  // Direct tracked source created from Qwik import: `{count.value}` -> range for `count`.
  return getRange(expr.object);
}

export function createChildRefPath({
  childIndex,
  siblingCount,
}: {
  childIndex: number;
  siblingCount: number;
}): RefStep[] {
  const nextSiblingCount = childIndex;
  const previousSiblingCount = siblingCount - childIndex - 1;
  return nextSiblingCount <= previousSiblingCount
    ? createSiblingRefPath('firstChild', 'nextSibling', nextSiblingCount)
    : createSiblingRefPath('lastChild', 'previousSibling', previousSiblingCount);
}

function createSiblingRefPath(firstStep: RefStep, siblingStep: RefStep, count: number): RefStep[] {
  const path: RefStep[] = [firstStep];
  for (let i = 0; i < count; i++) {
    path.push(siblingStep);
  }
  return path;
}

function createHtmlRecord(value: string): HtmlHtmlPart {
  return { kind: 'html', value };
}

function createAttributeRecord(target: number, name: string, expr: SourceRange): AttributeHtmlPart {
  return { kind: 'attr', target, name, expr };
}

function createEventRecord(target: number, name: string, key: string): EventHtmlPart {
  return { kind: 'event', target, name, key };
}
