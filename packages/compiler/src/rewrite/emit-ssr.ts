import { emitComponentFunction, emitStaticHtml } from './emit-html';
import { emitQrlReference, emitSetupQrl, getQrlVariableName } from './emit-qrl';
import { getSegmentImportPath } from './emit-segment';
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

function shouldResolveSsrSegment(segment: Segment): boolean {
  return segment.kind === 'qrl' && segment.ctxName !== QwikHooks.Dollar;
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

function emitSsrRender(
  result: RenderResult,
  source: string,
  segments: ReadonlyMap<string, Segment>
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
  return emitDynamicRender(result, source, segments, emittedSetup);
}

function emitDynamicRender(
  result: RenderResult,
  source: string,
  segments: ReadonlyMap<string, Segment>,
  emittedSetup: { setup: SsrSetup; imports: string[] }
): SsrRender | null {
  const root = result.roots[0];
  if (root === undefined) {
    return null;
  }
  const next = createNameAllocator();
  const hasTargetEffects = result.ops.some(
    (op) => op.kind === 'textEffect' || op.kind === 'attrEffect'
  );
  const id = hasTargetEffects ? next(QwikGenWord.Id) : null;
  const markerIndexes = createMarkerIndexes(result.html);
  const texts = new Map<number, string>();
  const attrs = new Map<string, string>();
  const events = new Map<string, string>();
  const html = emitVisibleTaskCarriers(result, source, events);
  const targetIds = new Map<number, string>(id === null ? [] : [[root, id]]);
  const statements = [
    ...emitSsrRenderPrelude(result),
    ...(id === null ? [] : [`const ${id} = ctx.nextId();`]),
  ];
  for (const op of result.ops) {
    const emitted = emitSsrOp(
      op,
      markerIndexes,
      texts,
      attrs,
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
  const value = emitDynamicHtml(html, root, id, texts, attrs, events, targetIds);
  if (value === null) {
    return null;
  }
  const textNames = [...texts.values()];
  const attrNames = [...attrs.values()];
  const dynamicNames = [...textNames, ...attrNames];
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
  return {
    imports: [
      ...setupImports,
      QwikWord.EscapeHTML,
      ...(textNames.length > 0
        ? [QwikWord.RenderSsrTextNode, QwikWord.CreateSsrRangeTextTarget]
        : []),
      ...(attrNames.length > 0 ? [QwikWord.CreateSsrElementTarget, QwikWord.RenderSsrAttr] : []),
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
      segment: key,
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
      return emitSsrTextOp(op, markerIndexes, texts, source, id, next);
    case 'attrEffect':
      return emitSsrAttrOp(op, attrs, targetIds, source, next);
    case 'event': {
      const segment = segments.get(op.segment);
      if (segment === undefined) {
        return null;
      }
      const qrl = getQrlVariableName(segment);
      const reference = op.captures.length > 0 ? `${qrl}.w([${op.captures.join(', ')}])` : qrl;
      events.set(
        createEventKey(op.target, op.name, op.segment),
        `ctx.eventAttr(${JSON.stringify(op.name)}, ${reference})`
      );
      return [];
    }
  }
}

function emitSsrAttrOp(
  op: Extract<Op, { kind: 'attrEffect' }>,
  attrs: Map<string, string>,
  targetIds: Map<number, string>,
  source: string,
  next: (prefix: string) => string
): string[] | null {
  if (op.trackedSource === null) {
    return null;
  }
  let targetId = targetIds.get(op.target);
  const statements: string[] = [];
  if (targetId === undefined) {
    targetId = next(QwikGenWord.Id);
    targetIds.set(op.target, targetId);
    statements.push(`const ${targetId} = ctx.nextId();`);
  }
  const sourceExpr = source.slice(op.trackedSource[0], op.trackedSource[1]);
  const attr = next('attr');
  attrs.set(createAttrKey(op.target, op.name, op.expr), attr);
  return [
    ...statements,
    `ctx.addRoot(${sourceExpr});`,
    `const ${attr} = ${QwikWord.RenderSsrAttr}(${QwikWord.CreateSsrElementTarget}(${targetId}), ${JSON.stringify(
      op.name
    )}, ${sourceExpr});`,
  ];
}

function emitSsrTextOp(
  op: Extract<Op, { kind: 'textEffect' }>,
  markerIndexes: Map<number, number>,
  texts: Map<number, string>,
  source: string,
  id: string,
  next: (prefix: string) => string
): string[] | null {
  const markerIndex = markerIndexes.get(op.marker);
  if (markerIndex === undefined) {
    return null;
  }
  if (op.trackedSource === null) {
    // ponytail: valid IR; add expression/QRL emission when text expressions land.
    return null;
  }
  const text = next(QwikGenWord.Text);
  const expr = source.slice(op.trackedSource[0], op.trackedSource[1]);
  texts.set(op.marker, text);
  return [
    `ctx.addRoot(${expr});`,
    `const ${text} = ${QwikWord.RenderSsrTextNode}(${QwikWord.CreateSsrRangeTextTarget}(${id}, ${markerIndex}), ${expr});`,
  ];
}

function createMarkerIndexes(parts: readonly HtmlPart[]) {
  const indexes = new Map<number, number>();
  let index = 0;
  for (const part of parts) {
    if (part.kind === 'marker') {
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
  events: ReadonlyMap<string, string>,
  targetIds: ReadonlyMap<number, string>
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
      case 'attr': {
        const attr = attrs.get(createAttrKey(part.target, part.name, part.expr));
        if (attr === undefined) {
          return null;
        }
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
        expressions.push(
          JSON.stringify(` ${part.name}="`),
          `${QwikWord.EscapeHTML}(${attr})`,
          JSON.stringify('"')
        );
        break;
      }
      case 'event': {
        const event = events.get(createEventKey(part.target, part.name, part.segment));
        if (event === undefined) {
          return null;
        }
        expressions.push(event);
        break;
      }
      case 'marker': {
        const text = texts.get(part.id);
        if (text === undefined) {
          return null;
        }
        expressions.push(
          JSON.stringify(QwikComments.TextMarker),
          `${QwikWord.EscapeHTML}(${text})`
        );
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

function createEventKey(target: number, name: string, segment: string) {
  return `${target}:${name}:${segment}`;
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
