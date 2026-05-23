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
    <main class="mx-auto max-w-[1180px] px-[18px] py-10 text-slate-900">
      <a
        class="mb-3.5 inline-flex font-extrabold text-slate-900 no-underline"
        href="http://127.0.0.1:4300/"
      >
        Example gallery
      </a>
      <section class="mb-3.5 rounded-lg border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5">
        <p class="mb-2 text-xs font-extrabold uppercase tracking-wide text-purple-700">
          Partial Router Shell
        </p>
        <h1 class="m-0 text-4xl font-black tracking-normal md:text-5xl">
          Navigate with standalone qcomponent payloads
        </h1>
        <p class="max-w-3xl leading-7 text-slate-600">
          This shell keeps the initial page as normal Qwik SSR, then fetches standalone component
          partials to model future MPA/SPA navigation choices.
        </p>
      </section>

      <section class="mb-3 flex flex-wrap gap-2.5">
        <button
          class="rounded-md bg-slate-800 px-3.5 py-2.5 font-bold text-white"
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
          class="rounded-md bg-slate-800 px-3.5 py-2.5 font-bold text-white"
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
          class="rounded-md bg-slate-800 px-3.5 py-2.5 font-bold text-white"
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

      <p class="text-slate-600">{status.value}</p>
      <section class="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-3.5">
        <div class="min-h-80 rounded-lg border border-slate-200 bg-white p-[18px] shadow-xl shadow-slate-900/5">
          <h2 class="mb-4 text-2xl font-black">Initial SSR boundary</h2>
          <ProductPagePartial slug="keyboard" runId={runId} />
        </div>
        <div class="min-h-80 rounded-lg border border-slate-200 bg-white p-[18px] shadow-xl shadow-slate-900/5">
          <h2 class="mb-4 text-2xl font-black">Fetched partial output</h2>
          {html.value ? (
            <div
              class="max-h-96 overflow-auto rounded-lg border border-dashed border-slate-300"
              dangerouslySetInnerHTML={html.value}
            />
          ) : null}
          {envelope.value ? (
            <pre class="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-xl shadow-slate-900/5">
              {envelope.value}
            </pre>
          ) : null}
        </div>
      </section>
    </main>
  );
});

export const head: DocumentHead = {
  title: 'Qwik Partial Router Example',
};
