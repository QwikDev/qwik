import type { HtmlPart, RenderResult, RewriteComponent } from './types';
import { QwikGenWord } from './words';

export function emitStaticHtml(result: RenderResult): string | null {
  return emitHtmlParts(result.html, false);
}

export function emitTemplateHtml(result: RenderResult): string | null {
  return emitHtmlParts(result.html, true);
}

function emitHtmlParts(parts: readonly HtmlPart[], markers: boolean): string | null {
  let html = '';
  for (const part of parts) {
    switch (part.kind) {
      case 'html':
        html += part.value;
        break;
      case 'marker':
        if (!markers) {
          return null;
        }
        html += ' ';
        break;
      case 'target':
      case 'attr':
      case 'event':
        if (!markers) {
          return null;
        }
        break;
      default:
        return null;
    }
  }
  return html;
}

export function emitComponentFunction(
  component: RewriteComponent,
  statements: readonly string[],
  value: string,
  source: string,
  async = false
) {
  const param = component.params.length === 1 ? component.params[0] : null;
  const props = param?.name ?? QwikGenWord.ComponentProps;
  const params = `${props}, ${QwikGenWord.ComponentContext}`;
  const paramSetup = emitComponentParamSetup(param, props, source);
  const body = [...(paramSetup === null ? [] : [paramSetup]), ...statements, `return ${value};`]
    .map((statement) => `  ${statement}`)
    .join('\n');
  if (component.declarationKind === 'const') {
    return `export const ${component.exportName} = ${async ? 'async ' : ''}(${params}) => {\n${body}\n};`;
  }
  if (component.declarationKind === 'defaultArrow') {
    return `export default ${async ? 'async ' : ''}(${params}) => {\n${body}\n};`;
  }
  return `${emitFunctionHead(component, async)}(${params}) {\n${body}\n}`;
}

function emitComponentParamSetup(
  param: RewriteComponent['params'][number] | null,
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

function emitFunctionHead(component: RewriteComponent, async: boolean) {
  const functionKeyword = `${async ? 'async ' : ''}function`;
  if (component.declarationKind === 'defaultFunction') {
    return `export default ${functionKeyword}${component.localName ? ` ${component.localName}` : ''}`;
  }
  return `export ${functionKeyword} ${component.exportName}`;
}
