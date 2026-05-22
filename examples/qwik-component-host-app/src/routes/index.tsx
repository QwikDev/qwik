import { component$, useSignal } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import { LocalProductPreview, RemoteProductTile } from './remote-tile';

type RemotePayload = 'html' | 'data';

async function requestRemoteTile(payload: RemotePayload, href: string) {
  const url = new URL(href);
  url.search = '';
  url.searchParams.set('qcomponent', 'RemoteProductTile');
  if (payload === 'data') {
    url.searchParams.set('qcomponent-payload', 'data');
  }

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-QCOMPONENT': 'RemoteProductTile',
      'x-component-origin': 'trusted-team-a',
    },
    body: JSON.stringify({
      props: {
        productId: 'dock',
        source: 'external-team',
      },
    }),
  });
  const text = await response.text();

  return {
    status: `${payload} payload -> ${response.status} (${response.headers.get('x-qwik-component-cache') ?? 'no-cache-header'})`,
    html: payload === 'html' ? text : '',
    data: payload === 'data' ? JSON.stringify(JSON.parse(text), null, 2) : '',
  };
}

export default component$(() => {
  const html = useSignal('');
  const data = useSignal('');
  const status = useSignal('No remote component fetched yet.');

  return (
    <main class="page">
      <a class="gallery-link" href="http://127.0.0.1:4300/">
        Example gallery
      </a>
      <section class="intro">
        <p class="eyebrow">Component Host Prototype</p>
        <h1>Fetch registered components like server resources</h1>
        <p>
          This assumes a trusted component origin and compatible Qwik versions. It is intentionally
          framed as standalone partial transport, not raw subtree merge.
        </p>
        <button
          onClick$={async () => {
            const result = await requestRemoteTile('html', location.href);
            status.value = result.status;
            html.value = result.html;
            data.value = result.data;
          }}
        >
          Fetch HTML partial
        </button>
        <button
          onClick$={async () => {
            const result = await requestRemoteTile('data', location.href);
            status.value = result.status;
            html.value = result.html;
            data.value = result.data;
          }}
        >
          Fetch data envelope
        </button>
        <span>{status.value}</span>
      </section>

      <section class="grid">
        <div>
          <h2>Normal SSR source component</h2>
          <RemoteProductTile productId="keyboard" source="host" />
        </div>
        <div>
          <h2>Host local data render</h2>
          <LocalProductPreview title="Local Keyboard Tile" source="host-cache" />
        </div>
        <div>
          <h2>Fetched standalone output</h2>
          {html.value ? <div class="partial-outlet" dangerouslySetInnerHTML={html.value} /> : null}
          {data.value ? <pre>{data.value}</pre> : null}
        </div>
      </section>
      <style>{styles}</style>
    </main>
  );
});

export const head: DocumentHead = {
  title: 'Qwik Component Host Example',
};

const styles = `
  body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #f5f7fb; color: #1f2933; }
  .page { width: min(1180px, calc(100% - 36px)); margin: 0 auto; padding: 40px 0; }
  .gallery-link { display: inline-flex; margin-bottom: 14px; color: #1f2933; font-weight: 800; text-decoration: none; }
  .intro, .grid > div, .tile, pre { border: 1px solid #d9e2ec; background: white; border-radius: 8px; box-shadow: 0 10px 24px rgba(15, 23, 42, .05); }
  .intro { padding: 24px; margin-bottom: 14px; }
  .eyebrow { margin: 0 0 8px; color: #2b6cb0; font-weight: 800; text-transform: uppercase; font-size: .78rem; }
  h1 { margin: 0; font-size: clamp(2rem, 4vw, 3.5rem); letter-spacing: 0; }
  .intro p { color: #52606d; max-width: 780px; line-height: 1.6; }
  button { border: 0; border-radius: 6px; background: #1f2933; color: white; padding: 10px 14px; font-weight: 700; margin-right: 10px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; }
  .grid > div { padding: 18px; min-height: 300px; overflow: auto; }
  .tile { padding: 18px; }
  .tile span { color: #627d98; font-weight: 700; }
  .tile h2 { margin: 12px 0 8px; }
  .local { background: #f0fff4; }
  .partial-outlet { border: 1px dashed #bcccdc; border-radius: 8px; overflow: auto; max-height: 360px; }
  pre { white-space: pre-wrap; overflow: auto; max-height: 420px; padding: 16px; font-size: .82rem; }
  .muted { color: #627d98; background: #f8fafc; }
`;
