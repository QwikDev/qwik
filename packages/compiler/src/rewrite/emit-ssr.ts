import { emitComponentFunction, emitComponentProps, emitStaticHtml } from './emit-html';
import { getDomEffectBatchKey, getDomEffectBatchKeys } from './emit-dom';
import { emitQrlReference, emitSetupQrl, getQrlVariableName } from './emit-qrl';
import { getSegmentImportPath, shouldResolveSsrSegment } from './emit-segment';
import type {
  HtmlPart,
  Op,
  RenderResult,
  RewriteComponent,
  RewriteModule,
  RewriteOutput,
  Segment,
} from './types';
import { QwikAttributes, QwikComments, QwikGenWord, QwikHooks, QwikWord } from './words';

interface SsrRender {
  imports: string[];
  setup: SsrSetup;
  statements: string[];
  value: string;
}

interface SsrSetup {
  statements: string[];
  hasTask: boolean;
}

export function emitSsrModule(
  outputs: readonly RewriteOutput[],
  segments: readonly Segment[],
  source: string,
  inputPath: string,
  explicitExtensions: boolean
): RewriteModule | null {
  const imports = new Set<string>();
  const segmentByName = new Map(segments.map((segment) => [segment.name, segment]));
  const parts: string[] = [];
  for (const output of outputs) {
    const render = emitSsrRender(output.result, source, segmentByName);
    if (render === null) {
      return null;
    }
    for (const name of render.imports) {
      imports.add(name);
    }
    parts.push(emitSsrComponent(output.component, render, source));
  }
  const hoists = segments.map((segment) => {
    const importPath = getSegmentImportPath(inputPath, segment, explicitExtensions);
    const qrl = getQrlVariableName(segment);
    const declaration = `const ${qrl} = /*#__PURE__*/ ${
      QwikWord.QrlWithChunk
    }(${JSON.stringify(importPath)}, () => import(${JSON.stringify(importPath)}), ${JSON.stringify(
      segment.name
    )});`;
    return shouldResolveSsrSegment(segment)
      ? `${declaration}\n${qrl}.s(${segment.name});`
      : declaration;
  });
  if (hoists.length > 0) {
    imports.add(QwikWord.QrlWithChunk);
  }
  return {
    imports: [...imports],
    localImports: segments
      .filter(shouldResolveSsrSegment)
      .map(
        (segment) =>
          `import { ${segment.name} } from ${JSON.stringify(
            getSegmentImportPath(inputPath, segment, explicitExtensions)
          )};`
      ),
    code: [...hoists, ...parts].join('\n'),
  };
}

function emitSsrComponent(component: RewriteComponent, render: SsrRender, source: string): string {
  if (!render.setup.hasTask) {
    return emitComponentFunction(
      component,
      [...render.setup.statements, ...render.statements],
      render.value,
      source
    );
  }
  return emitComponentFunction(
    component,
    render.setup.statements,
    emitInvokeRender(render.statements, render.value),
    source,
    true
  );
}

export function emitSsrSegmentRender(
  segment: Segment,
  source: string,
  imports: Set<string>
): { hoists: string[]; statements: string[]; value: string } | null {
  const result = segment.render;
  if (result === undefined) {
    return null;
  }
  let render: SsrRender | null;
  let rowRange = false;
  switch (segment.kind) {
    case 'branchRender':
      if (result === null) {
        return { hoists: [], statements: [], value: "''" };
      }
      render = emitSsrRender(
        result,
        source,
        new Map(result.segments.map((child) => [child.name, child])),
        'rangeId'
      );
      break;
    case 'forRender':
      if (result === null) {
        return null;
      }
      rowRange = !hasSingleDomRoot(result);
      render = emitSsrRender(
        result,
        source,
        new Map(result.segments.map((child) => [child.name, child])),
        null,
        rowRange ? null : QwikAttributes.Row
      );
      break;
    default:
      return null;
  }
  if (render === null) {
    return null;
  }
  for (const name of render.imports) {
    imports.add(name);
  }
  if (rowRange) {
    imports.add(QwikWord.MaybeThen);
  }
  return {
    hoists: [],
    statements: render.statements,
    value: rowRange
      ? `${QwikWord.MaybeThen}(${render.value}, (html) => '<!r=' + rowId + '>' + html + '<!/r>')`
      : render.value,
  };
}

function hasSingleDomRoot(result: RenderResult): boolean {
  if (result.roots.length !== 1) {
    return false;
  }
  const root = result.roots[0];
  return !result.html.some((part) => {
    switch (part.kind) {
      case 'dynamicJsx':
      case 'component':
      case 'branch':
      case 'for':
        return part.target === root;
      default:
        return false;
    }
  });
}

function emitSsrRender(
  result: RenderResult,
  source: string,
  segments: ReadonlyMap<string, Segment>,
  branchRangeId: string | null = null,
  rootElementAttr: string | null = null
): SsrRender | null {
  const emittedSetup = emitSsrSetup(result, source);
  if (emittedSetup === null) {
    return null;
  }
  const staticHtml = result.visibleTasks.length === 0 ? emitStaticHtml(result) : null;
  const html =
    staticHtml === null || rootElementAttr === null
      ? staticHtml
      : addStaticRootAttribute(staticHtml, rootElementAttr);
  if (html !== null) {
    const value = JSON.stringify(html);
    return {
      imports: emittedSetup.imports,
      setup: emittedSetup.setup,
      statements: emitSsrRenderPrelude(result),
      value: result.providesContext ? emitContextHtml(value) : value,
    };
  }
  return emitDynamicRender(result, source, segments, emittedSetup, branchRangeId, rootElementAttr);
}

function emitDynamicRender(
  result: RenderResult,
  source: string,
  segments: ReadonlyMap<string, Segment>,
  emittedSetup: { setup: SsrSetup; imports: string[] },
  branchRangeId: string | null,
  rootElementAttr: string | null
): SsrRender | null {
  const root = result.roots[0];
  if (root === undefined) {
    return null;
  }
  const next = createNameAllocator();
  const hasTargetEffects = result.ops.some(
    (op) => op.kind === 'textEffect' || op.kind === 'attrEffect' || op.kind === 'propsEffect'
  );
  const usesBranchRange =
    branchRangeId !== null &&
    hasTargetEffects &&
    result.ops.every(
      (op) =>
        op.kind === 'textEffect' &&
        op.target.kind === 'range' &&
        op.target.id === null &&
        result.roots.includes(op.target.marker)
    );
  const id = hasTargetEffects ? (usesBranchRange ? branchRangeId : next(QwikGenWord.Id)) : null;
  const rangeTextIndexes = new Map<number | null, number>();
  const texts = new Map<number, string>();
  const attrs = new Map<string, string>();
  const props = new Map<number, string>();
  const dynamicValues = new Map<number, string>();
  const branches = new Map<number, { id: string; value: string }>();
  const loops = new Map<number, { id: string; value: string }>();
  const events = new Map<string, string>();
  const componentImports = new Set<string>();
  const addedRoots = new Set<string>();
  const html = emitVisibleTaskCarriers(result, source, events);
  const targetIds = new Map<number, string>(id === null ? [] : [[root, id]]);
  const statements = [
    ...emitSsrRenderPrelude(result),
    ...(id === null || usesBranchRange ? [] : [`const ${id} = ctx.nextId();`]),
  ];
  const batchKeys = getDomEffectBatchKeys(result.ops, source);
  const batches = new Map<string, string>();
  for (const key of batchKeys) {
    const batch = next('batch');
    batches.set(key, batch);
    statements.push(`const ${batch} = ${QwikWord.CreateSsrDomBatchEffect}();`);
  }
  for (const part of html) {
    switch (part.kind) {
      case 'dynamicJsx': {
        const value = next('jsx');
        dynamicValues.set(part.target, value);
        statements.push(`const ${value} = ${source.slice(part.expr[0], part.expr[1])};`);
        break;
      }
      case 'component': {
        const value = next('component');
        dynamicValues.set(part.target, value);
        componentImports.add(QwikWord.CreateComponent);
        statements.push(
          `const ${value} = ${QwikWord.CreateComponent}(${emitComponentProps(part.props, source, componentImports)}, (props) => ${part.name}(props, ctx));`
        );
        break;
      }
      case 'branch': {
        const condition = segments.get(part.condition.segment);
        const thenSegment = segments.get(part.then.segment);
        const elseSegment = part.else === null ? undefined : segments.get(part.else.segment);
        if (
          condition === undefined ||
          thenSegment === undefined ||
          (part.else !== null && elseSegment === undefined)
        ) {
          return null;
        }
        const rangeId = next(QwikGenWord.Id);
        const value = next('branch');
        const captures = new Set([
          ...part.condition.captures,
          ...part.then.captures,
          ...(part.else?.captures ?? []),
        ]);
        branches.set(part.target, { id: rangeId, value });
        statements.push(
          `const ${rangeId} = ctx.nextId();`,
          ...emitSsrRoots(addedRoots, captures),
          `const ${value} = ${QwikWord.RenderSsrBranch}(ctx, ${rangeId}, ${emitQrlReference(condition)}, ${emitQrlReference(thenSegment)}, ${elseSegment === undefined ? 'undefined' : emitQrlReference(elseSegment)});`
        );
        break;
      }
      case 'for': {
        const keySegment = segments.get(part.key.segment);
        const renderSegment = segments.get(part.render.segment);
        if (keySegment === undefined || renderSegment === undefined) {
          return null;
        }
        const rangeId = next(QwikGenWord.Id);
        const value = next('forBlock');
        const sourceExpression = source.slice(part.source[0], part.source[1]);
        const roots = new Set([sourceExpression, ...part.key.captures, ...part.render.captures]);
        loops.set(part.target, { id: rangeId, value });
        statements.push(
          `const ${rangeId} = ctx.nextId();`,
          ...emitSsrRoots(addedRoots, roots),
          `const ${value} = ${QwikWord.RenderSsrForBlock}(ctx, ${rangeId}, ${sourceExpression}, ${emitQrlReference(keySegment)}, ${emitQrlReference(renderSegment)}, ${part.usesItemSignal}, ${part.usesIndexSignal});`
        );
        break;
      }
      default:
        break;
    }
  }
  for (const op of result.ops) {
    const emitted = emitSsrOp(
      op,
      rangeTextIndexes,
      texts,
      attrs,
      props,
      events,
      targetIds,
      addedRoots,
      segments,
      source,
      id,
      next,
      batches
    );
    if (emitted === null) {
      return null;
    }
    statements.push(...emitted);
  }
  const value = emitDynamicHtml(
    html,
    root,
    usesBranchRange ? null : id,
    texts,
    attrs,
    props,
    dynamicValues,
    branches,
    loops,
    events,
    targetIds,
    rootElementAttr
  );
  if (value === null) {
    return null;
  }
  const textNames = [...texts.values()];
  const attrNames = [...attrs.values()];
  const propsNames = [...props.values()];
  const dynamicValueNames = [...dynamicValues.values()];
  const branchNames = [...branches.values()].map((branch) => branch.value);
  const loopNames = [...loops.values()].map((loop) => loop.value);
  const dynamicNames = [
    ...textNames,
    ...attrNames,
    ...propsNames,
    ...dynamicValueNames,
    ...branchNames,
    ...loopNames,
  ];
  const renderedHtml = result.providesContext ? emitContextHtml(value) : value;
  const setupImports = [
    ...emittedSetup.imports,
    ...(result.visibleTasks.length > 0 ? [QwikWord.CreateVisibleTaskHandlerQrl] : []),
  ];
  if (dynamicNames.length === 0) {
    return {
      imports: setupImports,
      setup: emittedSetup.setup,
      statements,
      value: renderedHtml,
    };
  }
  const hasTextExpression = result.ops.some(
    (op) => op.kind === 'textEffect' && op.binding.kind === 'expression'
  );
  const hasTextSource = result.ops.some(
    (op) => op.kind === 'textEffect' && op.binding.kind === 'source'
  );
  const hasElementText = result.ops.some(
    (op) => op.kind === 'textEffect' && op.target.kind === 'element'
  );
  const hasRangeText = result.ops.some(
    (op) => op.kind === 'textEffect' && op.target.kind === 'range'
  );
  const hasAttrSource = result.ops.some(
    (op) => op.kind === 'attrEffect' && op.binding.kind === 'source'
  );
  const hasAttrExpression = result.ops.some(
    (op) => op.kind === 'attrEffect' && op.binding.kind === 'expression'
  );
  return {
    imports: [
      ...setupImports,
      ...componentImports,
      ...(textNames.length > 0 || attrNames.length > 0 ? [QwikWord.EscapeHTML] : []),
      ...(textNames.length > 0
        ? [
            ...(hasTextSource ? [QwikWord.RenderSsrTextNode] : []),
            ...(hasTextExpression ? [QwikWord.RenderSsrTextExpression] : []),
            ...(hasElementText ? [QwikWord.CreateSsrElementTextTarget] : []),
            ...(hasRangeText ? [QwikWord.CreateSsrRangeTextTarget] : []),
          ]
        : []),
      ...(attrNames.length > 0 || propsNames.length > 0 ? [QwikWord.CreateSsrElementTarget] : []),
      ...(attrNames.length > 0
        ? [
            ...(hasAttrSource ? [QwikWord.RenderSsrAttr] : []),
            ...(hasAttrExpression ? [QwikWord.RenderSsrAttrExpression] : []),
          ]
        : []),
      ...(propsNames.length > 0 ? [QwikWord.RenderSsrProps] : []),
      ...(batches.size > 0 ? [QwikWord.CreateSsrDomBatchEffect] : []),
      ...(branchNames.length > 0 ? [QwikWord.RenderSsrBranch] : []),
      ...(loopNames.length > 0 ? [QwikWord.RenderSsrForBlock] : []),
      QwikWord.MaybeThen,
      ...(dynamicNames.length > 1 ? [QwikWord.PromiseAll] : []),
    ],
    setup: emittedSetup.setup,
    statements,
    value:
      dynamicNames.length === 1
        ? `${QwikWord.MaybeThen}(${dynamicNames[0]}, (${dynamicNames[0]}) => ${renderedHtml})`
        : `${QwikWord.MaybeThen}(${QwikWord.PromiseAll}([${dynamicNames.join(', ')}]), ([${dynamicNames.join(', ')}]) => ${renderedHtml})`,
  };
}

function emitVisibleTaskCarriers(
  result: RenderResult,
  source: string,
  events: Map<string, string>
): HtmlPart[] {
  const root = result.roots[0];
  if (root === undefined || result.visibleTasks.length === 0) {
    return result.html;
  }
  const groups = new Map<string, Segment[]>();
  for (const segment of result.visibleTasks) {
    const eventName = getVisibleTaskEventName(segment, source);
    const group = groups.get(eventName) ?? [];
    group.push(segment);
    groups.set(eventName, group);
  }
  const carriers: HtmlPart[] = [];
  for (const [eventName, segments] of groups) {
    const key = `visible:${eventName}`;
    const handlers = segments.map(
      (segment) => `${QwikWord.CreateVisibleTaskHandlerQrl}(${emitQrlReference(segment)})`
    );
    carriers.push({
      kind: 'event',
      target: root,
      name: eventName,
      key,
    });
    events.set(
      createEventKey(root, eventName, key),
      `ctx.eventAttr(${JSON.stringify(eventName)}, ${
        handlers.length === 1 ? handlers[0] : `[${handlers.join(', ')}]`
      })`
    );
  }
  return [result.html[0], ...carriers, ...result.html.slice(1)];
}

function getVisibleTaskEventName(segment: Segment, source: string): string {
  const options = segment.argumentRanges[1];
  if (options !== null && options !== undefined) {
    const value = source.slice(options[0], options[1]);
    if (/\bstrategy\s*:\s*['"]document-ready['"]/.test(value)) {
      return 'q-d:qinit';
    }
    if (/\bstrategy\s*:\s*['"]document-idle['"]/.test(value)) {
      return 'q-d:qidle';
    }
  }
  return 'q-e:qvisible';
}

function emitSsrSetup(
  result: RenderResult,
  source: string
): { setup: SsrSetup; imports: string[] } | null {
  const statements: string[] = [];
  const imports = new Set<string>();
  let hasTask = false;
  for (const range of result.setup) {
    const emitted = emitSetupQrl(source, range, result.segments, 'ssr');
    if (emitted === null) {
      return null;
    }
    for (const name of emitted.imports) {
      imports.add(name);
    }
    const part = emitted.part;
    if (part.kind === 'code') {
      if (part.code !== '') {
        statements.push(part.code);
      }
      continue;
    }
    hasTask = true;
    const task = `task_${part.segment.id}`;
    statements.push(
      `const ${task} = invoke(invokeCtx, () => useTaskQrl(${emitQrlReference(part.segment)}${
        part.suffix
      });`,
      `ctx.addRoot(${task});`,
      `await runTaskSubscriber(${task});`
    );
  }
  if (hasTask) {
    statements.unshift('const invokeCtx = getActiveInvokeContextOrNull();');
  }
  return { setup: { statements, hasTask }, imports: [...imports] };
}

function emitSsrRenderPrelude(result: RenderResult): string[] {
  return result.providesContext ? ['const contextScopeId = ctx.contextScopeId();'] : [];
}

function emitInvokeRender(statements: readonly string[], value: string): string {
  const body = [...statements, `return ${value};`]
    .map((statement) =>
      statement
        .split('\n')
        .map((line) => `  ${line}`)
        .join('\n')
    )
    .join('\n');
  return `invoke(invokeCtx, () => {\n${body}\n})`;
}

function emitContextHtml(html: string): string {
  return `'<!c=' + contextScopeId + '>' + ${html} + '<!/c>'`;
}

function emitSsrOp(
  op: Op,
  rangeTextIndexes: Map<number | null, number>,
  texts: Map<number, string>,
  attrs: Map<string, string>,
  props: Map<number, string>,
  events: Map<string, string>,
  targetIds: Map<number, string>,
  addedRoots: Set<string>,
  segments: ReadonlyMap<string, Segment>,
  source: string,
  id: string | null,
  next: (prefix: string) => string,
  batches: ReadonlyMap<string, string>
): string[] | null {
  const batch = getSsrBatchArg(op, source, batches);
  switch (op.kind) {
    case 'textEffect':
      if (id === null) {
        return null;
      }
      return emitSsrTextOp(
        op,
        rangeTextIndexes,
        texts,
        targetIds,
        addedRoots,
        segments,
        source,
        id,
        next,
        batch
      );
    case 'attrEffect':
      return emitSsrAttrOp(op, attrs, targetIds, addedRoots, segments, source, next, batch);
    case 'propsEffect':
      return emitSsrPropsOp(op, props, targetIds, addedRoots, segments, next, batch);
    case 'event': {
      let reference: string;
      switch (op.binding.kind) {
        case 'segment': {
          const segment = segments.get(op.binding.segment);
          if (segment === undefined) {
            return null;
          }
          const qrl = getQrlVariableName(segment);
          reference =
            op.binding.captures.length > 0 ? `${qrl}.w([${op.binding.captures.join(', ')}])` : qrl;
          break;
        }
        case 'value':
          reference = source.slice(op.binding.range[0], op.binding.range[1]);
          break;
      }
      events.set(
        createEventKey(op.target, op.name, op.key),
        `ctx.eventAttr(${JSON.stringify(op.name)}, ${reference})`
      );
      return [];
    }
  }
}

function emitSsrPropsOp(
  op: Extract<Op, { kind: 'propsEffect' }>,
  props: Map<number, string>,
  targetIds: Map<number, string>,
  addedRoots: Set<string>,
  segments: ReadonlyMap<string, Segment>,
  next: (prefix: string) => string,
  batch: string
): string[] | null {
  const segment = segments.get(op.binding.segment);
  if (segment === undefined) {
    return null;
  }
  let targetId = targetIds.get(op.target);
  const statements: string[] = [];
  if (targetId === undefined) {
    targetId = next(QwikGenWord.Id);
    targetIds.set(op.target, targetId);
    statements.push(`const ${targetId} = ctx.nextId();`);
  }
  const value = next('props');
  props.set(op.target, value);
  return [
    ...statements,
    ...emitSsrRoots(addedRoots, op.binding.captures),
    `const ${value} = ${QwikWord.RenderSsrProps}(${QwikWord.CreateSsrElementTarget}(${targetId}), [${op.binding.captures.join(
      ', '
    )}], ${getQrlVariableName(segment)}, ctx.eventAttr${batch});`,
  ];
}

function emitSsrAttrOp(
  op: Extract<Op, { kind: 'attrEffect' }>,
  attrs: Map<string, string>,
  targetIds: Map<number, string>,
  addedRoots: Set<string>,
  segments: ReadonlyMap<string, Segment>,
  source: string,
  next: (prefix: string) => string,
  batch: string
): string[] | null {
  let targetId = targetIds.get(op.target);
  const statements: string[] = [];
  if (targetId === undefined) {
    targetId = next(QwikGenWord.Id);
    targetIds.set(op.target, targetId);
    statements.push(`const ${targetId} = ctx.nextId();`);
  }
  const attr = next('attr');
  attrs.set(createAttrKey(op.target, op.name, op.expr), attr);
  const target = `${QwikWord.CreateSsrElementTarget}(${targetId})`;
  switch (op.binding.kind) {
    case 'source': {
      const sourceExpr = source.slice(op.binding.range[0], op.binding.range[1]);
      return [
        ...statements,
        ...emitSsrRoots(addedRoots, [sourceExpr]),
        `const ${attr} = ${QwikWord.RenderSsrAttr}(${target}, ${JSON.stringify(
          op.name
        )}, ${sourceExpr}${batch});`,
      ];
    }
    case 'expression': {
      const segment = segments.get(op.binding.segment);
      if (segment === undefined) {
        return null;
      }
      return [
        ...statements,
        ...emitSsrRoots(addedRoots, op.binding.captures),
        `const ${attr} = ${QwikWord.RenderSsrAttrExpression}(${target}, ${JSON.stringify(
          op.name
        )}, [${op.binding.captures.join(', ')}], ${getQrlVariableName(segment)}${batch});`,
      ];
    }
  }
}

function emitSsrTextOp(
  op: Extract<Op, { kind: 'textEffect' }>,
  rangeTextIndexes: Map<number | null, number>,
  texts: Map<number, string>,
  targetIds: Map<number, string>,
  addedRoots: Set<string>,
  segments: ReadonlyMap<string, Segment>,
  source: string,
  id: string,
  next: (prefix: string) => string,
  batch: string
): string[] | null {
  const statements: string[] = [];
  let target: string;
  if (op.target.kind === 'element') {
    let targetId = targetIds.get(op.target.id);
    if (targetId === undefined) {
      targetId = next(QwikGenWord.Id);
      targetIds.set(op.target.id, targetId);
      statements.push(`const ${targetId} = ctx.nextId();`);
    }
    target = `${QwikWord.CreateSsrElementTextTarget}(${targetId})`;
  } else {
    const markerIndex = rangeTextIndexes.get(op.target.id) ?? 0;
    rangeTextIndexes.set(op.target.id, markerIndex + 1);
    if (op.target.id === null) {
      target = `${QwikWord.CreateSsrRangeTextTarget}(${id}, ${markerIndex})`;
    } else {
      let targetId = targetIds.get(op.target.id);
      if (targetId === undefined) {
        targetId = next(QwikGenWord.Id);
        targetIds.set(op.target.id, targetId);
        statements.push(`const ${targetId} = ctx.nextId();`);
      }
      target = `${QwikWord.CreateSsrRangeTextTarget}(${targetId}, ${markerIndex})`;
    }
  }
  const text = next(QwikGenWord.Text);
  texts.set(op.target.marker, text);
  switch (op.binding.kind) {
    case 'source': {
      const expr = source.slice(op.binding.range[0], op.binding.range[1]);
      return [
        ...statements,
        ...emitSsrRoots(addedRoots, [expr]),
        `const ${text} = ${QwikWord.RenderSsrTextNode}(${target}, ${expr}${batch});`,
      ];
    }
    case 'expression': {
      const segment = segments.get(op.binding.segment);
      if (segment === undefined) {
        return null;
      }
      return [
        ...statements,
        ...emitSsrRoots(addedRoots, op.binding.captures),
        `const ${text} = ${QwikWord.RenderSsrTextExpression}(${target}, [${op.binding.captures.join(
          ', '
        )}], ${getQrlVariableName(segment)}${batch});`,
      ];
    }
    case 'unsupported':
      return null;
  }
}

function getSsrBatchArg(op: Op, source: string, batches: ReadonlyMap<string, string>): string {
  const key = getDomEffectBatchKey(op, source);
  const batch = key === null ? undefined : batches.get(key);
  return batch === undefined ? '' : `, ${batch}`;
}

function emitSsrRoots(addedRoots: Set<string>, roots: Iterable<string>): string[] {
  const statements: string[] = [];
  for (const root of roots) {
    if (!addedRoots.has(root)) {
      addedRoots.add(root);
      statements.push(`ctx.addRoot(${root});`);
    }
  }
  return statements;
}

function emitDynamicHtml(
  parts: readonly HtmlPart[],
  root: number,
  id: string | null,
  texts: ReadonlyMap<number, string>,
  attrs: ReadonlyMap<string, string>,
  props: ReadonlyMap<number, string>,
  dynamicValues: ReadonlyMap<number, string>,
  branches: ReadonlyMap<number, { id: string; value: string }>,
  loops: ReadonlyMap<number, { id: string; value: string }>,
  events: ReadonlyMap<string, string>,
  targetIds: ReadonlyMap<number, string>,
  rootElementAttr: string | null
): string | null {
  const frames: Array<{ target: number; props: string; expressions: string[] }> = [
    { target: -1, props: '', expressions: [] },
  ];
  const pushExpression = (...expressions: string[]) => {
    frames[frames.length - 1].expressions.push(...expressions);
  };
  let didInjectRoot = false;
  const injectedTargets = new Set<number>();
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    switch (part.kind) {
      case 'html': {
        const expression =
          (id === null && rootElementAttr === null) || didInjectRoot
            ? JSON.stringify(part.value)
            : emitRootHtml(part.value, id, rootElementAttr);
        if (expression === null) {
          return null;
        }
        if (id !== null || rootElementAttr !== null) {
          didInjectRoot = true;
          injectedTargets.add(root);
        }
        pushExpression(expression);
        break;
      }
      case 'attr':
      case 'props': {
        if (!injectedTargets.has(part.target)) {
          const targetId = targetIds.get(part.target);
          if (targetId === undefined) {
            return null;
          }
          injectedTargets.add(part.target);
          pushExpression(JSON.stringify(` ${QwikAttributes.Id}="`), targetId, JSON.stringify('"'));
        }
        switch (part.kind) {
          case 'attr': {
            const attr = attrs.get(createAttrKey(part.target, part.name, part.expr));
            if (attr === undefined) {
              return null;
            }
            pushExpression(
              JSON.stringify(` ${part.name}="`),
              `${QwikWord.EscapeHTML}(${attr})`,
              JSON.stringify('"')
            );
            break;
          }
          case 'props': {
            const value = props.get(part.target);
            if (value === undefined) {
              return null;
            }
            pushExpression(`${value}.attrs`);
            break;
          }
        }
        break;
      }
      case 'event': {
        const event = events.get(createEventKey(part.target, part.name, part.key));
        if (event === undefined) {
          return null;
        }
        pushExpression(event);
        break;
      }
      case 'dynamicJsx':
      case 'component': {
        const value = dynamicValues.get(part.target);
        if (value === undefined) {
          return null;
        }
        pushExpression(value);
        break;
      }
      case 'branch': {
        const branch = branches.get(part.target);
        if (branch === undefined) {
          return null;
        }
        pushExpression(
          JSON.stringify('<!b='),
          branch.id,
          JSON.stringify('>'),
          branch.value,
          JSON.stringify('<!/b>')
        );
        break;
      }
      case 'for': {
        const loop = loops.get(part.target);
        if (loop === undefined) {
          return null;
        }
        pushExpression(
          JSON.stringify('<!f='),
          loop.id,
          JSON.stringify('>'),
          loop.value,
          JSON.stringify('<!/f>')
        );
        break;
      }
      case 'target': {
        if (injectedTargets.has(part.id)) {
          break;
        }
        const targetId = targetIds.get(part.id);
        if (targetId === undefined) {
          return null;
        }
        injectedTargets.add(part.id);
        pushExpression(JSON.stringify(` ${QwikAttributes.Id}="`), targetId, JSON.stringify('"'));
        break;
      }
      case 'elementText': {
        const text = texts.get(part.id);
        if (text === undefined) {
          return null;
        }
        pushExpression(`${QwikWord.EscapeHTML}(${text})`);
        break;
      }
      case 'rangeText': {
        const text = texts.get(part.id);
        if (text === undefined) {
          return null;
        }
        pushExpression(JSON.stringify(QwikComments.TextMarker));
        pushExpression(`${QwikWord.EscapeHTML}(${text})`);
        if (isStaticTextPart(parts[i + 1])) {
          pushExpression(JSON.stringify(QwikComments.TextMarkerEnd));
        }
        break;
      }
      case 'childrenStart': {
        const value = props.get(part.target);
        if (value === undefined) {
          return null;
        }
        frames.push({ target: part.target, props: value, expressions: [] });
        break;
      }
      case 'childrenEnd': {
        const frame = frames.pop();
        if (frame === undefined || frame.target !== part.target || frames.length === 0) {
          return null;
        }
        const fallback = frame.expressions.length === 0 ? "''" : frame.expressions.join(' + ');
        pushExpression(`(${frame.props}.innerHTML ?? (${fallback}))`);
        break;
      }
      default:
        return null;
    }
  }
  return frames.length === 1 ? frames[0].expressions.join(' + ') : null;
}

function isStaticTextPart(part: HtmlPart | undefined): boolean {
  return part?.kind === 'html' && part.isStaticText && part.value.length > 0;
}

function createAttrKey(target: number, name: string, expr: readonly number[]) {
  return `${target}:${name}:${expr[0]}:${expr[1]}`;
}

function createEventKey(target: number, name: string, key: string) {
  return `${target}:${name}:${key}`;
}

function addStaticRootAttribute(html: string, attribute: string): string {
  const insert = html.indexOf('>');
  return insert === -1
    ? `${html} ${attribute}`
    : `${html.slice(0, insert)} ${attribute}${html.slice(insert)}`;
}

function emitRootHtml(html: string, id: string | null, attribute: string | null): string | null {
  const staticAttribute = attribute === null ? '' : ` ${attribute}`;
  const insert = html.lastIndexOf('>');
  if (insert === -1) {
    return id === null
      ? JSON.stringify(`${html}${staticAttribute}`)
      : `${JSON.stringify(`${html} ${QwikAttributes.Id}="`)} + ${id} + ${JSON.stringify(`"${staticAttribute}`)}`;
  }
  const suffix = `${staticAttribute}${html.slice(insert)}`;
  return id === null
    ? JSON.stringify(`${html.slice(0, insert)}${suffix}`)
    : `${JSON.stringify(`${html.slice(0, insert)} ${QwikAttributes.Id}="`)} + ${id} + ${JSON.stringify(`"${suffix}`)}`;
}

function createNameAllocator() {
  const indexes = new Map<string, number>();
  return (prefix: string) => {
    const index = indexes.get(prefix) ?? 0;
    indexes.set(prefix, index + 1);
    return `${prefix}${index}`;
  };
}
