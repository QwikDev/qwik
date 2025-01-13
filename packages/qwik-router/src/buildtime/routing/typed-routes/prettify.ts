import { format } from 'prettier/standalone';

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
        require('prettier/plugins/estree'),
        require('prettier/parser-typescript'),
        require('prettier/parser-postcss'),
        require('prettier/parser-html'),
        require('prettier/parser-babel'),
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
