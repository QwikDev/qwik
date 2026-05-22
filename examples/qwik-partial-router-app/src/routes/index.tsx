import { component$, useSignal } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import { ProductPagePartial } from './partials';

type PartialMode = 'html' | 'data';

const runId = `partial-router-${Date.now()}`;

async function requestPartial(componentId: string, slug: string, mode: PartialMode, href: string) {
  const url = new URL(href);
  url.search = '';
  url.searchParams.set('qcomponent', componentId);
  if (mode === 'data') {
    url.searchParams.set('qcomponent-payload', 'data');
  }

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-QCOMPONENT': componentId,
      'x-route-segment': 'pro',
    },
    body: JSON.stringify({
      props: {
        slug,
        runId,
      },
    }),
  });
  const text = await response.text();

  return {
    status: `${componentId} ${mode} -> ${response.status} (${response.headers.get('x-qwik-component-cache') ?? 'no-cache-header'})`,
    html: mode === 'html' ? text : '',
    envelope: mode === 'data' ? JSON.stringify(JSON.parse(text), null, 2) : '',
  };
}

export default component$(() => {
  const html = useSignal('');
  const envelope = useSignal('');
  const status = useSignal('SSR shell rendered. Choose a partial.');

  return (
    <main class="page">
      <a class="gallery-link" href="http://127.0.0.1:4300/">
        Example gallery
      </a>
      <section class="intro">
        <p class="eyebrow">Partial Router Shell</p>
        <h1>Navigate with standalone qcomponent payloads</h1>
        <p>
          This shell keeps the initial page as normal Qwik SSR, then fetches standalone component
          partials to model future MPA/SPA navigation choices.
        </p>
      </section>

      <section class="toolbar">
        <button
          onClick$={async () => {
            const partial = await requestPartial(
              'ProductPagePartial',
              'keyboard',
              'html',
              location.href
            );
            status.value = partial.status;
            html.value = partial.html;
            envelope.value = partial.envelope;
          }}
        >
          Product HTML
        </button>
        <button
          onClick$={async () => {
            const partial = await requestPartial(
              'AccountPagePartial',
              'workspace',
              'html',
              location.href
            );
            status.value = partial.status;
            html.value = partial.html;
            envelope.value = partial.envelope;
          }}
        >
          Account HTML
        </button>
        <button
          onClick$={async () => {
            const partial = await requestPartial(
              'SearchPagePartial',
              'desk',
              'data',
              location.href
            );
            status.value = partial.status;
            html.value = partial.html;
            envelope.value = partial.envelope;
          }}
        >
          Search data payload
        </button>
      </section>

      <p class="status">{status.value}</p>
      <section class="split">
        <div>
          <h2>Initial SSR boundary</h2>
          <ProductPagePartial slug="keyboard" runId={runId} />
        </div>
        <div>
          <h2>Fetched partial output</h2>
          {html.value ? <div class="partial-outlet" dangerouslySetInnerHTML={html.value} /> : null}
          {envelope.value ? <pre>{envelope.value}</pre> : null}
        </div>
      </section>
      <style>{styles}</style>
    </main>
  );
});

export const head: DocumentHead = {
  title: 'Qwik Partial Router Example',
};

const styles = `
  body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #f5f7fb; color: #1f2933; }
  .page { width: min(1180px, calc(100% - 36px)); margin: 0 auto; padding: 40px 0; }
  .gallery-link { display: inline-flex; margin-bottom: 14px; color: #1f2933; font-weight: 800; text-decoration: none; }
  .intro, .split > div, .partial, pre { border: 1px solid #d9e2ec; background: white; border-radius: 8px; box-shadow: 0 10px 24px rgba(15, 23, 42, .05); }
  .intro { padding: 24px; margin-bottom: 14px; }
  .eyebrow { margin: 0 0 8px; color: #805ad5; font-weight: 800; text-transform: uppercase; font-size: .78rem; }
  h1 { margin: 0; font-size: clamp(2rem, 4vw, 3.5rem); letter-spacing: 0; }
  .intro p { color: #52606d; max-width: 760px; line-height: 1.6; }
  .toolbar { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
  button { border: 0; border-radius: 6px; background: #1f2933; color: white; padding: 10px 14px; font-weight: 700; }
  .status { color: #52606d; }
  .split { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 14px; }
  .split > div { padding: 18px; min-height: 320px; }
  .partial { padding: 18px; }
  .partial span { color: #627d98; font-weight: 700; }
  .partial h2 { margin: 12px 0 8px; }
  .partial-outlet { border: 1px dashed #bcccdc; border-radius: 8px; overflow: auto; max-height: 360px; }
  pre { white-space: pre-wrap; overflow: auto; max-height: 420px; padding: 16px; font-size: .82rem; }
  .muted { color: #627d98; background: #f8fafc; }
`;
