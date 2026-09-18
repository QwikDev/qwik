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
])('accepts valid nesting: %s', async (jsx) => {
  const plan = await compile(jsx);
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
