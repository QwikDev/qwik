import { describe, expect, it } from 'vitest';
import { computeEventRows, computePerfViewModel } from './computePerfViewModel';
import type { QwikPerfStoreRemembered } from '@devtools/kit';
import type { PerfGroupedCsrItem } from './transformPerformanceData';

describe('computePerfViewModel', () => {
  it('prefers ssr list when present and groups csr via _component_ prefix', () => {
    const ssrButton = {
      id: 1,
      component: 'Button_component_hash',
      phase: 'ssr' as const,
      duration: 0,
      start: 0,
      end: 0,
      ssrCount: 1,
    };

    const data: QwikPerfStoreRemembered = {
      ssr: [ssrButton],
      csr: [
        {
          id: 10,
          component: 'Button_component_qwikContainer_useComputed_abc',
          phase: 'csr',
          duration: 4,
          start: 0,
          end: 4,
          renderCount: 2,
        },
        {
          id: 11,
          component: 'Button_component_hash',
          phase: 'csr',
          duration: 6,
          start: 0,
          end: 6,
          renderCount: 1,
        },
      ],
    };

    const vm = computePerfViewModel(data);
    expect(vm.components.map((c) => c.componentName)).toEqual(['Button']);
    expect(vm.components[0].calls).toBe(3);
    expect(vm.components[0].totalTime).toBe(10);
  });

  it('falls back to csr-only grouping by componentName when ssr is empty', () => {
    const data: QwikPerfStoreRemembered = {
      ssr: [],
      csr: [
        {
          id: 1,
          component: 'A_component_x_useEffect_1',
          phase: 'csr',
          duration: 1,
          start: 0,
          end: 1,
        },
        {
          id: 2,
          component: 'A_component_x_onClick_2',
          phase: 'csr',
          duration: 2,
          start: 0,
          end: 2,
          renderCount: 3,
        },
        {
          id: 3,
          component: 'B_component_y',
          phase: 'csr',
          duration: 5,
          start: 0,
          end: 5,
        },
      ],
    };

    const vm = computePerfViewModel(data);
    expect(vm.components.map((c) => c.componentName).sort()).toEqual([
      'A',
      'B',
    ]);
    const a = vm.components.find((c) => c.componentName === 'A')!;
    expect(a.totalTime).toBe(3);
    expect(a.calls).toBe(4);
  });
});

describe('computeEventRows', () => {
  it('uses render when eventName is missing and uses renderCount as calls fallback', () => {
    const items: PerfGroupedCsrItem[] = [
      {
        id: 1,
        component: 'A_component_x',
        componentName: 'A',
        phase: 'csr',
        duration: 2,
        start: 0,
        end: 2,
      },
      {
        id: 2,
        component: 'A_component_x_useEffect_1',
        componentName: 'A',
        eventName: 'useEffect',
        phase: 'csr',
        duration: 1,
        start: 0,
        end: 1,
        renderCount: 3,
      },
    ];

    const rows = computeEventRows(items);
    const byName = new Map(rows.map((r) => [r.eventName, r]));
    expect(byName.get('render')?.calls).toBe(1);
    expect(byName.get('render')?.time).toBe(2);
    expect(byName.get('useEffect')?.calls).toBe(3);
    expect(byName.get('useEffect')?.time).toBe(1);
  });
});
