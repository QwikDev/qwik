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
])('diagnoses nesting the parser would restructure: %s', async (jsx) => {
  const plan = await compile(jsx);
  expect(plan.kind).toBe(ModuleKind.Failed);
  expect(plan.diagnostics).toMatchObject([{ code: 'dom-nesting' }]);
  expect(plan.diagnostics[0].span).not.toBeNull();
});

test.each([
  '<table><caption>c</caption><tbody><tr><td /></tr>{props.rows.map((row) => <tr key={row} />)}</tbody></table>',
  '<ul>{props.ok && <li />}</ul>',
  '<dl><dt /><dd /></dl>',
  '<p><span>text</span></p>',
  '<select><option /><optgroup><option /></optgroup></select>',
  '<head><title>t</title><meta charset="utf-8" /></head>',
])('accepts valid nesting: %s', async (jsx) => {
  const plan = await compile(jsx);
  expect(plan.diagnostics).toEqual([]);
});
