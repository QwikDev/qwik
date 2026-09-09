import { expect, test } from 'vitest';
import { transformModules } from '../compat/transform-modules';
import { loadDefaultFunction } from './fixtures';
import * as core from '../../../qwik/src/core/index';
import { renderToStringCompiled } from '../../../qwik/src/server/ssr-render';

async function renderSource(code: string) {
  const output = await transformModules({
    srcDir: 'src',
    isServer: true,
    input: [{ path: 'src/fragment.tsx', code }],
  });
  expect(output.diagnostics).toEqual([]);
  const render = loadDefaultFunction(
    output.modules.find((module) => !module.segment)!,
    {
      ...core,
      get _captures() {
        return core._captures;
      },
    },
    true
  );
  return renderToStringCompiled(render);
}

test.each(['Fragment', 'F'])('renders imported %s as a transparent fragment', async (name) => {
  const { html } = await renderSource(`import { Fragment as ${name} } from '@qwik.dev/core';
export default () => <${name}><span>A</span><${name}><b>B</b></${name}><${name} /></${name}>;`);
  expect(html).toContain('<span>A</span><b>B</b>');
});

test('preserves fragment text boundaries and escaping', async () => {
  const { html } = await renderSource(`import { Fragment as F } from '@qwik.dev/core';
export default () => <p>before<F> middle <b>{'<unsafe>'}</b></F> after</p>;`);
  expect(html).toMatch(/<p>before middle <b[^>]*>&lt;unsafe&gt;<\/b> after<\/p>/);
});

test('routes named children through an explicit fragment projection', async () => {
  const { html } = await renderSource(`import { Fragment as F, Slot } from '@qwik.dev/core';
const Frame = () => <article><Slot name="title" /><Slot /></article>;
export default () => <Frame><F><h1 q:slot="title">title</h1><p>body</p></F></Frame>;`);
  expect(html).toContain('<h1>title</h1>');
  expect(html).toContain('<p>body</p>');
});

test('lowers a fragment created by a helper as a stored JSX value', async () => {
  const { html } = await renderSource(`import { Fragment as F } from '@qwik.dev/core';
function makeNode() { return <F><i>helper</i><b>value</b></F>; }
export default () => { const content = [<F><span>stored</span></F>, makeNode()]; return <main>{content}</main>; };`);
  expect(html).toContain('<span>stored</span>');
  expect(html).toContain('<i>helper</i><b>value</b>');
});

test('preserves a local component shadowing an imported Fragment', async () => {
  const { html } = await renderSource(`import { Fragment } from '@qwik.dev/core';
export default () => { const Fragment = () => <b>local</b>; return <Fragment />; };`);
  expect(html).toContain('<b>local</b>');
});

test.each(['Fragment', 'F'])('preserves unrelated imports named %s', async (name) => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: true,
    input: [
      {
        path: 'src/fragment.tsx',
        code: `import { Fragment as ${name} } from './other'; export default () => <${name} />;`,
      },
    ],
  });
  expect(output.diagnostics).toEqual([]);
  expect(output.modules.find((module) => !module.segment)!.code).toContain(
    `createComponent(${name},`
  );
});

test('retains an explicit fragment collection key', async () => {
  const { html } = await renderSource(`import { Fragment as F, useSignal } from '@qwik.dev/core';
export default () => { const rows = useSignal([{ id: 'one' }, { id: 'two' }]); return <main>{rows.value.map(row => <F key={row.id}><b>{row.id}</b><i>end</i></F>)}</main>; };`);
  expect(html).toContain('>one</b>');
  expect(html).toContain('>two</b>');
});

test.each(['children={<b />}', '{...props}', 'q:slot="title"'])(
  'rejects unsupported fragment attributes explicitly: %s',
  async (attribute) => {
    await expect(
      transformModules({
        srcDir: 'src',
        input: [
          {
            path: 'src/fragment.tsx',
            code: `import { Fragment } from '@qwik.dev/core'; export default (props) => <Fragment ${attribute} />;`,
          },
        ],
      })
    ).rejects.toThrow('Fragment attributes other than key');
  }
);

test('keeps lowercase JSX tags native even when an import uses that name', async () => {
  const { html } = await renderSource(`import { Fragment as fragment } from '@qwik.dev/core';
export default () => <fragment><b>native</b></fragment>;`);
  expect(html).toContain('<fragment><b>native</b></fragment>');
});
