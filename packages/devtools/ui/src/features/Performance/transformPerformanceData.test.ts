import { describe, expect, it } from 'vitest';
import { groupCsrBySsr } from './transformPerformanceData';
import type { QwikPerfStoreRemembered } from '@qwik.dev/devtools/kit';

describe('groupCsrBySsr', () => {
  it('groups CSR by SSR via `_component_` prefix (hook/event style + component instance style)', () => {
    const ssrButton = {
      id: 4,
      component: 'Button_component_4n7uUfcfzUA',
      phase: 'ssr' as const,
      duration: 0.1,
      start: 1,
      end: 1.1,
      ssrCount: 2,
    };

    const ssrRoutes = {
      id: 9,
      component: 'routes_component_SvRQF1kT0DY',
      phase: 'ssr' as const,
      duration: 0.002,
      start: 2,
      end: 2.002,
      ssrCount: 1,
    };

    const data: QwikPerfStoreRemembered = {
      ssr: [ssrButton, ssrRoutes],
      csr: [
        {
          id: 15,
          component: 'Button_component_qwikContainer_useComputed_U4doJ1SoX6Y',
          phase: 'csr',
          duration: 0.1,
          start: 10,
          end: 10.1,
          renderCount: 1,
        },
        {
          id: 16,
          component: 'Button_component_4n7uUfcfzUA',
          phase: 'csr',
          duration: 0.5,
          start: 11,
          end: 11.5,
          renderCount: 2,
        },
        {
          id: 11,
          component: 'routes_component_Fragment_Button_onClick_XvXtXTjQY2A',
          phase: 'csr',
          duration: 0,
          start: 20,
          end: 20,
          renderCount: 1,
        },
      ],
    };

    const result = groupCsrBySsr(data);

    const buttonList = result.get(ssrButton);
    const routesList = result.get(ssrRoutes);

    expect(buttonList).toBeDefined();
    expect(routesList).toBeDefined();

    expect(buttonList!.map((x) => x.id)).toEqual([15, 16]);
    expect(buttonList![0].componentName).toBe('Button');
    expect(buttonList![0].eventName).toBe('useComputed');
    expect(buttonList![1].componentName).toBe('Button');
    expect(buttonList![1].eventName).toBeUndefined();

    expect(routesList!.map((x) => x.id)).toEqual([11]);
    expect(routesList![0].componentName).toBe('routes');
    expect(routesList![0].eventName).toBe('onClick');
  });

  it('drops unmatched CSR but still initializes SSR keys with empty arrays', () => {
    const ssrOnly = {
      id: 1,
      component: 'Only_component_hash',
      phase: 'ssr' as const,
      duration: 0.01,
      start: 1,
      end: 1.01,
      ssrCount: 1,
    };

    const data: QwikPerfStoreRemembered = {
      ssr: [ssrOnly],
      csr: [
        {
          id: 999,
          component: 'NoMatch_component_xxx',
          phase: 'csr',
          duration: 0,
          start: 0,
          end: 0,
          renderCount: 1,
        },
      ],
    };

    const result = groupCsrBySsr(data);
    expect(result.get(ssrOnly)).toEqual([]);
  });
});
