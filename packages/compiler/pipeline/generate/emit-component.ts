import {
  ComponentPropsKind,
  ComponentTargetKind,
  DeclarationKind,
  OpKind,
  PropKind,
  ValueKind,
  type LinkedModule,
  type LinkedOp,
  type LinkedQrl,
} from '../schema';
import { UnsupportedError } from '../errors';
import { QwikGenWord, QwikWord } from '../words';
import { signalReadName } from './emit-setup';

export interface ComponentEmission {
  statements: string[];
  value: string;
}

export interface GeneratedNames {
  props: string;
  ctx: string;
}

type ComponentOp = Extract<LinkedOp, { op: OpKind.Component }>;

/** Emits the renderer-independent call; each renderer owns placement of its result. */
export function emitComponentCall(
  module: LinkedModule,
  component: ComponentOp,
  names: GeneratedNames,
  imports: Set<string>
) {
  if (component.target.t !== ComponentTargetKind.Declaration) {
    throw new UnsupportedError('a dynamic component call');
  }
  if (component.projections.length > 0) {
    throw new UnsupportedError('component children');
  }
  const props = emitComponentProps(module, component, imports);
  const target = module.bindings[component.target.binding].name;
  imports.add(QwikWord.CreateComponent);
  return {
    expression: `${QwikWord.CreateComponent}(${props.expression}, (${names.props}) => ${target}(${names.props}, ${names.ctx}))`,
    roots: props.roots,
  };
}

function emitComponentProps(
  module: LinkedModule,
  component: ComponentOp,
  imports: Set<string>
): { expression: string; roots: string[] } {
  if (component.props.c !== ComponentPropsKind.Entries) {
    throw new UnsupportedError('a component props proxy');
  }
  const entries: string[] = [];
  const sources: string[] = [];
  const roots: string[] = [];
  for (const prop of component.props.props) {
    switch (prop.k) {
      case PropKind.Static:
        entries.push(`${JSON.stringify(prop.name)}: ${JSON.stringify(prop.value)}`);
        break;
      case PropKind.Dynamic: {
        if (prop.value.v !== ValueKind.Read) {
          throw new UnsupportedError('a computed component prop');
        }
        const signal = signalReadName(module, prop.value.expr);
        imports.add(QwikWord.ReadTrackedSourceValue);
        entries.push(
          `get ${JSON.stringify(prop.name)}() { return ${QwikWord.ReadTrackedSourceValue}(${signal}); }`
        );
        sources.push(`${JSON.stringify(prop.name)}: ${signal}`);
        roots.push(signal);
        break;
      }
      default:
        throw new UnsupportedError(`the component prop "${prop.k}"`);
    }
  }
  const expression = entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`;
  if (sources.length === 0) {
    return { expression, roots };
  }
  imports.add(QwikWord.Props);
  return {
    expression: `${QwikWord.Props}(${expression}, { ${sources.join(', ')} })`,
    roots,
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
