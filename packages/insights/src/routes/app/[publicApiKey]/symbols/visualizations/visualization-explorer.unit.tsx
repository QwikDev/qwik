import { component$, useSignal } from '@qwik.dev/core';
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
  it('preserves the report query when switching visualization views', async () => {
    const { document } = await domRender(
      <VisualizationExplorer data={data} currentSearch="?limit=25&view=unknown&filter=a%26b" />
    );
    const links = document.querySelectorAll<HTMLAnchorElement>('a[href^="?"]');
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      const params = new URLSearchParams(link.getAttribute('href')!);
      expect(params.get('limit')).toBe('25');
      expect(params.get('filter')).toBe('a&b');
      expect(params.getAll('view')).toHaveLength(1);
      expect(params.get('view')).not.toBe('unknown');
    }
  });

  it('shows symbol shares and updates the selected group', async () => {
    const { document } = await domRender(<VisualizationExplorer data={data} />);
    expect(document.body.textContent).toContain('How is this application divided?');
    expect(document.body.textContent).toContain('66.7%');
    const groups = document.querySelectorAll<HTMLButtonElement>('button[aria-pressed]');
    await trigger(document.body, groups[1], 'click');
    expect(document.querySelector('aside h3')?.textContent).toBe('Group 2');
    expect(document.querySelector('aside')?.textContent).toContain('gamma_component');
  });
  it('keeps a visible selection after collapsing the group list', async () => {
    const groups = Array.from({ length: 9 }, (_, index) => ({
      ...data.bundles[0],
      name: `group-${index}`,
    }));
    const { document } = await domRender(
      <VisualizationExplorer data={{ ...data, bundles: groups }} />
    );
    const toggle = () =>
      Array.from(document.querySelectorAll('button')).find(
        (button) =>
          button.textContent?.includes('Show all') || button.textContent?.includes('Show largest')
      )!;
    await trigger(document.body, toggle(), 'click');
    await trigger(document.body, document.querySelectorAll('button[aria-pressed]')[8], 'click');
    await trigger(document.body, toggle(), 'click');
    expect(document.querySelector('button[aria-pressed="true"]')).toBeTruthy();
    expect(document.querySelector('aside h3')?.textContent).toBe('Group 1');
  });
  it('expands source members beyond the initial six', async () => {
    const members = Array.from({ length: 8 }, (_, index) => ({
      ...data.symbols[0],
      name: `member-${index}`,
      fullName: `Member ${index}`,
    }));
    const report = {
      ...data,
      symbols: members,
      bundles: [{ ...data.bundles[0], symbols: members }],
    };
    const { document } = await domRender(<VisualizationExplorer data={report} />);
    expect(document.querySelectorAll('aside li')).toHaveLength(6);
    expect(document.querySelector('aside')?.textContent).toContain('Showing 6 of 8');
    const more = Array.from(document.querySelectorAll('aside button')).find((button) =>
      button.textContent?.includes('Show more')
    )!;
    await trigger(document.body, more, 'click');
    expect(document.querySelectorAll('aside li')).toHaveLength(8);
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
  it('replaces a retained symbol when a new dataset does not contain it', async () => {
    const replacement = {
      ...data,
      symbols: data.symbols.map((symbol) => ({
        ...symbol,
        name: `new-${symbol.name}`,
        fullName: `new-${symbol.fullName}`,
      })),
      bundles: [],
    };
    const Host = component$(() => {
      const report = useSignal(data);
      return (
        <>
          <button
            data-replace
            onClick$={() => {
              report.value = replacement;
            }}
          >
            Replace report
          </button>
          <VisualizationExplorer data={report.value} initialView="neighborhood" />
        </>
      );
    });
    const { document } = await domRender(<Host />);
    expect(document.querySelector('.lab-center code')?.textContent).not.toContain('new-');
    await trigger(document.body, '[data-replace]', 'click');
    expect(document.querySelector('.lab-center code')?.textContent).toContain('new-');
  });
});
