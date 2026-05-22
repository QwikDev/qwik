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
    <main class="page">
      <a class="gallery-link" href="http://127.0.0.1:4300/">
        Example gallery
      </a>
      <section class="intro">
        <p class="eyebrow">Multi-Tenant Dashboard</p>
        <h1>Private cache keys for operational widgets</h1>
        <p>
          Dashboard cards are private by default and vary by tenant context. The same server
          resources can feed SSR, qcomponent partials, and client RPC without exposing policy.
        </p>
        <button
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

      <section class="kpis">
        <RevenueCard {...input} />
        <CustomerCard {...input} />
        <RevenueCard {...input} />
      </section>
      <AlertPanel {...input} />
      <style>{styles}</style>
    </main>
  );
});

export const head: DocumentHead = {
  title: 'Qwik Dashboard Cache Registry Example',
};

const styles = `
  body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #f7f7fb; color: #202939; }
  .page { width: min(1120px, calc(100% - 36px)); margin: 0 auto; padding: 40px 0; }
  .gallery-link { display: inline-flex; margin-bottom: 14px; color: #202939; font-weight: 800; text-decoration: none; }
  .intro, .card, .panel { border: 1px solid #d8dee9; background: white; border-radius: 8px; box-shadow: 0 10px 24px rgba(15, 23, 42, .05); }
  .intro { padding: 24px; margin-bottom: 16px; }
  .eyebrow { margin: 0 0 8px; color: #2c7a7b; font-size: .78rem; font-weight: 800; text-transform: uppercase; }
  h1 { margin: 0; font-size: clamp(2rem, 4vw, 3.5rem); letter-spacing: 0; }
  .intro p { color: #52606d; max-width: 760px; line-height: 1.6; }
  button { border: 0; border-radius: 6px; background: #202939; color: white; padding: 10px 14px; font-weight: 700; margin-right: 12px; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-bottom: 14px; }
  .card { min-height: 150px; padding: 18px; }
  .card span { color: #52606d; font-weight: 700; }
  .card strong { display: block; font-size: 2rem; margin: 16px 0; }
  .card small { color: #627d98; }
  .panel { padding: 20px; }
  .panel-head { display: flex; justify-content: space-between; gap: 12px; color: #627d98; }
  .panel h2 { margin: 0; color: #202939; }
  .panel li { margin: 8px 0; }
  .muted { color: #627d98; background: #f8fafc; }
`;
