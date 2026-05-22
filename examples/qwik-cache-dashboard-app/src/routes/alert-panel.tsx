import { component$, Suspense, useAsync$ } from '@qwik.dev/core';
import { getAlerts, getAuditSummary, type TenantInput } from './dashboard.server';

export const AlertPanel = component$((props: TenantInput) => {
  const alerts = useAsync$(getAlerts, props);
  const audit = useAsync$(getAuditSummary, props);

  return (
    <Suspense fallback={<section class="panel muted">Loading alerts...</section>}>
      <section class="panel">
        <div class="panel-head">
          <h2>Tenant operations</h2>
          <span>{audit.value.visibleEvents} audit events visible</span>
        </div>
        <ul>
          {alerts.value.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </Suspense>
  );
});
