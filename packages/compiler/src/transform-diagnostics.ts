import type { Diagnostic } from '@qwik.dev/optimizer';
import type { Program } from 'oxc-parser';
import {
  getJsxAttributeName,
  getJsxName,
  getRange,
  isEventProp,
  isNativeTag,
  isObviousPromiseExpression,
  normalizeJsxText,
  unwrapExpression,
  visit,
} from './ast-utils';
import type { AstNode, SourceRange } from './types';
import type {
  BindingInfo,
  ExtractedQrls,
  ModuleAnalysis,
  QrlBoundaryPlan,
  ComponentDefinition,
  Segment,
  SegmentPlan,
} from './plan-types';
import { QWIK_CORE_IMPORT, QWIK_IMPORT } from './words';

export const enum TransformDiagnosticCode {
  SuspenseUnsupported = 'suspense-unsupported',
  InnerHtmlChildren = 'inner-html-children',
  PromiseScalar = 'promise-scalar',
  LifecycleInRender = 'lifecycle-in-render',
  RawTextChildren = 'unsupported-raw-text-children',
  UnsupportedComponentShape = 'unsupported-component-shape',
  ModuleWrite = 'module-write',
  TransformFailure = 'transform-failure',
  ForKey = 'for-key',
  AsyncFor = 'async-for',
  Ref = 'ref',
  UseId = 'use-id',
  StyleHook = 'style-hook',
  CustomHook = 'custom-hook',
  ScopedStyleContent = 'scoped-style-content',
  NonSerializableCapture = 'non-serializable-capture',
  MissingDirectImplementation = 'missing-direct-implementation',
  MissingQrlImplementation = 'C05',
  NonFunctionCapture = 'C03',
  ImplicitDollarArgument = 'implicit-dollar-argument',
  UnsupportedBoundaryShape = 'unsupported-boundary-shape',
  UnsupportedRuntimeJsx = 'unsupported-runtime-jsx',
}

export function validateSerializableCaptures(
  file: string,
  source: string,
  program: Program,
  analysis: ModuleAnalysis,
  segments: readonly SegmentPlan[]
): Diagnostic[] {
  const bindingById = new Map(analysis.bindings.map((binding) => [binding.id, binding]));
  const referenceByRange = new Map(
    analysis.references.map(
      (reference) => [rangeKey(reference.range), reference.bindingId] as const
    )
  );
  const initializers = new Map<number, AstNode>();
  visit(program, (node) => {
    if (node.type !== 'VariableDeclarator') {
      return;
    }
    const id = unwrapExpression(node.id);
    if (id?.type !== 'Identifier' || node.init == null) {
      return;
    }
    const range = getRange(id);
    if (range === null) {
      return;
    }
    const binding = analysis.bindings.find(
      (candidate) =>
        candidate.name === id.name &&
        candidate.declarationRange?.[0] === range[0] &&
        candidate.declarationRange[1] === range[1]
    );
    const initializer = unwrapExpression(node.init);
    if (binding !== undefined && initializer != null) {
      initializers.set(binding.id, initializer);
    }
  });

  const segmentRanges = segments.map((segment) => segment.bodyRange);
  const qrlRanges = segments.flatMap((segment) => (segment.qrl === null ? [] : [segment.range]));
  const findings: LocatedDiagnostic[] = [];
  visit(program, (node) => {
    if (node.type !== 'CallExpression') {
      return;
    }
    const callRange = getRange(node);
    const callee = unwrapExpression(node.callee);
    if (
      callRange === null ||
      !segmentRanges.some((range) => containsRange(range, callRange)) ||
      callee?.type !== 'MemberExpression' ||
      callee.computed
    ) {
      return;
    }
    const resolved = resolveStaticMember(
      callee,
      initializers,
      bindingById,
      referenceByRange,
      qrlRanges,
      new Set()
    );
    if (resolved === null) {
      return;
    }
    findings.push(
      locatedDiagnostic(
        file,
        source,
        getRange(resolved) ?? callRange,
        TransformDiagnosticCode.NonSerializableCapture,
        'A resumable segment cannot capture a plain function through a local object or array.'
      )
    );
  });
  return findings.map((finding) => finding.diagnostic);
}

interface LocatedDiagnostic {
  range: SourceRange;
  diagnostic: Diagnostic;
}

const RENDER_SEGMENT_KINDS = new Set<Segment['kind']>(['branchRender', 'forRender', 'slotRender']);

const RAW_TEXT_ELEMENTS = new Set(['script', 'style', 'textarea', 'title']);

export function validateModule(
  source: string,
  file: string,
  components: readonly ComponentDefinition[],
  extracted: ExtractedQrls
): Diagnostic[] {
  const findings: LocatedDiagnostic[] = [];
  const analysis = extracted.analysis;
  const bindingsById = new Map(analysis.bindings.map((binding) => [binding.id, binding]));
  const referencedBindings = new Map<string, BindingInfo | null>(
    analysis.references.map<[string, BindingInfo | null]>((reference) => [
      rangeKey(reference.range),
      reference.bindingId === null ? null : (bindingsById.get(reference.bindingId) ?? null),
    ])
  );

  for (const component of components) {
    visit(component.body, (node) => {
      if (node.type !== 'JSXElement') {
        return;
      }

      const opening = node.openingElement;
      const elementRange = getRange(opening) ?? getRange(node) ?? [0, 0];
      if (isImportedSuspense(opening.name, referencedBindings)) {
        findings.push(
          locatedDiagnostic(
            file,
            source,
            elementRange,
            TransformDiagnosticCode.SuspenseUnsupported,
            'Suspense is not supported by the compiler yet.'
          )
        );
      }

      const tag = getJsxName(opening.name);
      if (tag !== null && isNativeTag(tag) && hasRenderableChildren(node.children)) {
        const innerHtml = opening.attributes.find(
          (attribute) =>
            attribute.type === 'JSXAttribute' &&
            isInnerHtmlProp(getJsxAttributeName(attribute.name))
        );
        if (innerHtml?.type === 'JSXAttribute') {
          const name = getJsxAttributeName(innerHtml.name)!;
          findings.push(
            locatedDiagnostic(
              file,
              source,
              getRange(innerHtml) ?? elementRange,
              TransformDiagnosticCode.InnerHtmlChildren,
              `JSX prop "${name}" cannot be combined with JSX children in a render plan.`
            )
          );
        }

        if (RAW_TEXT_ELEMENTS.has(tag) && hasUnsupportedRawTextChildren(node.children)) {
          findings.push(
            locatedDiagnostic(
              file,
              source,
              getRange(node) ?? elementRange,
              TransformDiagnosticCode.RawTextChildren,
              `JSX element <${tag}> supports static text or one dynamic text child, but not mixed dynamic children.`
            )
          );
        }
      }

      for (const attribute of opening.attributes) {
        if (attribute.type === 'JSXSpreadAttribute') {
          const expression = unwrapExpression(attribute.argument);
          if (expression != null && isObviousPromise(expression, referencedBindings)) {
            findings.push(
              locatedDiagnostic(
                file,
                source,
                getRange(expression) ?? getRange(attribute) ?? elementRange,
                TransformDiagnosticCode.PromiseScalar,
                'Promise values are not supported for JSX props spreads.'
              )
            );
          }
          continue;
        }
        if (attribute.value?.type !== 'JSXExpressionContainer') {
          continue;
        }
        const expression = unwrapExpression(attribute.value.expression);
        if (expression == null || !isObviousPromise(expression, referencedBindings)) {
          continue;
        }
        const name = getJsxAttributeName(attribute.name) ?? '<unknown>';
        if (
          tag !== null &&
          isNativeTag(tag) &&
          !isInnerHtmlProp(name) &&
          !isEventProp(name) &&
          name !== 'ref' &&
          name !== 'key'
        ) {
          continue;
        }
        findings.push(
          locatedDiagnostic(
            file,
            source,
            getRange(expression) ?? getRange(attribute) ?? elementRange,
            TransformDiagnosticCode.PromiseScalar,
            `Promise values are not supported for scalar JSX attribute or component prop "${name}".`
          )
        );
      }
    });
  }

  findings.push(...validateLifecycleHooks(file, source, components, extracted.segments));
  for (const segment of extracted.segments) {
    if (
      segment.kind === 'qrl' &&
      segment.payload === 'value' &&
      segment.captures.length > 0 &&
      !(segment.qrl?.kind === 'implicit' && segment.qrl.role === 'serializer')
    ) {
      findings.push(
        locatedDiagnostic(
          file,
          source,
          segment.functionRange,
          TransformDiagnosticCode.NonFunctionCapture,
          `QRL scope is not a function, but it captures local identifiers: ${segment.captures
            .map((capture) => capture.name)
            .join(', ')}.`
        )
      );
    }
  }

  const seen = new Set<string>();
  return findings
    .sort(
      (left, right) =>
        left.range[0] - right.range[0] ||
        left.range[1] - right.range[1] ||
        String(left.diagnostic.code).localeCompare(String(right.diagnostic.code))
    )
    .flatMap(({ range, diagnostic }) => {
      const key = `${diagnostic.code}:${range[0]}:${range[1]}`;
      if (seen.has(key)) {
        return [];
      }
      seen.add(key);
      return [diagnostic];
    });
}

export function validateImplicitDollarImplementations(
  file: string,
  source: string,
  analysis: ModuleAnalysis,
  segments: readonly {
    readonly qrl: QrlBoundaryPlan | null;
    readonly range: SourceRange;
    readonly calleeRange: SourceRange | null;
  }[],
  target: 'csr' | 'ssr'
): Diagnostic[] {
  const exported = new Set(analysis.exports.map((item) => item.bindingId));
  const seen = new Set<string>();
  const diagnostics: Diagnostic[] = [];
  for (const segment of segments) {
    const qrl = segment.qrl;
    if (qrl?.kind !== 'implicit' || qrl.source !== null) {
      continue;
    }
    const targetName = target === 'csr' ? qrl.baseName : `${qrl.baseName}Qrl`;
    const binding = analysis.bindings.find(
      (candidate) =>
        candidate.kind === 'module' && candidate.scopeId === 0 && candidate.name === targetName
    );
    if (binding !== undefined && exported.has(binding.id)) {
      continue;
    }
    const key = `${targetName}:${segment.range[0]}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    diagnostics.push(
      locatedDiagnostic(
        file,
        source,
        segment.calleeRange ?? segment.range,
        target === 'csr'
          ? TransformDiagnosticCode.MissingDirectImplementation
          : TransformDiagnosticCode.MissingQrlImplementation,
        `Found '${qrl.markerLocalName}' but did not find the corresponding exported '${targetName}' in the same file.`
      ).diagnostic
    );
  }
  return diagnostics;
}

function hasUnsupportedRawTextChildren(children: readonly AstNode[]): boolean {
  let renderable = 0;
  let dynamic = 0;
  for (const child of children) {
    if (child.type === 'JSXText') {
      if (normalizeJsxText(child.value) !== '') {
        renderable++;
      }
      continue;
    }
    if (child.type !== 'JSXExpressionContainer') {
      renderable++;
      dynamic++;
      continue;
    }
    const expression = unwrapExpression(child.expression);
    if (expression == null || expression.type === 'JSXEmptyExpression') {
      continue;
    }
    if (
      (expression.type === 'Identifier' && expression.name === 'undefined') ||
      (expression.type === 'Literal' &&
        (expression.value === null || expression.value === false || expression.value === true))
    ) {
      continue;
    }
    renderable++;
    if (expression.type !== 'Literal') {
      dynamic++;
    }
  }
  return dynamic > 0 && (dynamic !== 1 || renderable !== 1);
}

export function createTransformFailureDiagnostic(
  file: string,
  source: string,
  range: SourceRange,
  message: string
): Diagnostic {
  return locatedDiagnostic(file, source, range, TransformDiagnosticCode.TransformFailure, message)
    .diagnostic;
}

export function createImplicitDollarArgumentDiagnostic(
  file: string,
  source: string,
  range: SourceRange,
  message: string
): Diagnostic {
  return locatedDiagnostic(
    file,
    source,
    range,
    TransformDiagnosticCode.ImplicitDollarArgument,
    message
  ).diagnostic;
}

export function createUnsupportedBoundaryShapeDiagnostic(
  file: string,
  source: string,
  range: SourceRange
): Diagnostic {
  return locatedDiagnostic(
    file,
    source,
    range,
    TransformDiagnosticCode.UnsupportedBoundaryShape,
    'JSX in a module-level resumable boundary is not supported by the compiler yet.'
  ).diagnostic;
}

export function createUnsupportedRuntimeJsxDiagnostic(
  file: string,
  source: string,
  range: SourceRange
): Diagnostic {
  return locatedDiagnostic(
    file,
    source,
    range,
    TransformDiagnosticCode.UnsupportedRuntimeJsx,
    'JSX must belong to a supported component or resumable boundary.'
  ).diagnostic;
}

export function createForKeyDiagnostic(
  file: string,
  source: string,
  range: SourceRange,
  message: string
): Diagnostic {
  return locatedDiagnostic(file, source, range, TransformDiagnosticCode.ForKey, message).diagnostic;
}

export function createAsyncForDiagnostic(
  file: string,
  source: string,
  range: SourceRange,
  message: string
): Diagnostic {
  return locatedDiagnostic(file, source, range, TransformDiagnosticCode.AsyncFor, message)
    .diagnostic;
}

export function createRefDiagnostic(
  file: string,
  source: string,
  range: SourceRange,
  message: string
): Diagnostic {
  return locatedDiagnostic(file, source, range, TransformDiagnosticCode.Ref, message).diagnostic;
}

export function createUseIdDiagnostic(
  file: string,
  source: string,
  range: SourceRange,
  message: string
): Diagnostic {
  return locatedDiagnostic(file, source, range, TransformDiagnosticCode.UseId, message).diagnostic;
}

export function createStyleHookDiagnostic(
  file: string,
  source: string,
  range: SourceRange,
  message: string
): Diagnostic {
  return locatedDiagnostic(file, source, range, TransformDiagnosticCode.StyleHook, message)
    .diagnostic;
}

export function createCustomHookDiagnostic(
  file: string,
  source: string,
  range: SourceRange,
  message: string
): Diagnostic {
  return locatedDiagnostic(file, source, range, TransformDiagnosticCode.CustomHook, message)
    .diagnostic;
}

export function createScopedStyleContentDiagnostic(
  file: string,
  source: string,
  range: SourceRange,
  message: string
): Diagnostic {
  return locatedDiagnostic(file, source, range, TransformDiagnosticCode.ScopedStyleContent, message)
    .diagnostic;
}

export function createUnsupportedComponentShapeDiagnostic(
  file: string,
  source: string,
  range: SourceRange,
  message: string
): Diagnostic {
  return locatedDiagnostic(
    file,
    source,
    range,
    TransformDiagnosticCode.UnsupportedComponentShape,
    message
  ).diagnostic;
}

export function createModuleWriteDiagnostic(
  file: string,
  source: string,
  range: SourceRange,
  name: string
): Diagnostic {
  return locatedDiagnostic(
    file,
    source,
    range,
    TransformDiagnosticCode.ModuleWrite,
    `Extracted module cannot assign to top-level binding "${name}".`
  ).diagnostic;
}

function validateLifecycleHooks(
  file: string,
  source: string,
  components: readonly ComponentDefinition[],
  segments: readonly Segment[]
): LocatedDiagnostic[] {
  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));
  const findings: LocatedDiagnostic[] = [];
  for (const segment of segments) {
    if (
      segment.kind !== 'qrl' ||
      segment.qrl?.kind !== 'implicit' ||
      (segment.qrl.role !== 'task' && segment.qrl.role !== 'visible-task') ||
      !components.some((component) => containsRange(component.functionRange, segment.range))
    ) {
      continue;
    }
    let parentId = segment.parentId;
    let renderParent: Segment | undefined;
    while (parentId !== null) {
      const parent = segmentById.get(parentId);
      if (parent === undefined) {
        break;
      }
      if (RENDER_SEGMENT_KINDS.has(parent.kind)) {
        renderParent = parent;
        break;
      }
      parentId = parent.parentId;
    }
    if (renderParent === undefined) {
      continue;
    }
    findings.push(
      locatedDiagnostic(
        file,
        source,
        segment.range,
        TransformDiagnosticCode.LifecycleInRender,
        `Lifecycle hook "${segment.ctxName}" cannot be registered inside a ${renderParent.kind} render function.`
      )
    );
  }
  return findings;
}

function isImportedSuspense(
  name: AstNode,
  referencedBindings: ReadonlyMap<string, BindingInfo | null>
): boolean {
  if (name.type === 'JSXIdentifier') {
    return isQwikImportBinding(referencedBinding(name, referencedBindings), 'Suspense');
  }
  if (
    name.type !== 'JSXMemberExpression' ||
    name.object.type !== 'JSXIdentifier' ||
    name.property.name !== 'Suspense'
  ) {
    return false;
  }
  return isQwikImportBinding(referencedBinding(name.object, referencedBindings), '*');
}

function isQwikImportBinding(binding: BindingInfo | null, importedName: string): boolean {
  return (
    binding?.kind === 'import' &&
    binding.import?.importedName === importedName &&
    !binding.import.typeOnly &&
    (binding.import.source === QWIK_CORE_IMPORT || binding.import.source === QWIK_IMPORT)
  );
}

function referencedBinding(
  node: AstNode,
  referencedBindings: ReadonlyMap<string, BindingInfo | null>
): BindingInfo | null {
  const range = getRange(node);
  return range === null ? null : (referencedBindings.get(rangeKey(range)) ?? null);
}

function isInnerHtmlProp(name: string | null): boolean {
  return name === 'dangerouslySetInnerHTML' || name === 'innerHTML';
}

function hasRenderableChildren(children: readonly AstNode[]): boolean {
  return children.some((child) => {
    if (child.type === 'JSXText') {
      return normalizeJsxText(child.value) !== '';
    }
    if (child.type !== 'JSXExpressionContainer') {
      return true;
    }
    const expression = unwrapExpression(child.expression);
    if (expression == null || expression.type === 'JSXEmptyExpression') {
      return false;
    }
    return (
      !(expression.type === 'Identifier' && expression.name === 'undefined') &&
      !(
        expression.type === 'Literal' &&
        (expression.value === null || expression.value === false || expression.value === true)
      )
    );
  });
}

function isObviousPromise(
  expression: AstNode,
  referencedBindings: ReadonlyMap<string, BindingInfo | null>
): boolean {
  return isObviousPromiseExpression(expression, (node) =>
    isGlobalPromiseReference(node, referencedBindings)
  );
}

function isGlobalPromiseReference(
  node: unknown,
  referencedBindings: ReadonlyMap<string, BindingInfo | null>
): boolean {
  const expression = unwrapExpression(node);
  if (expression?.type !== 'Identifier' || expression.name !== 'Promise') {
    return false;
  }
  const range = getRange(expression);
  if (range === null) {
    return false;
  }
  const key = rangeKey(range);
  return referencedBindings.has(key) && referencedBindings.get(key) === null;
}

function resolveStaticMember(
  member: Extract<AstNode, { type: 'MemberExpression' }>,
  initializers: ReadonlyMap<number, AstNode>,
  bindings: ReadonlyMap<number, BindingInfo>,
  references: ReadonlyMap<string, number | null>,
  qrlRanges: readonly SourceRange[],
  seen: Set<number>
): AstNode | null {
  const path: string[] = [];
  let current: AstNode | null = member;
  while (current?.type === 'MemberExpression') {
    const key = staticMemberKey(current);
    if (key === null) {
      return null;
    }
    path.unshift(key);
    current = unwrapExpression(current.object) ?? null;
  }
  if (current?.type !== 'Identifier') {
    return null;
  }
  const bindingId = bindingIdFor(current, references);
  if (bindingId === null || !initializers.has(bindingId)) {
    return null;
  }
  return resolveStaticValue(current, path, initializers, bindings, references, qrlRanges, seen);
}

function resolveStaticValue(
  value: AstNode,
  path: readonly string[],
  initializers: ReadonlyMap<number, AstNode>,
  bindings: ReadonlyMap<number, BindingInfo>,
  references: ReadonlyMap<string, number | null>,
  qrlRanges: readonly SourceRange[],
  seen: Set<number>
): AstNode | null {
  const node = unwrapExpression(value);
  if (node == null) {
    return null;
  }
  if (node.type === 'Identifier') {
    const bindingId = bindingIdFor(node, references);
    if (bindingId === null || seen.has(bindingId)) {
      return null;
    }
    const binding = bindings.get(bindingId);
    const initializer = initializers.get(bindingId);
    if (initializer === undefined) {
      return path.length === 0 && (binding?.kind === 'import' || binding?.kind === 'module')
        ? node
        : null;
    }
    const range = getRange(initializer);
    if (range !== null && qrlRanges.some((qrlRange) => containsRange(qrlRange, range))) {
      return null;
    }
    seen.add(bindingId);
    return resolveStaticValue(
      initializer,
      path,
      initializers,
      bindings,
      references,
      qrlRanges,
      seen
    );
  }
  if (path.length === 0) {
    return node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression'
      ? node
      : null;
  }
  const [key, ...rest] = path;
  if (node.type === 'ObjectExpression') {
    const property = node.properties.find(
      (candidate) => candidate.type === 'Property' && staticPropertyKey(candidate) === key
    );
    return property?.type === 'Property'
      ? resolveStaticValue(
          property.value,
          rest,
          initializers,
          bindings,
          references,
          qrlRanges,
          seen
        )
      : null;
  }
  if (node.type === 'ArrayExpression') {
    const index = Number(key);
    const element = Number.isInteger(index) ? node.elements[index] : undefined;
    return element !== undefined && element !== null && element.type !== 'SpreadElement'
      ? resolveStaticValue(element, rest, initializers, bindings, references, qrlRanges, seen)
      : null;
  }
  return null;
}

function bindingIdFor(
  node: AstNode,
  references: ReadonlyMap<string, number | null>
): number | null {
  const range = getRange(node);
  return range === null ? null : (references.get(rangeKey(range)) ?? null);
}

function staticMemberKey(member: Extract<AstNode, { type: 'MemberExpression' }>): string | null {
  const property = unwrapExpression(member.property);
  if (!member.computed && property?.type === 'Identifier') {
    return property.name;
  }
  return property?.type === 'Literal' &&
    (typeof property.value === 'string' || typeof property.value === 'number')
    ? String(property.value)
    : null;
}

function staticPropertyKey(property: Extract<AstNode, { type: 'Property' }>): string | null {
  const key = unwrapExpression(property.key);
  if (key?.type === 'Identifier' && !property.computed) {
    return key.name;
  }
  return key?.type === 'Literal' && (typeof key.value === 'string' || typeof key.value === 'number')
    ? String(key.value)
    : null;
}

function rangeKey(range: SourceRange): `${number}:${number}` {
  return `${range[0]}:${range[1]}`;
}

function containsRange(outer: SourceRange | null, inner: SourceRange): boolean {
  return outer !== null && inner[0] >= outer[0] && inner[1] <= outer[1];
}

function locatedDiagnostic(
  file: string,
  source: string,
  range: SourceRange,
  code: TransformDiagnosticCode,
  message: string
): LocatedDiagnostic {
  return {
    range,
    diagnostic: {
      scope: 'compiler',
      category: 'error',
      code,
      file,
      message,
      highlights: [createSourceLocation(source, range)],
      suggestions: null,
    },
  };
}

function createSourceLocation(source: string, range: SourceRange) {
  const start = offsetLocation(source, range[0]);
  const end = offsetLocation(source, range[1]);
  return {
    lo: range[0],
    hi: range[1],
    startLine: start.line,
    startCol: start.column + 1,
    endLine: end.line,
    endCol: end.column,
  };
}

function offsetLocation(source: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source.charCodeAt(i) === 10) {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart };
}
