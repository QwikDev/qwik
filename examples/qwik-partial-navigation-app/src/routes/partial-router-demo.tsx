import { $, component$, useSignal } from '@qwik.dev/core';

export const PartialRouterDemo = component$(() => {
  const html = useSignal('<p>Select a product partial.</p>');
  const status = useSignal('idle');

  const navigate = $(async (productId: string) => {
    status.value = `loading ${productId}`;

    const endpoint = new URL(window.location.href);
    endpoint.searchParams.set('qcomponent', 'ProductPagePartial');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'X-QCOMPONENT': 'ProductPagePartial',
      },
      body: JSON.stringify({
        props: {
          productId,
        },
      }),
    });

    const payload = (await response.json()) as {
      html: string;
      cache: { status: string };
      resources: { status: string }[];
    };

    html.value = payload.html;
    status.value = `${productId}: ${payload.cache.status}, resources=${payload.resources.length}`;
    history.pushState({ productId }, '', `#${productId}`);
  });

  return (
    <section class="rounded-lg border border-slate-200 bg-white p-[18px] shadow-xl shadow-slate-900/5">
      <nav class="flex flex-wrap gap-2.5" aria-label="Product partial navigation">
        <button
          class="rounded-md bg-slate-800 px-3.5 py-2.5 font-bold text-white"
          type="button"
          onClick$={() => navigate('keyboard')}
        >
          Keyboard
        </button>
        <button
          class="rounded-md bg-slate-800 px-3.5 py-2.5 font-bold text-white"
          type="button"
          onClick$={() => navigate('mouse')}
        >
          Mouse
        </button>
      </nav>
      <p class="text-slate-600" aria-live="polite">
        {status.value}
      </p>
      <div
        class="rounded-lg border border-dashed border-slate-300 p-4"
        data-partial-outlet
        dangerouslySetInnerHTML={html.value}
      />
    </section>
  );
});
