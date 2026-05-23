import { component$, Suspense, useAsync$ } from '@qwik.dev/core';
import { getAlerts, getAuditSummary, type TenantInput } from './dashboard.server';

export const AlertPanel = component$((props: TenantInput) => {
  const alerts = useAsync$(getAlerts, props);
  const audit = useAsync$(getAuditSummary, props);

  return (
    <Suspense
      fallback={
        <section class="rounded-lg border border-slate-200 bg-slate-50 p-5 text-slate-500 shadow-xl shadow-slate-900/5">
          Loading alerts...
        </section>
      }
    >
      <section class="rounded-lg border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/5">
        <div class="flex justify-between gap-3 text-slate-500">
          <h2 class="m-0 text-2xl font-black text-slate-900">Tenant operations</h2>
          <span>{audit.value.visibleEvents} audit events visible</span>
        </div>
        <ul class="mt-4 list-disc space-y-2 pl-5">
          {alerts.value.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </Suspense>
  );
});
