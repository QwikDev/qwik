/** Script and style content the server writes must survive the HTML tokenizer and still run. */
import { expect, test } from 'vitest';
import { transformModules } from '../transform-modules';
import { loadDefaultFunction } from './fixtures';
import * as core from '../../../qwik/src/core/index';
import { renderToStringCompiled } from '../../../qwik/src/server/ssr-render';

// Each one ends a `<script>` in the tokenizer: the name in any case, then a separator.
const closers = [
  '</SCRIPT>',
  '</script >',
  '</script/',
  '</script\n>',
  '</script\t>',
  '</script\f>',
  '</script\r>',
];
const harmless = ['</scripts>', '</scriptx', '</b', '</style>'];

async function renderApp(props: Record<string, string>) {
  const output = await transformModules({
    srcDir: 'src',
    isServer: true,
    input: [
      {
        path: 'src/app.tsx',
        code: `export default function App(props: { code: string; css: string }) {
  return (
    <div>
      <script id="live">{props.code}</script>
      <script id="literal">{'result.literal = [1</2/.test("2"), "</script>"];'}</script>
      <style id="css">{props.css}</style>
    </div>
  );
}`,
      },
    ],
  });
  expect(output.diagnostics).toEqual([]);
  const render = loadDefaultFunction(output.modules, core, true);
  return (await renderToStringCompiled(render, { props })).html;
}

function runScript(html: string, id: string): Record<string, unknown> {
  const text = html.match(new RegExp(`<script[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</script>`))![1];
  const result: Record<string, unknown> = {};
  new Function('result', text)(result);
  return result;
}

test('runs the script the server wrote, with only its closing tag guarded', async () => {
  const strings = [...closers, ...harmless];
  const code = `result.live = [1</2/.test("2"), ${strings.map((text) => `\`${text}\``).join(', ')}];`;
  const html = await renderApp({ code, css: 'a::after { content: "</script></style >"; }' });

  for (const closer of closers) {
    expect(html).not.toContain(closer);
  }
  for (const text of [...harmless, '1</2/.test']) {
    expect(html).toContain(text);
  }
  // A template literal reads a raw CR as LF; everything else comes back as written.
  expect(runScript(html, 'live').live).toEqual([
    false,
    ...strings.map((text) => text.replace('\r', '\n')),
  ]);
  expect(runScript(html, 'literal').literal).toEqual([false, '</script>']);
  // Inside a style, only `</style` ends the element.
  expect(html).toContain('content: "</script><\\/style >"');
});
