import type { Transformer } from 'unified';
import { toString } from 'hast-util-to-string';
import { visit } from 'unist-util-visit';
import { refractor } from 'refractor';
import tsxLang from 'refractor/lang/tsx.js';

export function rehypeSyntaxHighlight(): Transformer {
  refractor.register(tsxLang);

  return async (ast) => {
    visit(ast, 'element', (node: any, _index: number, parent: any) => {
      if (
        !parent ||
        parent.tagName !== 'pre' ||
        node.tagName !== 'code' ||
        !Array.isArray(node.properties.className)
      ) {
        return;
      }

      for (let i = 0; i < node.properties.className.length; i++) {
        const className = node.properties.className[i];
        const lang = getLanguage(className);
        if (lang && refractor.registered(lang)) {
          node.properties.className[i] = 'language-' + lang;
          syntaxHighlight(node, lang);
          return;
        }
      }
    });
  };
}

function syntaxHighlight(node: any, lang: string) {
  const code = toString(node);
  const result = refractor.highlight(code, lang);
  if (result && Array.isArray(node.children)) {
    node.children = result.children;
  }
}

function getLanguage(className: string) {
  if (typeof className === 'string') {
    className = className.toLowerCase();
    if (className.startsWith('language-')) {
      return className.slice(9);
    }
  }
  return null;
}
