import { component$, type ReadonlySignal, type Signal } from '@qwik.dev/core';

type Report = { id: number; total: ReadonlySignal<number> };

export const ReportButton = component$<{
  report: Report;
  loading: Signal<boolean>;
  request: Signal<number>;
}>(({ report, loading, request }) => (
  <button
    data-testid="trigger-with-report"
    onClick$={() => {
      loading.value = true;
      request.value = report.id;
    }}
  >
    Start the report
  </button>
));
