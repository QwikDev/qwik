import { component$, useSignal } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import { getProduct } from './catalog.server';
import { ProductCard } from './product-card';
import { RecommendationRail } from './recommendation-rail';

const runId = `commerce-${Date.now()}`;

export default component$(() => {
  const rpcResult = useSignal('not run');
  const ids = ['keyboard', 'mouse', 'keyboard', 'dock', 'lamp', 'dock'];

  return (
    <main class="page">
      <a class="gallery-link" href="http://127.0.0.1:4300/">
        Example gallery
      </a>
      <section class="intro">
        <p class="eyebrow">Commerce Storefront</p>
        <h1>Segmented product data with cacheable cards</h1>
        <p>
          This page repeats products on purpose. The duplicated cards should share server resource
          work while registered card HTML can vary by shopper segment.
        </p>
        <button
          onClick$={async () => {
            const input = { productId: 'keyboard', runId: `${runId}-client` };
            const first = await getProduct(input);
            const second = await getProduct(input);
            rpcResult.value = `client server$ reads: ${first.reads}/${second.reads}`;
          }}
        >
          Run cached client server$
        </button>
        <span>{rpcResult.value}</span>
      </section>

      <section class="section-heading">
        <h2>Product grid</h2>
        <span>duplicate inputs included</span>
      </section>
      <section class="grid">
        {ids.map((productId, index) => (
          <ProductCard key={`${productId}-${index}`} productId={productId} runId={runId} />
        ))}
      </section>

      <RecommendationRail productId="keyboard" runId={runId} />
      <style>{styles}</style>
    </main>
  );
});

export const head: DocumentHead = {
  title: 'Qwik Commerce Cache Registry Example',
};

const styles = `
  body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #f5f7fb; color: #1f2933; }
  .page { width: min(1180px, calc(100% - 36px)); margin: 0 auto; padding: 40px 0; }
  .gallery-link { display: inline-flex; margin-bottom: 14px; color: #1f2933; font-weight: 800; text-decoration: none; }
  .intro { border: 1px solid #d9e2ec; border-radius: 8px; padding: 24px; background: white; margin-bottom: 18px; }
  .eyebrow { margin: 0 0 8px; color: #2f855a; font-weight: 800; text-transform: uppercase; font-size: .78rem; }
  h1 { margin: 0; font-size: clamp(2rem, 4vw, 3.5rem); letter-spacing: 0; }
  .intro p { max-width: 760px; color: #52606d; line-height: 1.6; }
  button { border: 0; border-radius: 6px; background: #1f2933; color: white; padding: 10px 14px; font-weight: 700; margin-right: 12px; }
  .section-heading { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin: 22px 0 12px; color: #52606d; }
  .section-heading h2 { margin: 0; color: #1f2933; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
  .grid.compact { grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
  .card, .rail { border: 1px solid #d9e2ec; border-radius: 8px; background: white; padding: 18px; min-height: 190px; box-shadow: 0 10px 26px rgba(15, 23, 42, .05); }
  .card h2 { margin: 14px 0 8px; font-size: 1.1rem; }
  .card p { color: #52606d; line-height: 1.5; }
  .card strong { display: block; font-size: 1.35rem; margin: 12px 0; }
  .card small { display: block; color: #627d98; }
  .pill { display: inline-block; margin-right: 6px; border-radius: 999px; padding: 4px 8px; background: #e6fffa; color: #234e52; font-size: .75rem; font-weight: 700; }
  .muted { color: #627d98; background: #f8fafc; }
`;
