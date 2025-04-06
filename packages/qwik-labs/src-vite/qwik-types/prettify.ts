import { format } from 'prettier/standalone';
import estree from 'prettier/plugins/estree';
import typeScriptParser from 'prettier/parser-typescript';
import postCssParser from 'prettier/parser-postcss';
import htmlParser from 'prettier/parser-html';
import babelParser from 'prettier/parser-babel';

export async function prettify(
  template: TemplateStringsArray,
  ...substitutions: any[]
): Promise<string> {
  let source = '';
  for (let i = 0; i < template.length; i++) {
    source += template[i] + (i < substitutions.length ? String(substitutions[i]) : '');
  }
  try {
    source = await format(source, {
      parser: 'typescript',
      plugins: [
        // To support running in browsers
        // require('prettier/plugins/estree'),
        estree,
        // require('prettier/parser-typescript'),
        typeScriptParser,
        // require('prettier/parser-postcss'),
        postCssParser,
        // require('prettier/parser-html'),
        htmlParser,
        // require('prettier/parser-babel'),
        babelParser,
      ],
      htmlWhitespaceSensitivity: 'ignore',
    });
  } catch (e) {
    throw new Error(
      e +
        '\n' +
        '========================================================================\n' +
        source +
        '\n\n========================================================================'
    );
  }
  return source;
}
