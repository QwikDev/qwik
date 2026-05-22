import { component$, Suspense, useAsync$ } from '@qwik.dev/core';
import { getCustomers, getRevenue, type TenantInput } from './dashboard.server';

export const RevenueCard = component$((props: TenantInput) => {
  const revenue = useAsync$(getRevenue, props);

  return (
    <Suspense fallback={<article class="card muted">Loading revenue...</article>}>
      <article class="card">
        <span>Revenue</span>
        <strong>${revenue.value.amount.toLocaleString()}</strong>
        <small>
          {revenue.value.range} | reads: {revenue.value.reads}
        </small>
      </article>
    </Suspense>
  );
});

export const CustomerCard = component$((props: TenantInput) => {
  const customers = useAsync$(getCustomers, props);

  return (
    <Suspense fallback={<article class="card muted">Loading customers...</article>}>
      <article class="card">
        <span>Active customers</span>
        <strong>{customers.value.active}</strong>
        <small>
          churn risk: {customers.value.churnRisk} | reads: {customers.value.reads}
        </small>
      </article>
    </Suspense>
  );
});
