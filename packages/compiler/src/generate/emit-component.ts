import {
  ComponentPropsKind,
  ComponentTargetKind,
  DeclarationKind,
  HandlerKind,
  OpKind,
  PropKind,
  ProjectionKind,
  QrlPayloadKind,
  ResumeKind,
  ValueKind,
  type LinkedModule,
  type LinkedOp,
  type LinkedQrl,
  type QrlUse,
  type Value,
} from '../schema';
import { UnsupportedError } from '../errors';
import { QwikGenWord, QwikHook, QwikWord } from '../words';
import { readSource } from './emit-setup';
import { inlineValueJs, rootArgs, valueIrJs } from './emit-chunk';
import { allocateGeneratedName } from '../names';

export interface ComponentEmission {
  statements: string[];
  value: string;
  /** Generated parameters after props and ctx, e.g. prop defaults. */
  params?: string[];
}

export interface GeneratedNames {
  props: string;
  ctx: string;
}

type ComponentOp = Extract<LinkedOp, { op: OpKind.Component }>;
interface ComponentRenderPass {
  names: GeneratedNames;
  next: (prefix: string) => string;
  propSources: Map<string, string>;
  rooted?: Set<string>;
}
type ResolveComponentQrl = (
  use: QrlUse,
  invoked: boolean
) => {
  qrl: LinkedQrl;
  reference: string;
  args: string[];
};

/** Emits the renderer-independent call; each renderer owns placement of its result. */
export function emitComponentCall(
  module: LinkedModule,
  component: ComponentOp,
  pass: ComponentRenderPass,
  imports: Set<string>,
  resolveQrl: ResolveComponentQrl,
  /** The target's dynamic-tag helper for tags the plan cannot prove to be components. */
  dynamicTag: QwikWord,
  /** The client reads a dynamic slot name through a static function; the server serializes a QRL. */
  staticQrl: ((use: QrlUse) => string) | null = null
) {
  // Only the server roots what it serializes; the tag helper tells the targets apart.
  const ssrCtx = dynamicTag === QwikWord.RenderSsrDynamicTag ? pass.names.ctx : null;
  const props = emitComponentProps(module, component, pass, imports, resolveQrl, ssrCtx);
  const projections = emitComponentProjections(
    module,
    component,
    pass,
    imports,
    resolveQrl,
    staticQrl
  );
  const target = componentTargetJs(module, component.target, pass, imports, dynamicTag);
  imports.add(QwikWord.CreateComponent);
  return {
    expression: `${QwikWord.CreateComponent}(${target.expression}, ${props.expression}, ${pass.names.ctx}${projections.options})`,
    roots: [...props.roots, ...projections.roots],
    rootDeclarations: projections.declarations,
    statements: [...target.statements, ...props.statements, ...projections.statements],
  };
}

function emitComponentProjections(
  module: LinkedModule,
  component: ComponentOp,
  pass: ComponentRenderPass,
  imports: Set<string>,
  resolveQrl: ResolveComponentQrl,
  staticQrl: ((use: QrlUse) => string) | null
): { options: string; roots: string[]; declarations: string[]; statements: string[] } {
  if (component.projections.length === 0) {
    return { options: '', roots: [], declarations: [], statements: [] };
  }
  imports.add(QwikWord.CreateSlotScope);
  const scope = pass.next(QwikGenWord.SlotScope);
  const statements: string[] = [];
  const dynamicSlot =
    component.dynamicSlot === undefined ? null : resolveQrl(component.dynamicSlot, true).reference;
  const children = childrenDescriptorJs(component, imports);
  const scopeArgs = children === null ? [dynamicSlot ?? ''] : [dynamicSlot ?? 'null', children];
  for (const projection of component.projections) {
    if (projection.kind === ProjectionKind.Forward) {
      imports.add(QwikWord.ForwardSlot);
      const args = [scope];
      const fallback =
        projection.fallback === null ? null : emitProjectionQrl(projection.fallback, resolveQrl);
      if (fallback !== null) {
        args.push(JSON.stringify(projection.name), JSON.stringify(projection.sourceName), fallback);
      } else if (projection.sourceName !== '') {
        args.push(JSON.stringify(projection.name), JSON.stringify(projection.sourceName));
      } else if (projection.name !== '') {
        args.push(JSON.stringify(projection.name));
      }
      statements.push(`${QwikWord.ForwardSlot}(${args.join(', ')});`);
      continue;
    }
    imports.add(QwikWord.RegisterProjection);
    const render = emitProjectionQrl(projection.use, resolveQrl);
    const name =
      projection.nameUse === undefined
        ? JSON.stringify(projection.name)
        : staticQrl === null
          ? qrlReferenceJs(resolveQrl(projection.nameUse, true))
          : staticQrl(projection.nameUse);
    statements.push(`${QwikWord.RegisterProjection}(${scope}, ${name}, ${render});`);
  }
  return {
    options: `, { slotScope: ${scope} }`,
    roots: [scope],
    declarations: [`const ${scope} = ${QwikWord.CreateSlotScope}(${scopeArgs.join(', ')});`],
    statements,
  };
}

/**
 * A consumer that reads `props.children` gets one entry per authored default child, carrying only
 * the child's `q:type`. A linked consumer that never reads them gets none.
 */
function childrenDescriptorJs(component: ComponentOp, imports: Set<string>): string | null {
  const target = component.target;
  if (
    target.t === ComponentTargetKind.Declaration &&
    target.readsChildren.ok &&
    !target.readsChildren.value
  ) {
    return null;
  }
  const entries = component.projections.flatMap((projection) =>
    projection.kind !== ProjectionKind.Render ||
    projection.name !== '' ||
    projection.nameUse !== undefined
      ? []
      : [
          projection.childType === undefined
            ? QwikWord.EmptyObject
            : `{ "type": ${JSON.stringify(projection.childType)} }`,
        ]
  );
  if (entries.includes(QwikWord.EmptyObject)) {
    imports.add(QwikWord.EmptyObject);
  }
  return entries.length === 0 ? null : `[${entries.join(', ')}]`;
}

function emitProjectionQrl(use: QrlUse, resolveQrl: ResolveComponentQrl): string {
  const resolved = resolveQrl(use, true);
  if (resolved.qrl.payloadKind !== QrlPayloadKind.Function) {
    throw new UnsupportedError('a non-function component projection QRL');
  }
  return qrlReferenceJs(resolved);
}

function qrlReferenceJs({ reference, args }: ReturnType<ResolveComponentQrl>): string {
  return args.length === 0 ? reference : `${reference}.w([${args.join(', ')}])`;
}

function emitComponentProps(
  module: LinkedModule,
  component: ComponentOp,
  pass: ComponentRenderPass,
  imports: Set<string>,
  resolveQrl: ResolveComponentQrl,
  ssrCtx: string | null
): { expression: string; roots: string[]; statements: string[] } {
  if (component.props.c === ComponentPropsKind.Proxy) {
    const { qrl, reference, args } = resolveQrl(component.props.compute, true);
    if (qrl.payloadKind !== QrlPayloadKind.Function) {
      throw new UnsupportedError('a non-function component props QRL');
    }
    imports.add(QwikWord.CreatePropsProxy);
    imports.add(QwikHook.UseComputedQrl);
    const computeQrl = args.length === 0 ? reference : `${reference}.w([${args.join(', ')}])`;
    return {
      expression: `${QwikWord.CreatePropsProxy}(${QwikHook.UseComputedQrl}(${computeQrl}))`,
      roots: rootArgs(qrl, args),
      statements: [],
    };
  }
  const entries: string[] = [];
  const mergeInputs: string[] = [];
  const reactiveSources: string[] = [];
  const roots: string[] = [];
  const statements: string[] = [];
  const inlineQrl = (use: QrlUse) => {
    const { qrl, reference, args } = resolveQrl(use, true);
    roots.push(...rootArgs(qrl, args));
    return args.length === 0 ? reference : `${reference}.w([${args.join(', ')}])`;
  };
  const flushEntries = () => {
    if (entries.length > 0) {
      mergeInputs.push(`{ ${entries.join(', ')} }`);
      entries.length = 0;
    }
  };
  for (const prop of component.props.props) {
    switch (prop.k) {
      case PropKind.Static:
        entries.push(`${JSON.stringify(prop.name)}: ${JSON.stringify(prop.value)}`);
        break;
      case PropKind.Dynamic: {
        if (prop.value.v === ValueKind.Qrl) {
          entries.push(`${JSON.stringify(prop.name)}: ${inlineQrl(prop.value.use)}`);
          break;
        }
        if (prop.value.v === ValueKind.Computed && prop.value.resume.r === ResumeKind.Inline) {
          entries.push(
            `${JSON.stringify(prop.name)}: ${inlineValueJs(module, prop.value, inlineQrl)}`
          );
          break;
        }
        let value: {
          statements: string[];
          expression: string;
          source: string;
          roots: string[];
        };
        if (prop.value.v === ValueKind.Read) {
          const hoisted: string[] = [];
          const source = readSource(module, prop.value.expr, pass, hoisted, imports, ssrCtx);
          imports.add(QwikWord.ReadTrackedValue);
          value = {
            statements: hoisted,
            expression: `${QwikWord.ReadTrackedValue}(${source})`,
            source,
            roots: [source],
          };
        } else if (prop.value.v === ValueKind.Computed) {
          value = emitComponentExpression(prop.value, pass, imports, resolveQrl);
        } else {
          throw new UnsupportedError(`the component prop value "${prop.value.v}"`);
        }
        entries.push(`get ${JSON.stringify(prop.name)}() { return ${value.expression}; }`);
        reactiveSources.push(`${JSON.stringify(prop.name)}: ${value.source}`);
        roots.push(...value.roots);
        statements.push(...value.statements);
        break;
      }
      case PropKind.Event: {
        // Each handler is one QRL; a list reaches the child's element as an array.
        const handlers = prop.handlers.map((handler) => {
          if (
            handler.h === HandlerKind.Value &&
            handler.value.v === ValueKind.Computed &&
            handler.value.resume.r === ResumeKind.Inline
          ) {
            const reference = inlineValueJs(module, handler.value);
            roots.push(reference);
            return reference;
          }
          if (handler.h !== HandlerKind.Value || handler.value.v !== ValueKind.Qrl) {
            throw new UnsupportedError('a non-QRL component event handler');
          }
          const { qrl, reference, args } = resolveQrl(handler.value.use, false);
          if (qrl.payloadKind !== QrlPayloadKind.Function) {
            throw new UnsupportedError('a non-function component event QRL');
          }
          roots.push(...rootArgs(qrl, args));
          return args.length === 0 ? reference : `${reference}.w([${args.join(', ')}])`;
        });
        entries.push(
          `${JSON.stringify(prop.name)}: ${handlers.length === 1 ? handlers[0] : `[${handlers.join(', ')}]`}`
        );
        break;
      }
      case PropKind.Spread: {
        flushEntries();
        if (prop.value.v === ValueKind.Computed) {
          if (prop.value.resume.r === ResumeKind.Inline) {
            mergeInputs.push(inlineValueJs(module, prop.value));
            break;
          }
          const value = emitComponentExpression(prop.value, pass, imports, resolveQrl);
          mergeInputs.push(value.expression);
          roots.push(...value.roots);
          statements.push(...value.statements);
        } else {
          throw new UnsupportedError(`the component spread value "${prop.value.v}"`);
        }
        break;
      }
      default:
        throw new UnsupportedError(`the component prop "${prop.k}"`);
    }
  }
  flushEntries();
  let expression: string;
  if (mergeInputs.length === 0) {
    expression = 'null';
  } else if (mergeInputs.length === 1) {
    expression = mergeInputs[0];
  } else {
    imports.add(QwikWord.MergeProps);
    expression = `${QwikWord.MergeProps}(${mergeInputs.join(', ')})`;
  }
  if (reactiveSources.length === 0) {
    return { expression, roots, statements };
  }
  imports.add(QwikWord.Props);
  return {
    expression: `${QwikWord.Props}(${expression}, { ${reactiveSources.join(', ')} })`,
    roots,
    statements,
  };
}

function emitComponentExpression(
  value: Extract<Value, { v: ValueKind.Computed }>,
  pass: ComponentRenderPass,
  imports: Set<string>,
  resolveQrl: ResolveComponentQrl
) {
  if (value.resume.r !== ResumeKind.Qrl) {
    throw new UnsupportedError('a non-QRL computed component value');
  }
  const { qrl, reference, args } = resolveQrl(value.resume.qrl, true);
  if (qrl.payloadKind !== QrlPayloadKind.Function) {
    throw new UnsupportedError('a non-function component QRL');
  }
  // A computed prop is a source of its own: memoized for every reader and serialized by its QRL.
  const prop = pass.next(QwikGenWord.PropSource);
  imports.add(QwikWord.ComputedProp);
  imports.add(QwikWord.ReadTrackedValue);
  return {
    statements: [
      `const ${prop} = ${QwikWord.ComputedProp}(${args.length === 0 ? reference : `${reference}.w([${args.join(', ')}])`});`,
    ],
    expression: `${QwikWord.ReadTrackedValue}(${prop})`,
    source: prop,
    roots: [prop],
  };
}

/**
 * A tag proven to be a component declaration is called directly; a plain value or a member tag lets
 * the runtime decide between an element and a component from the value itself. A member tag is read
 * before the call so a surrounding content range tracks it.
 */
function componentTargetJs(
  module: LinkedModule,
  target: ComponentOp['target'],
  pass: ComponentRenderPass,
  imports: Set<string>,
  dynamicTag: QwikWord
): { expression: string; statements: string[] } {
  if (target.t === ComponentTargetKind.Declaration && !target.isValue) {
    return { expression: module.bindings[target.binding].name, statements: [] };
  }
  const isDynamic = target.t === ComponentTargetKind.Dynamic;
  const tag = isDynamic ? pass.next(QwikGenWord.Tag) : module.bindings[target.binding].name;
  imports.add(dynamicTag);
  const props = pass.next(QwikGenWord.ComponentProps);
  // Only the client creates the node; the server's string parses in its namespace by itself.
  const namespace =
    dynamicTag === QwikWord.CreateDynamicTag && target.namespace !== undefined
      ? `, '${target.namespace}'`
      : '';
  return {
    expression: `(${props}) => ${dynamicTag}(${tag}, ${props}, ${pass.names.ctx}${namespace})`,
    statements: isDynamic ? [`const ${tag} = ${valueIrJs(module, target.value)};`] : [],
  };
}

/** Generated parameter names dodge every binding the module declares. */
export function allocateGeneratedNames(module: LinkedModule): GeneratedNames {
  const bound = module.bindings.map((binding) => binding.name);
  return {
    props: allocateGeneratedName(QwikGenWord.ComponentProps, bound),
    ctx: allocateGeneratedName(QwikGenWord.ComponentContext, bound),
  };
}

/** The hashed export a component serializes as; the chunk is set only where serialization runs. */
export interface ComponentMarker {
  symbol: string;
  chunk: string | null;
}

export interface ComponentDeclarationEmission {
  text: string;
  /** `name as symbol`, exported at the module end so a sibling declarator stays intact. */
  alias: string | null;
}

/** A nested `component$` prints as the compiled arrow where the call stood. */
export function inlineComponentText(emission: ComponentEmission, names: GeneratedNames): string {
  const params = [names.props, names.ctx, ...(emission.params ?? [])].join(', ');
  const body = [...emission.statements, `return ${emission.value};`]
    .map((statement) => `  ${statement}`)
    .join('\n');
  return `(${params}) => {\n${body}\n}`;
}

export function emitComponentFunction(
  qrl: LinkedQrl,
  emission: ComponentEmission,
  names: GeneratedNames,
  marker: ComponentMarker | null = null
): ComponentDeclarationEmission {
  const declaration = qrl.declaration;
  if (declaration === undefined) {
    throw new Error(`pipeline: emitting a declaration for the undeclared qrl "${qrl.id}"`);
  }
  const params = [names.props, names.ctx, ...(emission.params ?? [])].join(', ');
  const exportPrefix = declaration.isExported ? 'export ' : '';
  const body = [...emission.statements, `return ${emission.value};`]
    .map((statement) => `  ${statement}`)
    .join('\n');
  const arrow = `(${params}) => {\n${body}\n}`;
  const symbol = declaration.expressionOnly ? null : (marker?.symbol ?? null);
  const mark = (value: string) =>
    marker === null || marker.chunk === null || symbol === null
      ? value
      : `${QwikWord.MarkComponent}(${value}, ${JSON.stringify(symbol)}, ${JSON.stringify(marker.chunk)})`;
  const alias = (name: string) => (symbol === null ? null : `${name} as ${symbol}`);
  // A function declaration keeps its hoisting; the marker follows it as a statement.
  const markAfter = (name: string) => (mark(name) === name ? '' : `\n${mark(name)};`);
  if (declaration.expressionOnly) {
    return { text: arrow, alias: null };
  }
  switch (declaration.declarationKind) {
    case DeclarationKind.Const:
      return {
        text: `${exportPrefix}const ${declaration.name} = ${mark(arrow)};`,
        alias: alias(declaration.name),
      };
    case DeclarationKind.DefaultArrow:
      // An anonymous default takes its symbol as the name it is also exported under.
      return symbol === null
        ? { text: `export default ${arrow};`, alias: null }
        : {
            text: `export const ${symbol} = ${mark(arrow)};\nexport default ${symbol};`,
            alias: null,
          };
    case DeclarationKind.DefaultFunction: {
      const name = declaration.localName ?? symbol;
      return {
        text: `export default function${name ? ` ${name}` : ''}(${params}) {\n${body}\n}${name ? markAfter(name) : ''}`,
        alias: name === null ? null : name === symbol ? symbol : alias(name),
      };
    }
    default:
      return {
        text: `${exportPrefix}function ${declaration.name}(${params}) {\n${body}\n}${markAfter(declaration.name)}`,
        alias: alias(declaration.name),
      };
  }
}
