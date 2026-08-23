import { DeclarationKind, type ComponentDecl, type LinkedModule } from '../schema';
import { QwikGenWord } from '../words';

export interface ComponentEmission {
  statements: string[];
  value: string;
}

export interface GeneratedNames {
  props: string;
  ctx: string;
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
  component: ComponentDecl,
  emission: ComponentEmission,
  names: GeneratedNames
): string {
  const params = `${names.props}, ${names.ctx}`;
  const body = [...emission.statements, `return ${emission.value};`]
    .map((statement) => `  ${statement}`)
    .join('\n');
  switch (component.declarationKind) {
    case DeclarationKind.Const:
      return `export const ${component.name} = (${params}) => {\n${body}\n};`;
    case DeclarationKind.DefaultArrow:
      return `export default (${params}) => {\n${body}\n};`;
    case DeclarationKind.DefaultFunction:
      return `export default function${component.localName ? ` ${component.localName}` : ''}(${params}) {\n${body}\n}`;
    case DeclarationKind.Function:
      return `export function ${component.name}(${params}) {\n${body}\n}`;
  }
}
