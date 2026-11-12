import { component$, useSignal } from '@qwik.dev/core';
import { getGroupDensitySummaries, getNeighborhood } from './visualizations';
import { describe, expect, it, vi } from 'vitest';
import { domRender, trigger } from '@qwik.dev/core/testing';
import { createBundleViewData } from '../bundles/bundle-view';
import { VisualizationExplorer } from './visualization-explorer';

vi.mock('./visualizations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./visualizations')>();
  return {
    ...actual,
    getGroupDensitySummaries: vi.fn(actual.getGroupDensitySummaries),
    getNeighborhood: vi.fn(actual.getNeighborhood),
  };
});

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
  observedEdges: [
    { from: 'alpha', to: 'beta', count: 8 },
    { from: 'beta', to: 'gamma', count: 6 },
  ],
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
  it('keeps complete graph labels available when their display is truncated', async () => {
    const report = {
      ...data,
      symbols: data.symbols.map((symbol) => ({
        ...symbol,
        fullName: (symbol.fullName || symbol.name).repeat(100),
      })),
    };
    const { document } = await domRender(
      <VisualizationExplorer data={report} initialView="neighborhood" />
    );
    for (const label of document.querySelectorAll('.lab-node code')) {
      expect(label.getAttribute('title')).toBe(label.textContent);
    }
  });
  it('renders directed group density and supporting pair counts', async () => {
    const { document } = await domRender(
      <VisualizationExplorer data={data} initialView="matrix" />
    );
    expect(document.body.textContent).toContain('Which groups connect?');
    expect(document.body.textContent).toContain('50.00% density');
    expect(document.body.textContent).toContain('1 of 2 possible directed pairs');
  });
  it('renders observed paths with counts and temporal limitations', async () => {
    const { document } = await domRender(<VisualizationExplorer data={data} initialView="paths" />);
    expect(document.body.textContent).toContain('2 observed steps');
    expect(document.body.textContent).toContain('8 adjacent executions');
    expect(document.body.textContent).toContain(
      'does not prove that the entire sequence occurred together'
    );
  });
  it('skips hidden aggregations and reuses density when selecting another cell', async () => {
    vi.mocked(getGroupDensitySummaries).mockClear();
    vi.mocked(getNeighborhood).mockClear();
    const groups = await domRender(<VisualizationExplorer data={data} />);
    expect(getGroupDensitySummaries).not.toHaveBeenCalled();
    expect(getNeighborhood).not.toHaveBeenCalled();
    const buttons = groups.document.querySelectorAll<HTMLButtonElement>('button[aria-pressed]');
    await trigger(groups.document.body, buttons[1], 'click');
    expect(getGroupDensitySummaries).not.toHaveBeenCalled();
    const { document } = await domRender(
      <VisualizationExplorer data={data} initialView="matrix" />
    );
    expect(getGroupDensitySummaries).toHaveBeenCalledTimes(1);
    expect(getNeighborhood).not.toHaveBeenCalled();
    const cell = document.querySelectorAll<HTMLButtonElement>(
      'button[aria-label*="percent of pairs"]'
    )[1];
    await trigger(document.body, cell, 'click');
    expect(getGroupDensitySummaries).toHaveBeenCalledTimes(1);
    const threshold = document.querySelector<HTMLSelectElement>('select')!;
    threshold.value = '0.8';
    await trigger(document.body, threshold, 'change');
    expect(getGroupDensitySummaries).toHaveBeenCalledTimes(1);
  });
  it('labels a tiny positive density consistently in the cell and its detail', async () => {
    const symbols = Array.from({ length: 1000 }, (_, index) => ({
      ...data.symbols[0],
      name: `s${index}`,
    }));
    const matrix = symbols.map(() => [] as { column: number; value: number }[]);
    matrix[500] = [{ column: 0, value: 1 }];
    const report = {
      ...data,
      symbols,
      matrix,
      bundles: [
        { ...data.bundles[0], name: 'first', symbols: symbols.slice(0, 500) },
        { ...data.bundles[0], name: 'second', symbols: symbols.slice(500) },
      ],
    };
    const { document } = await domRender(
      <VisualizationExplorer data={report} initialView="matrix" />
    );
    const cell = document.querySelector<HTMLButtonElement>('button[aria-label*="less than"]')!;
    expect(cell).toBeTruthy();
    expect(cell.textContent).toContain('<0.1%');
    expect(cell.getAttribute('aria-label')).toContain('less than 0.01 percent');
    await trigger(document.body, cell, 'click');
    expect(document.body.textContent).toContain('<0.01% density');
    expect(document.body.textContent).toMatch(/1 of 250,?000/);
  });
  it('chooses valid path endpoints after the report is replaced', async () => {
    const replacement = {
      ...data,
      symbols: data.symbols.map((symbol) => ({
        ...symbol,
        name: `new-${symbol.name}`,
        fullName: `new-${symbol.fullName}`,
      })),
      observedEdges: data.observedEdges.map((edge) => ({
        ...edge,
        from: `new-${edge.from}`,
        to: `new-${edge.to}`,
      })),
    };
    const Host = component$(() => {
      const report = useSignal(data);
      return (
        <>
          <button
            data-new-report
            onClick$={() => {
              report.value = replacement;
            }}
          >
            New report
          </button>
          <VisualizationExplorer data={report.value} initialView="paths" />
        </>
      );
    });
    const { document } = await domRender(<Host />);
    expect(document.querySelectorAll('.lab-path code')).toHaveLength(3);
    await trigger(document.body, '[data-new-report]', 'click');
    const labels = document.querySelectorAll('.lab-path code');
    expect(labels).toHaveLength(3);
    for (const label of labels) {
      expect(label.textContent).toContain('new-');
    }
  });
});
