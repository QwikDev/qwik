import { emitComponentFunction, emitComponentProps, emitStaticHtml } from './emit-html';
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

export function emitSsrBranchRender(
  segment: Segment,
  source: string,
  imports: Set<string>
): { hoists: string[]; statements: string[]; value: string } | null {
  const result = segment.render;
  if (result === undefined) {
    return null;
  }
  if (result === null) {
    return { hoists: [], statements: [], value: "''" };
  }
  const render = emitSsrRender(
    result,
    source,
    new Map(result.segments.map((segment) => [segment.name, segment])),
    'rangeId'
  );
  if (render === null) {
    return null;
  }
  for (const name of render.imports) {
    imports.add(name);
  }
  return {
    hoists: [],
    statements: render.statements,
    value: render.value,
  };
}

function emitSsrRender(
  result: RenderResult,
  source: string,
  segments: ReadonlyMap<string, Segment>,
  branchRangeId: string | null = null
): SsrRender | null {
  const emittedSetup = emitSsrSetup(result, source);
  if (emittedSetup === null) {
    return null;
  }
  const html = result.visibleTasks.length === 0 ? emitStaticHtml(result) : null;
  if (html !== null) {
    const value = JSON.stringify(html);
    return {
      imports: emittedSetup.imports,
      setup: emittedSetup.setup,
      statements: emitSsrRenderPrelude(result),
      value: result.providesContext ? emitContextHtml(value) : value,
    };
  }
  return emitDynamicRender(result, source, segments, emittedSetup, branchRangeId);
}

function emitDynamicRender(
  result: RenderResult,
  source: string,
  segments: ReadonlyMap<string, Segment>,
  emittedSetup: { setup: SsrSetup; imports: string[] },
  branchRangeId: string | null
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
        result.roots.includes(op.target.marker)
    );
  const id = hasTargetEffects ? (usesBranchRange ? branchRangeId : next(QwikGenWord.Id)) : null;
  const elementTextMarkers = new Set(
    result.ops.flatMap((op) =>
      op.kind === 'textEffect' && op.target.kind === 'element' ? [op.target.marker] : []
    )
  );
  const markerIndexes = createMarkerIndexes(result.html, elementTextMarkers);
  const texts = new Map<number, string>();
  const attrs = new Map<string, string>();
  const props = new Map<number, string>();
  const dynamicValues = new Map<number, string>();
  const branches = new Map<number, { id: string; value: string }>();
  const events = new Map<string, string>();
  const componentImports = new Set<string>();
  const html = emitVisibleTaskCarriers(result, source, events);
  const targetIds = new Map<number, string>(id === null ? [] : [[root, id]]);
  const statements = [
    ...emitSsrRenderPrelude(result),
    ...(id === null || usesBranchRange ? [] : [`const ${id} = ctx.nextId();`]),
  ];
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
          ...[...captures].map((capture) => `ctx.addRoot(${capture});`),
          `const ${value} = ${QwikWord.RenderSsrBranch}(ctx, ${rangeId}, ${emitQrlReference(condition)}, ${emitQrlReference(thenSegment)}, ${elseSegment === undefined ? 'undefined' : emitQrlReference(elseSegment)});`
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
      markerIndexes,
      texts,
      attrs,
      props,
      events,
      targetIds,
      segments,
      source,
      id,
      next
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
    events,
    targetIds,
    elementTextMarkers
  );
  if (value === null) {
    return null;
  }
  const textNames = [...texts.values()];
  const attrNames = [...attrs.values()];
  const propsNames = [...props.values()];
  const dynamicValueNames = [...dynamicValues.values()];
  const branchNames = [...branches.values()].map((branch) => branch.value);
  const dynamicNames = [
    ...textNames,
    ...attrNames,
    ...propsNames,
    ...dynamicValueNames,
    ...branchNames,
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
      ...(branchNames.length > 0 ? [QwikWord.RenderSsrBranch] : []),
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
  markerIndexes: Map<number, number>,
  texts: Map<number, string>,
  attrs: Map<string, string>,
  props: Map<number, string>,
  events: Map<string, string>,
  targetIds: Map<number, string>,
  segments: ReadonlyMap<string, Segment>,
  source: string,
  id: string | null,
  next: (prefix: string) => string
): string[] | null {
  switch (op.kind) {
    case 'textEffect':
      if (id === null) {
        return null;
      }
      return emitSsrTextOp(op, markerIndexes, texts, targetIds, segments, source, id, next);
    case 'attrEffect':
      return emitSsrAttrOp(op, attrs, targetIds, segments, source, next);
    case 'propsEffect':
      return emitSsrPropsOp(op, props, targetIds, segments, next);
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
  segments: ReadonlyMap<string, Segment>,
  next: (prefix: string) => string
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
    ...op.binding.captures.map((capture) => `ctx.addRoot(${capture});`),
    `const ${value} = ${QwikWord.RenderSsrProps}(${QwikWord.CreateSsrElementTarget}(${targetId}), [${op.binding.captures.join(
      ', '
    )}], ${getQrlVariableName(segment)}, ctx.eventAttr);`,
  ];
}

function emitSsrAttrOp(
  op: Extract<Op, { kind: 'attrEffect' }>,
  attrs: Map<string, string>,
  targetIds: Map<number, string>,
  segments: ReadonlyMap<string, Segment>,
  source: string,
  next: (prefix: string) => string
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
        `ctx.addRoot(${sourceExpr});`,
        `const ${attr} = ${QwikWord.RenderSsrAttr}(${target}, ${JSON.stringify(
          op.name
        )}, ${sourceExpr});`,
      ];
    }
    case 'expression': {
      const segment = segments.get(op.binding.segment);
      if (segment === undefined) {
        return null;
      }
      return [
        ...statements,
        ...op.binding.captures.map((capture) => `ctx.addRoot(${capture});`),
        `const ${attr} = ${QwikWord.RenderSsrAttrExpression}(${target}, ${JSON.stringify(
          op.name
        )}, [${op.binding.captures.join(', ')}], ${getQrlVariableName(segment)});`,
      ];
    }
  }
}

function emitSsrTextOp(
  op: Extract<Op, { kind: 'textEffect' }>,
  markerIndexes: Map<number, number>,
  texts: Map<number, string>,
  targetIds: Map<number, string>,
  segments: ReadonlyMap<string, Segment>,
  source: string,
  id: string,
  next: (prefix: string) => string
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
    const markerIndex = markerIndexes.get(op.target.marker);
    if (markerIndex === undefined) {
      return null;
    }
    target = `${QwikWord.CreateSsrRangeTextTarget}(${id}, ${markerIndex})`;
  }
  const text = next(QwikGenWord.Text);
  texts.set(op.target.marker, text);
  switch (op.binding.kind) {
    case 'source': {
      const expr = source.slice(op.binding.range[0], op.binding.range[1]);
      return [
        ...statements,
        `ctx.addRoot(${expr});`,
        `const ${text} = ${QwikWord.RenderSsrTextNode}(${target}, ${expr});`,
      ];
    }
    case 'expression': {
      const segment = segments.get(op.binding.segment);
      if (segment === undefined) {
        return null;
      }
      return [
        ...statements,
        ...op.binding.captures.map((capture) => `ctx.addRoot(${capture});`),
        `const ${text} = ${QwikWord.RenderSsrTextExpression}(${target}, [${op.binding.captures.join(
          ', '
        )}], ${getQrlVariableName(segment)});`,
      ];
    }
    case 'unsupported':
      return null;
  }
}

function createMarkerIndexes(parts: readonly HtmlPart[], elementTextMarkers: ReadonlySet<number>) {
  const indexes = new Map<number, number>();
  let index = 0;
  for (const part of parts) {
    if (part.kind === 'marker' && !elementTextMarkers.has(part.id)) {
      indexes.set(part.id, index++);
    }
  }
  return indexes;
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
  events: ReadonlyMap<string, string>,
  targetIds: ReadonlyMap<number, string>,
  elementTextMarkers: ReadonlySet<number>
): string | null {
  const expressions: string[] = [];
  let didInjectRootId = false;
  const injectedTargets = new Set<number>();
  for (const part of parts) {
    switch (part.kind) {
      case 'html': {
        const expression =
          id === null || didInjectRootId
            ? JSON.stringify(part.value)
            : emitRootHtml(part.value, id);
        if (expression === null) {
          return null;
        }
        if (id !== null) {
          didInjectRootId = true;
          injectedTargets.add(root);
        }
        expressions.push(expression);
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
          expressions.push(
            JSON.stringify(` ${QwikAttributes.Id}="`),
            targetId,
            JSON.stringify('"')
          );
        }
        switch (part.kind) {
          case 'attr': {
            const attr = attrs.get(createAttrKey(part.target, part.name, part.expr));
            if (attr === undefined) {
              return null;
            }
            expressions.push(
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
            expressions.push(`${value}.attrs`);
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
        expressions.push(event);
        break;
      }
      case 'dynamicJsx':
      case 'component': {
        const value = dynamicValues.get(part.target);
        if (value === undefined) {
          return null;
        }
        expressions.push(value);
        break;
      }
      case 'branch': {
        const branch = branches.get(part.target);
        if (branch === undefined) {
          return null;
        }
        expressions.push(
          JSON.stringify('<!b='),
          branch.id,
          JSON.stringify('>'),
          branch.value,
          JSON.stringify('<!/b>')
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
        expressions.push(JSON.stringify(` ${QwikAttributes.Id}="`), targetId, JSON.stringify('"'));
        break;
      }
      case 'marker': {
        const text = texts.get(part.id);
        if (text === undefined) {
          return null;
        }
        if (!elementTextMarkers.has(part.id)) {
          expressions.push(JSON.stringify(QwikComments.TextMarker));
        }
        expressions.push(`${QwikWord.EscapeHTML}(${text})`);
        break;
      }
      default:
        return null;
    }
  }
  return expressions.join(' + ');
}

function createAttrKey(target: number, name: string, expr: readonly number[]) {
  return `${target}:${name}:${expr[0]}:${expr[1]}`;
}

function createEventKey(target: number, name: string, key: string) {
  return `${target}:${name}:${key}`;
}

function emitRootHtml(html: string, id: string): string | null {
  const insert = html.lastIndexOf('>');
  if (insert === -1) {
    return `${JSON.stringify(`${html} ${QwikAttributes.Id}="`)} + ${id} + ${JSON.stringify('"')}`;
  }
  return `${JSON.stringify(`${html.slice(0, insert)} ${QwikAttributes.Id}="`)} + ${id} + ${JSON.stringify(
    `"${html.slice(insert)}`
  )}`;
}

function createNameAllocator() {
  const indexes = new Map<string, number>();
  return (prefix: string) => {
    const index = indexes.get(prefix) ?? 0;
    indexes.set(prefix, index + 1);
    return `${prefix}${index}`;
  };
}
