import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';

type Demo = {
  title: string;
  port: number;
  stage: string;
  description: string;
  proves: string[];
};

const demos: Demo[] = [
  {
    title: 'Commerce Storefront',
    port: 4311,
    stage: 'Big example',
    description:
      'Product grid with repeated products, shopper segments, pricing, inventory, recommendations, server$ RPC, and registered ProductCard partials.',
    proves: [
      'server$ result dedupe',
      'component HTML varies by shopper segment',
      'data-plus-render-symbol shape',
    ],
  },
  {
    title: 'Multi-Tenant Dashboard',
    port: 4312,
    stage: 'Big example',
    description:
      'Private tenant dashboard with revenue, customers, alerts, and policy-sensitive component boundaries.',
    proves: ['private vary keys', 'tenant scoped resources', 'mixed dashboard widgets'],
  },
  {
    title: 'Partial Router Shell',
    port: 4313,
    stage: 'Big example',
    description:
      'SPA-like shell that swaps standalone qcomponent partials and can request either HTML or data-plus-render-symbol payloads.',
    proves: ['standalone partial navigation', 'HTML vs data payloads', 'resume boundary clarity'],
  },
  {
    title: 'Cache Torture Lab',
    port: 4314,
    stage: 'Stress example',
    description:
      'Dense grid of repeated async component edges, nested Suspense, signals, and intentionally mixed cacheable and normal SSR work.',
    proves: ['fan-out pressure', 'request dedupe pressure', 'signal metadata in cached components'],
  },
  {
    title: 'Component Host Prototype',
    port: 4315,
    stage: 'Future-facing example',
    description:
      'Host-style page that fetches registered component partials as standalone Qwik containers and data envelopes.',
    proves: ['fetchable component registry', 'local data preview', 'trusted component host shape'],
  },
  {
    title: 'Small Cache Registry App',
    port: 4321,
    stage: 'Existing prototype',
    description:
      'Small original product-card cache-registry demo kept as the simplest example of the model.',
    proves: ['minimal direct useAsync$(serverFn, props)', 'component cache basics'],
  },
  {
    title: 'QComponent Partials App',
    port: 4322,
    stage: 'Existing prototype',
    description: 'Focused qcomponent partial payload playground with scriptable fetch helpers.',
    proves: ['qcomponent endpoint', 'partial envelope metadata'],
  },
  {
    title: 'Partial Navigation App',
    port: 4323,
    stage: 'Existing prototype',
    description:
      'Earlier partial-navigation playground used to validate HTML and data payload modes.',
    proves: ['partial navigation sketch', 'standalone qcomponent container merge limits'],
  },
];

export default component$(() => {
  return (
    <main class="gallery">
      <section class="intro">
        <p class="eyebrow">Qwik v2 cache-registry prototype</p>
        <h1>Example gallery</h1>
        <p>
          Each card opens a running local example. The big examples are intentionally shaped like
          real product surfaces so the cache registry has to handle SSR, server resources,
          qcomponent partials, request vary rules, and resumability metadata together.
        </p>
      </section>

      <section class="grid" aria-label="Cache registry examples">
        {demos.map((demo) => (
          <article class="card" key={demo.title}>
            <div class="card-top">
              <span>{demo.stage}</span>
              <code>:{demo.port}</code>
            </div>
            <h2>{demo.title}</h2>
            <p>{demo.description}</p>
            <ul>
              {demo.proves.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <a href={`http://127.0.0.1:${demo.port}/`}>View demo</a>
          </article>
        ))}
      </section>

      <style>{styles}</style>
    </main>
  );
});

export const head: DocumentHead = {
  title: 'Qwik Cache Examples Gallery',
};

const styles = `
  body {
    margin: 0;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #17202a;
    background: #f6f8fb;
  }
  .gallery {
    width: min(1180px, calc(100% - 40px));
    margin: 0 auto;
    padding: 48px 0;
  }
  .intro {
    max-width: 780px;
    margin-bottom: 28px;
  }
  .eyebrow {
    margin: 0 0 10px;
    color: #276749;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.78rem;
  }
  h1 {
    margin: 0;
    font-size: clamp(2rem, 5vw, 4.25rem);
    line-height: 1;
    letter-spacing: 0;
  }
  .intro p:last-child {
    color: #4a5568;
    font-size: 1.08rem;
    line-height: 1.7;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 16px;
  }
  .card {
    min-height: 320px;
    border: 1px solid #d9e2ec;
    border-radius: 8px;
    background: #fff;
    padding: 20px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
  }
  .card-top {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    color: #52606d;
    font-size: 0.82rem;
  }
  .card h2 {
    margin: 20px 0 8px;
    font-size: 1.2rem;
  }
  .card p {
    margin: 0;
    color: #52606d;
    line-height: 1.55;
  }
  .card ul {
    margin: 18px 0 22px;
    padding-left: 18px;
    color: #334e68;
  }
  .card li + li {
    margin-top: 6px;
  }
  .card a {
    margin-top: auto;
    display: inline-flex;
    justify-content: center;
    border-radius: 6px;
    background: #1f2933;
    color: white;
    text-decoration: none;
    padding: 10px 14px;
    font-weight: 700;
  }
`;
