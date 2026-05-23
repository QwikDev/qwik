import { component$, useSignal } from '@qwik.dev/core';
import { type DocumentHead, useLocation } from '@qwik.dev/router';
import { DemoModePanel, readDemoMode } from '../../../qwik-cache-demo-utils/demo-mode';
import { LocalProductPreview, RemoteProductTile } from './remote-tile';

type RemotePayload = 'html' | 'data';

async function requestRemoteTile(
  payload: RemotePayload,
  href: string,
  runId: string,
  delayMs: number
) {
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
        runId,
        delayMs,
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
  const location = useLocation();
  const demo = readDemoMode(location.url, 'component-host');
  const html = useSignal('');
  const data = useSignal('');
  const status = useSignal('No remote component fetched yet.');

  return (
    <main class="mx-auto max-w-[1180px] px-[18px] py-10 text-slate-900">
      <a
        class="mb-3.5 inline-flex font-extrabold text-slate-900 no-underline"
        href="http://127.0.0.1:4300/"
      >
        Example gallery
      </a>
      <DemoModePanel demo={demo} port={4315} />
      <section class="mb-3.5 rounded-lg border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5">
        <p class="mb-2 text-xs font-extrabold uppercase tracking-wide text-blue-700">
          Component Host Prototype
        </p>
        <h1 class="m-0 text-4xl font-black tracking-normal md:text-5xl">
          Fetch registered components like server resources
        </h1>
        <p class="max-w-3xl leading-7 text-slate-600">
          This assumes a trusted component origin and compatible Qwik versions. It is intentionally
          framed as standalone partial transport, not raw subtree merge.
        </p>
        <button
          class="mr-2.5 rounded-md bg-slate-800 px-3.5 py-2.5 font-bold text-white"
          onClick$={async () => {
            const result = await requestRemoteTile(
              'html',
              location.url.href,
              demo.runId,
              demo.delayMs
            );
            status.value = result.status;
            html.value = result.html;
            data.value = result.data;
          }}
        >
          Fetch HTML partial
        </button>
        <button
          class="mr-2.5 rounded-md bg-slate-800 px-3.5 py-2.5 font-bold text-white"
          onClick$={async () => {
            const result = await requestRemoteTile(
              'data',
              location.url.href,
              demo.runId,
              demo.delayMs
            );
            status.value = result.status;
            html.value = result.html;
            data.value = result.data;
          }}
        >
          Fetch data envelope
        </button>
        <span>{status.value}</span>
      </section>

      <section class="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3.5">
        <div class="min-h-72 overflow-auto rounded-lg border border-slate-200 bg-white p-[18px] shadow-xl shadow-slate-900/5">
          <h2 class="mb-4 text-2xl font-black">Normal SSR source component</h2>
          <RemoteProductTile
            productId="keyboard"
            source="host"
            runId={demo.runId}
            delayMs={demo.delayMs}
          />
        </div>
        <div class="min-h-72 overflow-auto rounded-lg border border-slate-200 bg-white p-[18px] shadow-xl shadow-slate-900/5">
          <h2 class="mb-4 text-2xl font-black">Host local data render</h2>
          <LocalProductPreview title="Local Keyboard Tile" source="host-cache" />
        </div>
        <div class="min-h-72 overflow-auto rounded-lg border border-slate-200 bg-white p-[18px] shadow-xl shadow-slate-900/5">
          <h2 class="mb-4 text-2xl font-black">Fetched standalone output</h2>
          {html.value ? (
            <div
              class="max-h-96 overflow-auto rounded-lg border border-dashed border-slate-300"
              dangerouslySetInnerHTML={html.value}
            />
          ) : null}
          {data.value ? (
            <pre class="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-xl shadow-slate-900/5">
              {data.value}
            </pre>
          ) : null}
        </div>
      </section>
    </main>
  );
});

export const head: DocumentHead = {
  title: 'Qwik Component Host Example',
};
