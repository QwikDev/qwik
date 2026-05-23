import { component$, Suspense, useAsync$ } from '@qwik.dev/core';
import { getCustomers, getRevenue, type TenantInput } from './dashboard.server';

export const RevenueCard = component$((props: TenantInput) => {
  const revenue = useAsync$(getRevenue, props);

  return (
    <Suspense
      fallback={
        <article class="min-h-36 rounded-lg border border-slate-200 bg-slate-50 p-[18px] text-slate-500 shadow-xl shadow-slate-900/5">
          Loading revenue...
        </article>
      }
    >
      <article class="min-h-36 rounded-lg border border-slate-200 bg-white p-[18px] shadow-xl shadow-slate-900/5">
        <span class="font-bold text-slate-600">Revenue</span>
        <strong class="my-4 block text-3xl">${revenue.value.amount.toLocaleString()}</strong>
        <small class="text-slate-500">
          {revenue.value.range} | reads: {revenue.value.reads}
        </small>
      </article>
    </Suspense>
  );
});

export const CustomerCard = component$((props: TenantInput) => {
  const customers = useAsync$(getCustomers, props);

  return (
    <Suspense
      fallback={
        <article class="min-h-36 rounded-lg border border-slate-200 bg-slate-50 p-[18px] text-slate-500 shadow-xl shadow-slate-900/5">
          Loading customers...
        </article>
      }
    >
      <article class="min-h-36 rounded-lg border border-slate-200 bg-white p-[18px] shadow-xl shadow-slate-900/5">
        <span class="font-bold text-slate-600">Active customers</span>
        <strong class="my-4 block text-3xl">{customers.value.active}</strong>
        <small class="text-slate-500">
          churn risk: {customers.value.churnRisk} | reads: {customers.value.reads}
        </small>
      </article>
    </Suspense>
  );
});
