import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import { NestedStressPanel, StressCard } from './stress-card';

const runId = `torture-${Date.now()}`;
const ids = ['a', 'b', 'c', 'a', 'd', 'slow', 'b', 'e', 'f', 'a', 'slow', 'c'];

export default component$(() => {
  return (
    <main class="page">
      <a class="gallery-link" href="http://127.0.0.1:4300/">
        Example gallery
      </a>
      <section class="intro">
        <p class="eyebrow">Cache Torture Lab</p>
        <h1>Repeated async edges, nested Suspense, and signals</h1>
        <p>
          This fixture is intentionally dense. It repeats inputs, mixes local signals into cacheable
          components, and keeps one normal SSR widget outside the registry.
        </p>
      </section>

      <section class="grid">
        {ids.map((id, index) => (
          <StressCard key={`${id}-${index}`} id={id} runId={runId} />
        ))}
      </section>
      <NestedStressPanel runId={runId} />
      <NormalSsrWidget />
      <style>{styles}</style>
    </main>
  );
});

const NormalSsrWidget = component$(() => {
  return (
    <section class="panel normal">
      <h2>Normal SSR fallback area</h2>
      <p>This component is not registered in cache config. It should render normally.</p>
    </section>
  );
});

export const head: DocumentHead = {
  title: 'Qwik Cache Torture Example',
};

const styles = `
  body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #f6f8fb; color: #1f2933; }
  .page { width: min(1220px, calc(100% - 36px)); margin: 0 auto; padding: 40px 0; }
  .gallery-link { display: inline-flex; margin-bottom: 14px; color: #1f2933; font-weight: 800; text-decoration: none; }
  .intro, .card, .panel { border: 1px solid #d9e2ec; border-radius: 8px; background: white; box-shadow: 0 10px 24px rgba(15, 23, 42, .05); }
  .intro { padding: 24px; margin-bottom: 14px; }
  .eyebrow { margin: 0 0 8px; color: #b7791f; font-weight: 800; text-transform: uppercase; font-size: .78rem; }
  h1 { margin: 0; font-size: clamp(2rem, 4vw, 3.5rem); letter-spacing: 0; }
  .intro p { color: #52606d; max-width: 780px; line-height: 1.6; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin-bottom: 14px; }
  .grid.small { grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
  .card { padding: 16px; min-height: 170px; }
  .card-top { display: flex; align-items: center; justify-content: space-between; color: #627d98; font-weight: 700; }
  .card h2 { margin: 16px 0 8px; }
  .card p { margin: 7px 0; color: #52606d; }
  button { border: 1px solid #bcccdc; background: #fff; border-radius: 6px; padding: 6px 8px; }
  .panel { padding: 18px; margin-bottom: 14px; }
  .muted { color: #627d98; background: #f8fafc; }
  .normal { border-style: dashed; }
`;
