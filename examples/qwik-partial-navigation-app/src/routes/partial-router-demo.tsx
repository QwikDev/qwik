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
    <section>
      <nav aria-label="Product partial navigation">
        <button type="button" onClick$={() => navigate('keyboard')}>
          Keyboard
        </button>
        <button type="button" onClick$={() => navigate('mouse')}>
          Mouse
        </button>
      </nav>
      <p aria-live="polite">{status.value}</p>
      <div data-partial-outlet dangerouslySetInnerHTML={html.value} />
    </section>
  );
});
