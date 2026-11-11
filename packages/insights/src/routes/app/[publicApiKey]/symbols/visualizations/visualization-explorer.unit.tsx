import { describe, expect, it } from 'vitest';
import { domRender, trigger } from '@qwik.dev/core/testing';
import { createBundleViewData } from '../bundles/bundle-view';
import { VisualizationExplorer } from './visualization-explorer';

const symbols = ['alpha', 'beta', 'gamma'].map((name) => ({
  name,
  count: 10,
  depth: 0,
  children: [],
  fullName: `${name}_component`,
  fileSrc: `${name}.tsx`,
}));
const data = {
  ...createBundleViewData(
    {
      symbols,
      vectors: [
        [1, 0, 0],
        [0.8, 1, 0],
        [0, 0.6, 1],
      ],
    },
    [
      { name: 'first', symbols: symbols.slice(0, 2) },
      { name: 'second', symbols: symbols.slice(2) },
    ]
  ),
};

describe('visualization lab', () => {
  it('shows symbol shares and updates the selected group', async () => {
    const { document } = await domRender(<VisualizationExplorer data={data} />);
    expect(document.body.textContent).toContain('How is this application divided?');
    expect(document.body.textContent).toContain('66.7%');
    const groups = document.querySelectorAll<HTMLButtonElement>('button[aria-pressed]');
    await trigger(document.body, groups[1], 'click');
    expect(document.querySelector('aside h3')?.textContent).toBe('Group 2');
    expect(document.querySelector('aside')?.textContent).toContain('gamma_component');
  });
  it('recenters the neighborhood when a neighbor is selected', async () => {
    const { document } = await domRender(
      <VisualizationExplorer data={data} initialView="neighborhood" />
    );
    const selected = document.querySelector('.lab-center code')!.textContent;
    const neighbor = document.querySelector<HTMLButtonElement>('button.lab-node')!;
    const neighborName = neighbor.querySelector('code')!.textContent;
    expect(neighborName).not.toBe(selected);
    await trigger(document.body, neighbor, 'click');
    expect(document.querySelector('.lab-center code')?.textContent).toBe(neighborName);
  });
  it('shows separate ranked incoming and outgoing scores', async () => {
    const { document } = await domRender(
      <VisualizationExplorer data={data} initialView="ranked" />
    );
    expect(document.body.textContent).toContain('Which connections are strongest?');
    expect(document.body.textContent).toContain('Preceding symbols · top 5');
    expect(document.body.textContent).toContain('Later symbols · top 5');
    expect(document.body.textContent).toContain('0.80');
  });
  it('renders directed group density and supporting pair counts', async () => {
    const { document } = await domRender(
      <VisualizationExplorer data={data} initialView="matrix" />
    );
    expect(document.body.textContent).toContain('Which groups connect?');
    expect(document.body.textContent).toContain('50.00% density');
    expect(document.body.textContent).toContain('1 of 2 possible directed pairs');
  });
});
