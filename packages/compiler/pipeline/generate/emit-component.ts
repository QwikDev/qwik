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
import { signalReadName } from './emit-setup';
import { rootArgs } from './emit-chunk';

export interface ComponentEmission {
  statements: string[];
  value: string;
}

export interface GeneratedNames {
  props: string;
  ctx: string;
}

type ComponentOp = Extract<LinkedOp, { op: OpKind.Component }>;
interface ComponentRenderPass {
  names: GeneratedNames;
  next: (prefix: string) => string;
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
  resolveQrl: ResolveComponentQrl
) {
  if (component.target.t !== ComponentTargetKind.Declaration) {
    throw new UnsupportedError('a dynamic component call');
  }
  const props = emitComponentProps(module, component, pass, imports, resolveQrl);
  const projections = emitComponentProjections(component, pass, imports, resolveQrl);
  const target = module.bindings[component.target.binding].name;
  imports.add(QwikWord.CreateComponent);
  return {
    expression: `${QwikWord.CreateComponent}(${props.expression}, (${pass.names.props}) => ${target}(${pass.names.props}, ${pass.names.ctx})${projections.options})`,
    roots: [...props.roots, ...projections.roots],
    rootDeclarations: projections.declarations,
    statements: [...props.statements, ...projections.statements],
  };
}

function emitComponentProjections(
  component: ComponentOp,
  pass: ComponentRenderPass,
  imports: Set<string>,
  resolveQrl: ResolveComponentQrl
): { options: string; roots: string[]; declarations: string[]; statements: string[] } {
  if (component.projections.length === 0) {
    return { options: '', roots: [], declarations: [], statements: [] };
  }
  imports.add(QwikWord.CreateSlotScope);
  const scope = pass.next(QwikGenWord.SlotScope);
  const statements: string[] = [];
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
    statements.push(
      `${QwikWord.RegisterProjection}(${scope}, ${JSON.stringify(projection.name)}, ${render});`
    );
  }
  return {
    options: `, { slotScope: ${scope} }`,
    roots: [scope],
    declarations: [`const ${scope} = ${QwikWord.CreateSlotScope}();`],
    statements,
  };
}

function emitProjectionQrl(use: QrlUse, resolveQrl: ResolveComponentQrl): string {
  const { qrl, reference, args } = resolveQrl(use, true);
  if (qrl.payloadKind !== QrlPayloadKind.Function) {
    throw new UnsupportedError('a non-function component projection QRL');
  }
  return args.length === 0 ? reference : `${reference}.w([${args.join(', ')}])`;
}

function emitComponentProps(
  module: LinkedModule,
  component: ComponentOp,
  pass: ComponentRenderPass,
  imports: Set<string>,
  resolveQrl: ResolveComponentQrl
): { expression: string; roots: string[]; statements: string[] } {
  if (component.props.c === ComponentPropsKind.Proxy) {
    const { qrl, reference, args } = resolveQrl(component.props.compute, true);
    if (qrl.payloadKind !== QrlPayloadKind.Value) {
      throw new UnsupportedError('a non-value component props QRL');
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
        let value: {
          statements: string[];
          expression: string;
          source: string;
          roots: string[];
        };
        if (prop.value.v === ValueKind.Read) {
          const signal = signalReadName(module, prop.value.expr);
          imports.add(QwikWord.ReadTrackedSourceValue);
          value = {
            statements: [],
            expression: `${QwikWord.ReadTrackedSourceValue}(${signal})`,
            source: signal,
            roots: [signal],
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
        if (prop.handlers.length !== 1) {
          throw new UnsupportedError('multiple component event handlers');
        }
        const handler = prop.handlers[0];
        if (handler.h !== HandlerKind.Value || handler.value.v !== ValueKind.Qrl) {
          throw new UnsupportedError('a non-QRL component event handler');
        }
        const { qrl, reference, args } = resolveQrl(handler.value.use, false);
        if (qrl.payloadKind !== QrlPayloadKind.Function) {
          throw new UnsupportedError('a non-function component event QRL');
        }
        const eventQrl = args.length === 0 ? reference : `${reference}.w([${args.join(', ')}])`;
        entries.push(`${JSON.stringify(prop.name)}: ${eventQrl}`);
        roots.push(...rootArgs(qrl, args));
        break;
      }
      case PropKind.Spread: {
        flushEntries();
        if (prop.value.v === ValueKind.Computed) {
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
    expression = '{}';
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
  if (qrl.payloadKind !== QrlPayloadKind.Value) {
    throw new UnsupportedError('a non-value component QRL');
  }
  const propQrl = pass.next(QwikGenWord.PropQrl);
  imports.add(QwikWord.ReadExpression);
  return {
    statements: [
      `const ${propQrl} = ${args.length === 0 ? reference : `${reference}.w([${args.join(', ')}])`};`,
    ],
    expression: `${QwikWord.ReadExpression}(${propQrl})`,
    source: propQrl,
    roots: rootArgs(qrl, args),
  };
}

/** Allocates function locals without shadowing authored bindings. */
export function createNameAllocator(module: LinkedModule) {
  const usedNames = new Set(module.bindings.map((binding) => binding.name));
  const indexes = new Map<string, number>();
  return (prefix: string) => {
    let index = indexes.get(prefix) ?? 0;
    let name: string;
    do {
      name = `${prefix}${index++}`;
    } while (usedNames.has(name));
    indexes.set(prefix, index);
    usedNames.add(name);
    return name;
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

function allocateGeneratedName(base: string, bound: readonly string[]): string {
  if (!bound.includes(base)) {
    return base;
  }
  for (let index = 0; ; index++) {
    const candidate = `${base}${index}`;
    if (!bound.includes(candidate)) {
      return candidate;
    }
  }
}

export function emitComponentFunction(
  qrl: LinkedQrl,
  emission: ComponentEmission,
  names: GeneratedNames
): string {
  const declaration = qrl.declaration;
  if (declaration === undefined) {
    throw new Error(`pipeline: emitting a declaration for the undeclared qrl "${qrl.id}"`);
  }
  const params = `${names.props}, ${names.ctx}`;
  const body = [...emission.statements, `return ${emission.value};`]
    .map((statement) => `  ${statement}`)
    .join('\n');
  switch (declaration.declarationKind) {
    case DeclarationKind.Const:
      return `export const ${declaration.name} = (${params}) => {\n${body}\n};`;
    case DeclarationKind.DefaultArrow:
      return `export default (${params}) => {\n${body}\n};`;
    case DeclarationKind.DefaultFunction:
      return `export default function${declaration.localName ? ` ${declaration.localName}` : ''}(${params}) {\n${body}\n}`;
    case DeclarationKind.Function:
      return `export function ${declaration.name}(${params}) {\n${body}\n}`;
  }
}
