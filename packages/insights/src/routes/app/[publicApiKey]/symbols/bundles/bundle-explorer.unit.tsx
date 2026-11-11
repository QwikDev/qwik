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
