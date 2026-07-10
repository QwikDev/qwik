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
  async = false
) {
  const params = `${QwikGenWord.ComponentProps}, ${QwikGenWord.ComponentContext}`;
  const body = [...statements.map((statement) => `  ${statement}`), `  return ${value};`].join(
    '\n'
  );
  if (component.declarationKind === 'const') {
    return `export const ${component.exportName} = ${async ? 'async ' : ''}(${params}) => {\n${body}\n};`;
  }
  if (component.declarationKind === 'defaultArrow') {
    return `export default ${async ? 'async ' : ''}(${params}) => {\n${body}\n};`;
  }
  return `${emitFunctionHead(component, async)}(${params}) {\n${body}\n}`;
}

function emitFunctionHead(component: RewriteComponent, async: boolean) {
  const functionKeyword = `${async ? 'async ' : ''}function`;
  if (component.declarationKind === 'defaultFunction') {
    return `export default ${functionKeyword}${component.localName ? ` ${component.localName}` : ''}`;
  }
  return `export ${functionKeyword} ${component.exportName}`;
}
