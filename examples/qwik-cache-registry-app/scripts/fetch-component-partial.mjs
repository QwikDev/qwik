#!/usr/bin/env node

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4174/';
const productId = process.argv[3] ?? 'keyboard';
const endpoint = new URL(baseUrl);
endpoint.searchParams.set('qcomponent', 'ProductCard');

for (let index = 1; index <= 2; index++) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-QCOMPONENT': 'ProductCard',
    },
    body: JSON.stringify({
      props: {
        productId,
      },
    }),
  });
  const html = await response.text();

  console.log(
    [
      `request=${index}`,
      `status=${response.status}`,
      `componentCache=${response.headers.get('x-qwik-component-cache')}`,
      `hasProduct=${html.includes('Mechanical Keyboard') || html.includes('Wireless Mouse')}`,
      `bytes=${html.length}`,
    ].join(' ')
  );
}
