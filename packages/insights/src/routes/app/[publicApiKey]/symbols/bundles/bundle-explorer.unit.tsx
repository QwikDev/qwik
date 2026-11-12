import { describe, expect, it, vi } from 'vitest';
import { domRender, trigger } from '@qwik.dev/core/testing';
import { BundleExplorer } from './bundle-explorer';
import { createBundleViewData } from './bundle-view';

vi.mock('~/components/symbol-tile', () => ({
  SymbolTile: ({ symbol, fullName }: { symbol: string; fullName?: string }) => (
    <span>{fullName || symbol}</span>
  ),
}));

const symbols = ['first', 'second', 'isolated'].map((name) => ({
  name,
  fullName: `${name}_component`,
  fileSrc: `${name}.tsx`,
  count: 10,
  depth: 0,
  children: [],
}));
const data = createBundleViewData(
  {
    symbols,
    vectors: [
      [1, 0.4, 0],
      [0.8, 1, 0],
      [0, 0, 1],
    ],
  },
  [
    { name: 'bundle_pair', symbols: symbols.slice(0, 2) },
    { name: 'bundle_isolated', symbols: symbols.slice(2) },
  ]
);

describe('bundle explorer', () => {
  it('leads with relationships and opens symbols or the matrix on request', async () => {
    const { document } = await domRender(<BundleExplorer data={data} />);
    expect(document.querySelector('[data-panel="relationships"]')).toBeTruthy();
    expect(document.querySelector('[data-panel="matrix"]')).toBeFalsy();
    expect(document.querySelector('[data-panel="symbols"]')).toBeFalsy();
    await trigger(document.body, '[data-view="symbols"]', 'click');
    expect(document.querySelector('[data-panel="symbols"]')?.textContent).toContain(
      'first_component'
    );
    await trigger(document.body, '[data-view="matrix"]', 'click');
    expect(document.querySelector('[data-panel="matrix"]')).toBeTruthy();
    await trigger(document.body, '[data-view="relationships"]', 'click');
    expect(document.querySelector('[data-panel="relationships"]')).toBeTruthy();
  });

  it('clears relationship details when selecting a different group', async () => {
    const { document } = await domRender(<BundleExplorer data={data} />);
    await trigger(document.body, '[data-relationship="0"]', 'click');
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toContain(
      'Selected relationship'
    );
    await trigger(document.body, '[data-group="1"]', 'click');
    expect(document.body.textContent).toContain('No connections to other symbols');
    expect(document.querySelector('[aria-live="polite"]')?.textContent).not.toContain(
      'Selected relationship'
    );
  });
  it('scopes the matrix to the selected group and lets users inspect either direction', async () => {
    const { document } = await domRender(<BundleExplorer data={data} />);
    await trigger(document.body, '[data-view="matrix"]', 'click');
    const selectValue = async (selector: string, value: string) => {
      const select = document.querySelector<HTMLSelectElement>(selector)!;
      expect(select).toBeTruthy();
      select.value = value;
      await trigger(document.body, select, 'change');
    };
    expect(document.querySelector('[data-matrix-title]')?.textContent).toContain('2 symbols');
    await selectValue('[data-matrix-row]', '1');
    expect(document.querySelector('[data-matrix-detail]')?.textContent).toContain('0.80 / 1');
    await selectValue('[data-matrix-row]', '0');
    await selectValue('[data-matrix-column]', '1');
    expect(document.querySelector('[data-matrix-detail]')?.textContent).toContain('0.40 / 1');
    await selectValue('[data-matrix-minimum]', '0.8');
    expect(document.querySelector('[data-matrix-detail]')?.textContent).toContain(
      'hidden by minimum score'
    );
    await selectValue('[data-matrix-scope]', 'all');
    expect(document.querySelector('[data-matrix-title]')?.textContent).toContain('3 symbols');
    await selectValue('[data-matrix-row]', '2');
    expect(document.querySelector('[data-matrix-detail]')?.textContent).toContain(
      'No modeled connection: 0.00 / 1'
    );
    await trigger(document.body, '[data-group="1"]', 'click');
    expect(document.querySelector('[data-matrix-title]')?.textContent).toContain('1 symbol');
  });
  it('shows weak positive matrix scores without rounding them to zero', async () => {
    const report = {
      ...data,
      matrix: [
        [
          { column: 0, value: 1 },
          { column: 1, value: 0.001 },
        ],
        ...data.matrix.slice(1),
      ],
    };
    const { document } = await domRender(<BundleExplorer data={report} />);
    await trigger(document.body, '[data-view="matrix"]', 'click');
    const column = document.querySelector<HTMLSelectElement>('[data-matrix-column]')!;
    column.value = '1';
    await trigger(document.body, column, 'change');
    expect(document.querySelector('[data-matrix-detail]')?.textContent).toContain(
      'Relationship score: 0.0010 / 1'
    );
  });
});
