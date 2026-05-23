import { component$, useSignal } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import { AlertPanel } from './alert-panel';
import { getRevenue, type TenantInput } from './dashboard.server';
import { CustomerCard, RevenueCard } from './kpi-card';

export default component$(() => {
  const rpcResult = useSignal('not run');
  const input: TenantInput = {
    tenantId: 'acme',
    range: '30d',
  };

  return (
    <main class="mx-auto max-w-[1120px] px-[18px] py-10 text-slate-900">
      <a
        class="mb-3.5 inline-flex font-extrabold text-slate-900 no-underline"
        href="http://127.0.0.1:4300/"
      >
        Example gallery
      </a>
      <section class="mb-4 rounded-lg border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5">
        <p class="mb-2 text-xs font-extrabold uppercase tracking-wide text-teal-700">
          Multi-Tenant Dashboard
        </p>
        <h1 class="m-0 text-4xl font-black tracking-normal md:text-5xl">
          Private cache keys for operational widgets
        </h1>
        <p class="max-w-3xl leading-7 text-slate-600">
          Dashboard cards are private by default and vary by tenant context. The same server
          resources can feed SSR, qcomponent partials, and client RPC without exposing policy.
        </p>
        <button
          class="mr-3 rounded-md bg-slate-800 px-3.5 py-2.5 font-bold text-white"
          onClick$={async () => {
            const first = await getRevenue(input);
            const second = await getRevenue(input);
            rpcResult.value = `client revenue reads: ${first.reads}/${second.reads}`;
          }}
        >
          Run tenant RPC twice
        </button>
        <span>{rpcResult.value}</span>
      </section>

      <section class="mb-3.5 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
        <RevenueCard {...input} />
        <CustomerCard {...input} />
        <RevenueCard {...input} />
      </section>
      <AlertPanel {...input} />
    </main>
  );
});

export const head: DocumentHead = {
  title: 'Qwik Dashboard Cache Registry Example',
};
