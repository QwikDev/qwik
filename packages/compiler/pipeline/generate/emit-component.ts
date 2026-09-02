import {
  ComponentPropsKind,
  ComponentTargetKind,
  DeclarationKind,
  OpKind,
  type LinkedModule,
  type LinkedOp,
  type LinkedQrl,
} from '../schema';
import { UnsupportedError } from '../errors';
import { QwikGenWord, QwikWord } from '../words';

export interface ComponentEmission {
  statements: string[];
  value: string;
}

export interface GeneratedNames {
  props: string;
  ctx: string;
}

type ComponentOp = Extract<LinkedOp, { op: OpKind.Component }>;

/** Emits the target-independent invocation; each renderer owns placement of its result. */
export function componentCallExpression(
  module: LinkedModule,
  component: ComponentOp,
  names: GeneratedNames
): string {
  if (component.target.t !== ComponentTargetKind.Declaration) {
    throw new UnsupportedError('a dynamic component call');
  }
  if (component.props.c !== ComponentPropsKind.Entries || component.props.props.length > 0) {
    throw new UnsupportedError('component props');
  }
  if (component.projections.length > 0) {
    throw new UnsupportedError('component children');
  }
  const target = module.bindings[component.target.binding].name;
  return `${QwikWord.CreateComponent}({}, (${names.props}) => ${target}(${names.props}, ${names.ctx}))`;
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
