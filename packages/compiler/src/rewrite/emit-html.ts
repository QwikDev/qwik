import type { ComponentPropPart, HtmlPart, RenderResult, RewriteComponent } from './types';
import { QwikComments, QwikGenWord, QwikWord } from './words';

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
      case 'elementText':
        if (!markers) {
          return null;
        }
        html += ' ';
        break;
      case 'rangeText':
        if (!markers) {
          return null;
        }
        html += QwikComments.TextMarker;
        break;
      case 'dynamicJsx':
      case 'component':
      case 'branch':
      case 'for':
        if (!markers) {
          return null;
        }
        html += ' ';
        break;
      case 'target':
      case 'attr':
      case 'props':
      case 'event':
        if (!markers) {
          return null;
        }
        break;
      case 'childrenStart':
      case 'childrenEnd':
        break;
      default:
        return null;
    }
  }
  return html;
}

export function emitComponentProps(
  props: readonly ComponentPropPart[],
  source: string,
  imports: Set<string>
): string {
  const sources: string[] = [];
  let entries: string[] = [];
  const flushEntries = () => {
    if (entries.length > 0) {
      sources.push(`{ ${entries.join(', ')} }`);
      entries = [];
    }
  };
  for (const prop of props) {
    switch (prop.kind) {
      case 'static':
        entries.push(`${JSON.stringify(prop.name)}: ${JSON.stringify(prop.value)}`);
        break;
      case 'expression':
        entries.push(
          `get ${JSON.stringify(prop.name)}() { return ${source.slice(prop.expr[0], prop.expr[1])}; }`
        );
        break;
      case 'spread':
        flushEntries();
        sources.push(source.slice(prop.expr[0], prop.expr[1]));
        break;
    }
  }
  flushEntries();
  if (sources.length === 0) {
    return '{}';
  }
  if (sources.length === 1) {
    return sources[0];
  }
  imports.add(QwikWord.MergeProps);
  return `${QwikWord.MergeProps}(${sources.join(', ')})`;
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
