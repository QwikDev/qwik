import { describe, expect, it } from 'vitest';
import { domRender, trigger } from '@qwik.dev/core/testing';
import { BundleExplorer } from './bundle-explorer';
import { createBundleViewData } from './bundle-view';

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

  it('labels matrix cells and shows their details on focus and tap', async () => {
    const { document } = await domRender(<BundleExplorer data={data} />);
    await trigger(document.body, '[data-view="matrix"]', 'click');
    const cell = document.querySelector<HTMLButtonElement>(
      'button[data-row-symbol="first"][data-col-symbol="second"]'
    );
    expect(cell).toBeTruthy();
    expect(cell?.getAttribute('type')).toBe('button');
    expect(cell?.getAttribute('aria-label')).toBe('Row: first, Column: second, Score: 40%');
    await trigger(document.body, cell, 'focus');
    const details = document.querySelector('[data-matrix-details]');
    expect(details?.textContent).toContain('40%');
    expect(details?.textContent).toContain('first');
    expect(details?.textContent).toContain('second');
    expect(details?.hasAttribute('hidden')).toBe(false);

    await trigger(
      document.body,
      'button[data-row-symbol="second"][data-col-symbol="first"]',
      'click'
    );
    expect(details?.textContent).toContain('80%');
    const values = details?.querySelectorAll('td');
    expect(values?.[1].textContent).toBe('second');
    expect(values?.[2].textContent).toBe('first');
  });

  it('keeps matrix details when the pointer leaves a selected cell', async () => {
    const { document } = await domRender(<BundleExplorer data={data} />);
    await trigger(document.body, '[data-view="matrix"]', 'click');
    const cell = document.querySelector<HTMLButtonElement>(
      'button[data-row-symbol="first"][data-col-symbol="second"]'
    );
    expect(cell).toBeTruthy();
    await trigger(document.body, cell, 'mousemove');
    const details = document.querySelector('[data-matrix-details]');
    expect(details?.textContent).toContain('40%');
    await trigger(document.body, cell!.parentElement!.parentElement!, 'mouseleave');
    expect(details?.hasAttribute('hidden')).toBe(false);
    await trigger(document.body, cell!.parentElement!.parentElement!, 'mousemove');
    expect(details?.textContent).toContain('40%');
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
});
