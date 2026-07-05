import { emitComponentFunction, emitStaticHtml } from './emit-html';
import type {
  HtmlPart,
  Op,
  RenderResult,
  RewriteComponent,
  RewriteModule,
  RewriteOutput,
} from './types';
import { QwikAttributes, QwikComments, QwikGenWord, QwikWord } from './words';

interface SsrRender {
  imports: string[];
  statements: string[];
  value: string;
}

export function emitSsrModule(
  outputs: readonly RewriteOutput[],
  source: string
): RewriteModule | null {
  const imports = new Set<string>();
  const parts: string[] = [];
  for (const output of outputs) {
    const render = emitSsrRender(output.result, source);
    if (render === null) {
      return null;
    }
    for (const name of render.imports) {
      imports.add(name);
    }
    parts.push(emitSsrComponent(output.component, render));
  }
  return {
    imports: [...imports],
    code: parts.join('\n'),
  };
}

function emitSsrComponent(component: RewriteComponent, render: SsrRender): string {
  return emitComponentFunction(component, render.statements, render.value);
}

function emitSsrRender(result: RenderResult, source: string): SsrRender | null {
  const html = emitStaticHtml(result);
  if (html !== null) {
    const value = JSON.stringify(html);
    return {
      imports: [],
      statements: result.providesContext ? emitSetupStatements(result, source) : [],
      value: result.providesContext ? emitContextHtml(value) : value,
    };
  }
  return emitDynamicRender(result, source);
}

function emitDynamicRender(result: RenderResult, source: string): SsrRender | null {
  if (result.root === null) {
    return null;
  }
  const next = createNameAllocator();
  const id = next(QwikGenWord.Id);
  const markerIndexes = createMarkerIndexes(result.html);
  const texts = new Map<number, string>();
  const attrs = new Map<string, string>();
  const targetIds = new Map<number, string>([[result.root, id]]);
  const statements = [...emitSetupStatements(result, source), `const ${id} = ctx.nextId();`];
  for (const op of result.ops) {
    const emitted = emitSsrOp(op, markerIndexes, texts, attrs, targetIds, source, id, next);
    if (emitted === null) {
      return null;
    }
    statements.push(...emitted);
  }
  const value = emitDynamicHtml(result.html, result.root, id, texts, attrs, targetIds);
  if (value === null) {
    return null;
  }
  const textNames = [...texts.values()];
  const attrNames = [...attrs.values()];
  const dynamicNames = [...textNames, ...attrNames];
  if (dynamicNames.length === 0) {
    return null;
  }
  const renderedHtml = result.providesContext ? emitContextHtml(value) : value;
  return {
    imports: [
      QwikWord.EscapeHTML,
      ...(textNames.length > 0
        ? [QwikWord.RenderSsrTextNode, QwikWord.CreateSsrRangeTextTarget]
        : []),
      ...(attrNames.length > 0 ? [QwikWord.CreateSsrElementTarget, QwikWord.RenderSsrAttr] : []),
      QwikWord.MaybeThen,
      ...(dynamicNames.length > 1 ? [QwikWord.PromiseAll] : []),
    ],
    statements,
    value:
      dynamicNames.length === 1
        ? `${QwikWord.MaybeThen}(${dynamicNames[0]}, (${dynamicNames[0]}) => ${renderedHtml})`
        : `${QwikWord.MaybeThen}(${QwikWord.PromiseAll}([${dynamicNames.join(', ')}]), ([${dynamicNames.join(', ')}]) => ${renderedHtml})`,
  };
}

function emitSetupStatements(result: RenderResult, source: string): string[] {
  return [
    ...result.setup.map((range) => source.slice(range[0], range[1]).trim()),
    ...(result.providesContext ? ['const contextScopeId = ctx.contextScopeId();'] : []),
  ];
}

function emitContextHtml(html: string): string {
  return `'<!c=' + contextScopeId + '>' + ${html} + '<!/c>'`;
}

function emitSsrOp(
  op: Op,
  markerIndexes: Map<number, number>,
  texts: Map<number, string>,
  attrs: Map<string, string>,
  targetIds: Map<number, string>,
  source: string,
  id: string,
  next: (prefix: string) => string
): string[] | null {
  switch (op.kind) {
    case 'textEffect':
      return emitSsrTextOp(op, markerIndexes, texts, source, id, next);
    case 'attrEffect':
      return emitSsrAttrOp(op, attrs, targetIds, source, next);
    case 'event':
      // ponytail: valid IR, add emission here when attrs/events land.
      return [];
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
  id: string,
  texts: ReadonlyMap<number, string>,
  attrs: ReadonlyMap<string, string>,
  targetIds: ReadonlyMap<number, string>
): string | null {
  const expressions: string[] = [];
  let didInjectRootId = false;
  const injectedTargets = new Set<number>();
  for (const part of parts) {
    switch (part.kind) {
      case 'html': {
        const expression = didInjectRootId
          ? JSON.stringify(part.value)
          : emitRootHtml(part.value, id);
        if (expression === null) {
          return null;
        }
        didInjectRootId = true;
        injectedTargets.add(root);
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
