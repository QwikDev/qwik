import { component$ } from '@qwik.dev/core';
import type { PerfOverviewVm } from '../computePerfViewModel';
import { formatMs } from '../utils/formatMs';
import { StatCard } from './StatCard';

interface PerformanceOverviewProps {
  overview: PerfOverviewVm;
}

export const PerformanceOverview = component$<PerformanceOverviewProps>(
  ({ overview }) => {
    const slowestComponent = overview.slowestComponent;

    return (
      <div class="grid grid-cols-1 gap-5 md:grid-cols-4">
        <StatCard
          label="TOTAL RENDER TIME"
          value={formatMs(overview.totalRenderTime)}
        />
        <StatCard
          label="SLOWEST COMPONENT"
          value={slowestComponent?.componentName || '-'}
          subtitle={
            slowestComponent ? `${formatMs(slowestComponent.avgTime)} avg` : '-'
          }
        />
        <StatCard label="AVG TIME" value={formatMs(overview.avgTime)} />
        <StatCard label="TOTAL CALLS" value={String(overview.totalCalls)} />
      </div>
    );
  },
);
