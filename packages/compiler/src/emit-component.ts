import type { ComponentDefinition } from './plan-types';
import { QwikGenWord } from './words';

export function emitComponentFunction(
  component: ComponentDefinition,
  statements: readonly string[],
  value: string,
  source: string,
  async = false,
  componentPropsName?: string,
  idBase: string | null = null
) {
  return emitComponentFunctionMode(
    component,
    statements,
    value,
    source,
    async,
    'module',
    componentPropsName,
    idBase
  );
}

/** Emits only the function/arrow range so the surrounding declaration can stay byte-for-byte. */
export function emitComponentRangeReplacement(
  component: ComponentDefinition,
  statements: readonly string[],
  value: string,
  source: string,
  async = false,
  componentPropsName?: string,
  idBase: string | null = null
) {
  return emitComponentFunctionMode(
    component,
    statements,
    value,
    source,
    async,
    'range',
    componentPropsName,
    idBase
  );
}

function emitComponentFunctionMode(
  component: ComponentDefinition,
  statements: readonly string[],
  value: string,
  source: string,
  async: boolean,
  mode: 'module' | 'range',
  componentPropsName?: string,
  idBase: string | null = null
) {
  const param = component.params.length === 1 ? component.params[0] : null;
  const props =
    param?.name ??
    (param?.bindingRange !== null && param?.bindingRange !== undefined
      ? (componentPropsName ?? QwikGenWord.ComponentProps)
      : QwikGenWord.ComponentProps);
  const params = `${props}, ${QwikGenWord.ComponentContext}${
    idBase === null ? '' : `, _id = ${JSON.stringify(idBase)}`
  }`;
  const paramSetup = emitComponentParamSetup(param, props, source);
  const body = [...(paramSetup === null ? [] : [paramSetup]), ...statements, `return ${value};`]
    .map((statement) => `  ${statement}`)
    .join('\n');
  if (component.declarationKind === 'const') {
    const arrow = `${async ? 'async ' : ''}(${params}) => {\n${body}\n}`;
    return mode === 'range' ? arrow : `export const ${component.exportName} = ${arrow};`;
  }
  if (component.declarationKind === 'defaultArrow') {
    const arrow = `${async ? 'async ' : ''}(${params}) => {\n${body}\n}`;
    return mode === 'range' ? arrow : `export default ${arrow};`;
  }
  return `${emitFunctionHead(component, async, mode)}(${params}) {\n${body}\n}`;
}

function emitComponentParamSetup(
  param: ComponentDefinition['params'][number] | null,
  props: string,
  source: string
): string | null {
  if (param?.name !== null || param.bindingRange === null) {
    return null;
  }
  const binding = source.slice(param.bindingRange[0], param.bindingRange[1]);
  const fallback =
    param.defaultRange === null
      ? ''
      : ` ?? ${source.slice(param.defaultRange[0], param.defaultRange[1])}`;
  return `const ${binding} = ${props}${fallback};`;
}

function emitFunctionHead(
  component: ComponentDefinition,
  async: boolean,
  mode: 'module' | 'range'
) {
  const functionKeyword = `${async ? 'async ' : ''}function`;
  if (mode === 'range') {
    return `${functionKeyword}${component.localName ? ` ${component.localName}` : ''}`;
  }
  if (component.declarationKind === 'defaultFunction') {
    return `export default ${functionKeyword}${component.localName ? ` ${component.localName}` : ''}`;
  }
  return `export ${functionKeyword} ${component.exportName}`;
}
