import type { Program } from 'oxc-parser';
import { getRange, isObviousPromiseExpression, unwrapExpression, visit } from './ast-utils';
import type {
  BindingId,
  BindingInfo,
  ComponentParameterPlan,
  ExtractedQrls,
  LifetimeId,
  ModuleAnalysis,
  ModuleBoundaryPlan,
  ModuleReferencePlan,
  RenderFunctionPlan,
  Segment,
  SegmentPlan,
} from './plan-types';
import type { SourceRange } from './types';
import { QWIK_CORE_IMPORT, QWIK_IMPORT, QwikHooks } from './words';

interface SegmentPlanOptions {
  readonly lifetimeId: LifetimeId | null;
  readonly parentId: string | null;
  readonly render: RenderFunctionPlan | null;
  readonly componentParameter: ComponentParameterPlan | null;
  readonly captureAccess: (
    kind: SegmentPlan['kind'],
    bindingId: BindingId
  ) => SegmentPlan['captures'][number]['access'];
  readonly moduleStyle?: SegmentPlan['moduleStyle'];
}

export function createExtractedSegmentPlan(
  segment: Segment,
  analysis: ModuleAnalysis,
  options: SegmentPlanOptions
): SegmentPlan {
  const parameterBindingIds = unique(
    segment.paramRanges.flatMap((range) =>
      analysis.bindings.flatMap((binding) =>
        binding.declarationRange !== null && containsRange(range, binding.declarationRange)
          ? [binding.id]
          : []
      )
    )
  );
  const moduleReferences = (segment.moduleReferenceBindingIds ?? []).flatMap((bindingId) => {
    const binding = analysis.bindings.find((candidate) => candidate.id === bindingId);
    return binding === undefined ? [] : [toModuleReference(binding)];
  });
  const references = segment.references ?? [];
  const render = options.render;
  return {
    id: segment.id,
    symbolName: segment.name,
    parentId: options.parentId,
    kind: segment.kind,
    ctxName: segment.ctxName,
    qrl: segment.qrl,
    payload: segment.payload,
    range: segment.range,
    functionRange: segment.functionRange,
    calleeRange: segment.calleeRange,
    argumentRanges: segment.argumentRanges,
    paramRanges: segment.paramRanges,
    parameterBindingIds,
    usedParameterBindingIds: usedParameterPrefix(
      parameterBindingIds,
      render?.referenceBindingIds ??
        references.flatMap((reference) =>
          reference.bindingId === null ? [] : [reference.bindingId]
        )
    ),
    bodyRange: segment.bodyRange,
    bodyKind: segment.bodyKind,
    propsParts: segment.propsParts ?? [],
    async: segment.async || segment.awaits.length > 0 || render?.async === true,
    awaits: segment.awaits,
    captures: segment.captures.map((capture) => ({
      bindingId: capture.bindingId,
      name: capture.name,
      source: capture.source,
      access: options.captureAccess(segment.kind, capture.bindingId),
    })),
    moduleReferences,
    references,
    visibleTaskStrategy: segment.visibleTaskStrategy ?? null,
    lifetimeId: options.lifetimeId,
    render,
    componentParameter: options.componentParameter,
    moduleStyle: options.moduleStyle ?? null,
  };
}

export function createModuleBoundaryPlan(
  extracted: ExtractedQrls,
  replacedRanges: readonly SourceRange[],
  program: Program
): ModuleBoundaryPlan {
  const roots = extracted.segments.filter(
    (segment) =>
      segment.parentId === null &&
      segment.qrl !== null &&
      !replacedRanges.some((range) => containsRange(range, segment.range))
  );
  const children = new Map<string, string[]>();
  for (const segment of extracted.segments) {
    if (segment.parentId !== null) {
      const ids = children.get(segment.parentId) ?? [];
      ids.push(segment.id);
      children.set(segment.parentId, ids);
    }
  }
  const included = new Set<string>();
  const queue = roots.map((segment) => segment.id);
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (!included.has(id)) {
      included.add(id);
      queue.push(...(children.get(id) ?? []));
    }
  }
  const unusedCalls = findUnusedCalls(program);
  let nextStyle = 0;
  const segments = extracted.segments
    .filter((segment) => included.has(segment.id))
    .map((segment) =>
      createExtractedSegmentPlan(segment, extracted.analysis, {
        lifetimeId: null,
        parentId: segment.parentId,
        render: null,
        componentParameter: null,
        captureAccess: () => 'direct',
        moduleStyle:
          segment.parentId === null &&
          segment.qrl?.kind === 'implicit' &&
          (segment.qrl.role === 'style' || segment.qrl.role === 'scoped-style')
            ? {
                styleId: `${hashCode(segment.name)}-${nextStyle++}`,
                resultUsed: !unusedCalls.has(rangeKey(segment.range)),
              }
            : null,
      })
    );
  const byId = new Map(segments.map((segment) => [segment.id, segment]));
  return {
    roots: roots.flatMap((root) => {
      const segment = byId.get(root.id);
      return segment === undefined
        ? []
        : [
            {
              segmentId: segment.id,
              captureBindingIds: segment.captures.map((capture) => capture.bindingId),
              componentPropBindingIds: [],
            },
          ];
    }),
    segments,
  };
}

function findUnusedCalls(program: Program): Set<string> {
  const unused = new Set<string>();
  visitParents(program, null, (node, parent) => {
    if (node.type === 'CallExpression' && parent?.type === 'ExpressionStatement') {
      unused.add(rangeKey([node.start, node.end]));
    }
  });
  return unused;
}

export function findInvalidModuleStyleBoundary(
  program: Program,
  plan: ModuleBoundaryPlan,
  analysis: ModuleAnalysis
): { readonly range: SourceRange; readonly message: string } | null {
  const byId = new Map(plan.segments.map((segment) => [segment.id, segment]));
  const parentByNode = createParentMap(program);
  const referenceByRange = new Map(
    analysis.references.map(
      (reference) => [rangeKey(reference.range), reference.bindingId] as const
    )
  );
  for (const root of plan.roots) {
    const segment = byId.get(root.segmentId);
    const boundary = segment?.qrl;
    if (
      segment === undefined ||
      boundary?.kind !== 'implicit' ||
      (boundary.role !== 'style' && boundary.role !== 'scoped-style')
    ) {
      continue;
    }
    const argumentRange = segment.argumentRanges[0];
    const argument = argumentRange === null ? null : findNodeByRange(program, argumentRange);
    if (
      segment.argumentRanges.length !== 1 ||
      argumentRange === null ||
      argument === null ||
      argument.type === 'AwaitExpression' ||
      isObviousPromiseExpression(argument, (value) => {
        const node = unwrapExpression(value);
        return (
          node?.type === 'Identifier' &&
          node.name === 'Promise' &&
          referenceByRange.get(rangeKey([node.start, node.end])) === null
        );
      })
    ) {
      return {
        range: segment.range,
        message: 'Style hooks require exactly one synchronous style argument.',
      };
    }
    if (boundary.role === 'scoped-style') {
      const call = findNodeByRange(program, segment.range);
      if (call === null || !enclosingFunctionName(call, parentByNode)?.startsWith('use')) {
        return {
          range: segment.range,
          message: 'A module scoped style hook must be owned by a use* custom hook.',
        };
      }
    }
  }
  return null;
}

export function findInvalidModuleSetupHook(
  program: Program,
  plan: ModuleBoundaryPlan,
  analysis: ModuleAnalysis
): { readonly range: SourceRange; readonly hook: string } | null {
  const bindingByReference = new Map(
    analysis.references.map(
      (reference) => [rangeKey(reference.range), reference.bindingId] as const
    )
  );
  const bindingById = new Map(analysis.bindings.map((binding) => [binding.id, binding] as const));
  let invalid: { readonly range: SourceRange; readonly hook: string } | null = null;
  visit(program, (node) => {
    if (invalid !== null || node.type !== 'CallExpression') {
      return;
    }
    const callee = unwrapExpression(node.callee);
    const calleeRange = getRange(callee);
    const callRange = getRange(node);
    if (calleeRange === null || callRange === null) {
      return;
    }
    const bindingId = bindingByReference.get(rangeKey(calleeRange));
    const binding =
      bindingId === null || bindingId === undefined ? null : bindingById.get(bindingId);
    const importedName = binding?.import?.importedName;
    if (
      (binding?.import?.source === QWIK_IMPORT || binding?.import?.source === QWIK_CORE_IMPORT) &&
      (importedName === QwikHooks.UseStore || importedName === QwikHooks.UseServerData) &&
      plan.segments.some((segment) => containsRange(segment.range, callRange))
    ) {
      invalid = { range: callRange, hook: importedName };
    }
  });
  return invalid;
}

function createParentMap(program: Program): Map<object, object> {
  const parents = new Map<object, object>();
  visitParents(program, null, (node, parent) => {
    if (parent !== null) {
      parents.set(node, parent);
    }
  });
  return parents;
}

function enclosingFunctionName(node: object, parents: ReadonlyMap<object, object>): string | null {
  let current: any = node;
  while ((current = parents.get(current)) !== undefined) {
    if (current.type === 'FunctionDeclaration') {
      return current.id?.type === 'Identifier' ? current.id.name : null;
    }
    if (current.type === 'ArrowFunctionExpression' || current.type === 'FunctionExpression') {
      if (current.id?.type === 'Identifier') {
        return current.id.name;
      }
      const parent: any = parents.get(current);
      return parent?.type === 'VariableDeclarator' && parent.id?.type === 'Identifier'
        ? parent.id.name
        : null;
    }
  }
  return null;
}

function findNodeByRange(program: Program, range: SourceRange): any | null {
  let found: any | null = null;
  visitParents(program, null, (node) => {
    if (found === null && node.start === range[0] && node.end === range[1]) {
      found = node;
    }
  });
  return found;
}

function visitParents(
  value: unknown,
  parent: { readonly type: string } | null,
  visitor: (
    node: { readonly type: string; readonly start: number; readonly end: number },
    parent: {
      readonly type: string;
    } | null
  ) => void
): void {
  if (value === null || typeof value !== 'object' || !('type' in value)) {
    return;
  }
  const node = value as {
    readonly type: string;
    readonly start: number;
    readonly end: number;
    readonly [key: string]: unknown;
  };
  visitor(node, parent);
  for (const [key, child] of Object.entries(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') {
      continue;
    }
    if (Array.isArray(child)) {
      for (const item of child) {
        visitParents(item, node, visitor);
      }
    } else {
      visitParents(child, node, visitor);
    }
  }
}

function hashCode(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function rangeKey(range: SourceRange): string {
  return `${range[0]}:${range[1]}`;
}

export function findUnsupportedModuleBoundaryJsx(
  program: Program,
  plan: ModuleBoundaryPlan
): SourceRange | null {
  const segments = new Map(plan.segments.map((segment) => [segment.id, segment]));
  const ranges = plan.roots.flatMap((root) => {
    const segment = segments.get(root.segmentId);
    return segment === undefined ? [] : [segment.functionRange];
  });
  let found: SourceRange | null = null;
  visit(program, (node) => {
    if (found !== null || (node.type !== 'JSXElement' && node.type !== 'JSXFragment')) {
      return;
    }
    const range: SourceRange = [node.start, node.end];
    if (ranges.some((boundary) => containsRange(boundary, range))) {
      found = range;
    }
  });
  return found;
}

function toModuleReference(binding: BindingInfo): ModuleReferencePlan {
  return {
    bindingId: binding.id,
    name: binding.name,
    declarationRange: binding.declarationRange,
    import: binding.import,
  };
}

function usedParameterPrefix(
  parameters: readonly BindingId[],
  references: readonly BindingId[]
): BindingId[] {
  const used = new Set(references);
  for (let index = parameters.length - 1; index >= 0; index--) {
    if (used.has(parameters[index])) {
      return parameters.slice(0, index + 1);
    }
  }
  return [];
}

function unique(values: readonly number[]): number[] {
  return [...new Set(values)];
}

function containsRange(outer: SourceRange, inner: SourceRange): boolean {
  return outer[0] <= inner[0] && outer[1] >= inner[1];
}
