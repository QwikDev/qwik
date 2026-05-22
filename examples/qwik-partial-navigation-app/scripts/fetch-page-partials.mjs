#!/usr/bin/env node

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4176/';

for (const productId of ['keyboard', 'mouse']) {
  for (let index = 1; index <= 2; index++) {
    const response = await fetchPagePartial(baseUrl, productId);
    const payload = await response.json();
    const expected = productId === 'keyboard' ? 'Keyboard detail' : 'Mouse detail';

    console.log(
      [
        `page=${productId}`,
        `request=${index}`,
        `status=${response.status}`,
        `componentCache=${response.headers.get('x-qwik-component-cache')}`,
        `payloadCache=${payload.cache.status}`,
        `resources=${payload.resources.length}`,
        `matched=${payload.html.includes(expected)}`,
        `bytes=${payload.html.length}`,
      ].join(' ')
    );
  }
}

async function fetchPagePartial(url, productId) {
  const endpoint = new URL(url);
  endpoint.searchParams.set('qcomponent', 'ProductPagePartial');

  return fetch(endpoint, {
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
}
