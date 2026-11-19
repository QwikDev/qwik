import { expect, test } from 'vitest';
import { analyseModule } from '../index';
import { ModuleKind } from '../schema';

const compile = (jsx: string) =>
  analyseModule({ path: 'component.tsx', code: `export default (props) => ${jsx};` }, {});

test.each([
  '<p><div /></p>',
  '<p><span><h1 /></span></p>',
  '<table><tr><td /></tr></table>',
  '<div><td /></div>',
  '<div><li /></div>',
  '<select><div /></select>',
  '<a><a /></a>',
  '<button><span><button /></span></button>',
  '<form><form /></form>',
  '<table>{props.rows.map((row) => <tr key={row}><td /></tr>)}</table>',
  '<table>{props.ok && <tr />}</table>',
  '<title><b /></title>',
  '<textarea><span /></textarea>',
  '<head><div /></head>',
  '<title>{props.a}<b /></title>',
  '<div>{props.ok && <li />}</div>',
  '<div>{props.ok ? <option /> : null}</div>',
  '<table>{props.ok ? <tbody /> : <tr />}</table>',
  '<dl><dt><div><dd /></div></dt></dl>',
  '<dl><dd><span><div><dt /></div></span></dd></dl>',
  '<nobr><b><nobr /></b></nobr>',
  '<select><option><select /></option></select>',
  '<form><table><tbody><tr><td><form /></td></tr></tbody></table></form>',
  '<p>{props.ok ? <div /> : null}</p>',
  '<p>{props.ok ?? <div />}</p>',
])('diagnoses nesting the parser would restructure: %s', async (jsx) => {
  const plan = await compile(jsx);
  expect(plan.kind).toBe(ModuleKind.Failed);
  expect(plan.diagnostics).toMatchObject([{ code: 'dom-nesting' }]);
  expect(plan.diagnostics[0].span).not.toBeNull();
});

test.each([
  '<table><caption>c</caption><tbody><tr><td /></tr>{props.rows.map((row) => <tr key={row} />)}</tbody></table>',
  '<ul>{props.ok && <li />}</ul>',
  '<table>{props.ok ? <tbody><tr><td /></tr></tbody> : <></>}</table>',
  '<table>{props.ok && <tfoot><tr><td /></tr></tfoot>}</table>',
  '<table><tbody>{props.rows.map((row) => <tr key={row}><td /></tr>)}</tbody></table>',
  '<dl><dt /><dd /></dl>',
  '<p><span>text</span></p>',
  '<select><option /><optgroup><option /></optgroup></select>',
  '<head><title>t</title><meta charset="utf-8" /></head>',
  '<ul><li>a<ul><li>b</li></ul></li></ul>',
  '<ol><li><ol><li /></ol></li></ol>',
  '<ul><li><menu><li /></menu></li></ul>',
  '<dl><dd><dl><dd /><dt /></dl></dd></dl>',
  '<dl><dd><section><div><dt /></div></section></dd></dl>',
  '<a><table><tbody><tr><td><a /></td></tr></tbody></table></a>',
  '<button><table><tbody><tr><td><button /></td></tr></tbody></table></button>',
  '<nobr><table><tbody><tr><th><nobr /></th></tr></tbody></table></nobr>',
])('accepts valid nesting: %s', async (jsx) => {
  const plan = await compile(jsx);
  expect(plan.diagnostics).toEqual([]);
});

test.each([
  `export default () => <p><button onClick$={() => console.log(<div />)}>x</button></p>;`,
  `export default () => { const row = () => <div />; return <p><button onClick$={() => console.log(row())}>x</button></p>; };`,
])('checks JSX in a function where it renders, not where it is written: %s', async (code) => {
  const plan = await analyseModule({ path: 'component.tsx', code }, {});
  expect(plan.diagnostics).toEqual([]);
});

test.each([
  '<template><span>{props.a}</span></template>',
  '<template>{props.ok && <b />}</template>',
  '<template><button onClick$={() => 1} /></template>',
])('diagnoses live content the parser would store in an inert template: %s', async (jsx) => {
  const plan = await compile(jsx);
  expect(plan.kind).toBe(ModuleKind.Failed);
  expect(plan.diagnostics).toMatchObject([{ code: 'template-content' }]);
});

test.each([
  '<template><b>static</b><i dangerouslySetInnerHTML="<u>x</u>" /></template>',
  '<div q:shadowRoot><template shadowRootMode="open"><span>{props.a}</span></template></div>',
])('accepts template content: %s', async (jsx) => {
  const plan = await compile(jsx);
  expect(plan.diagnostics).toEqual([]);
});

test('diagnoses a hook called inside a collection row', async () => {
  const plan = await analyseModule(
    {
      path: 'component.tsx',
      code: `import { useSignal } from '@qwik.dev/core';
export default (props) => <ul>{props.rows.map((row) => { const open = useSignal(false); return <li key={row}>{open.value}</li>; })}</ul>;`,
    },
    {}
  );
  expect(plan.kind).toBe(ModuleKind.Failed);
  expect(plan.diagnostics).toMatchObject([{ code: 'expression-hook' }]);
});

test('diagnoses an async collection row', async () => {
  const plan = await analyseModule(
    {
      path: 'component.tsx',
      code: `export default (props) => <ul>{props.rows.map(async (row) => <li key={row}>{await row}</li>)}</ul>;`,
    },
    {}
  );
  expect(plan.kind).toBe(ModuleKind.Failed);
  expect(plan.diagnostics).toMatchObject([{ code: 'async-row' }]);
  expect(plan.diagnostics[0].span).not.toBeNull();
});
