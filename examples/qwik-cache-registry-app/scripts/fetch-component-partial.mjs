#!/usr/bin/env node

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4174/';
const productId = process.argv[3] ?? 'keyboard';
const shouldVary = process.argv.includes('--vary');
const endpoint = new URL(baseUrl);
endpoint.searchParams.set('qcomponent', 'ProductCard');

const requests = shouldVary
  ? [
      { plan: 'free', expectedCache: 'miss' },
      { plan: 'free', expectedCache: 'hit' },
      { plan: 'pro', expectedCache: 'miss' },
      { plan: 'pro', expectedCache: 'hit' },
    ]
  : [
      { plan: 'free', expectedCache: 'miss' },
      { plan: 'free', expectedCache: 'hit' },
    ];

for (let index = 0; index < requests.length; index++) {
  const request = requests[index];
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `plan=${request.plan}`,
      'X-QCOMPONENT': 'ProductCard',
    },
    body: JSON.stringify({
      props: {
        productId,
      },
    }),
  });
  const html = await response.text();
  const componentCache = response.headers.get('x-qwik-component-cache');

  console.log(
    [
      `request=${index + 1}`,
      `plan=${request.plan}`,
      `status=${response.status}`,
      `componentCache=${componentCache}`,
      `expectedCache=${request.expectedCache}`,
      `hasProduct=${html.includes('Mechanical Keyboard') || html.includes('Wireless Mouse')}`,
      `hasSegment=${html.includes(`segment: ${request.plan}`)}`,
      `bytes=${html.length}`,
    ].join(' ')
  );

  if (componentCache !== request.expectedCache || !html.includes(`segment: ${request.plan}`)) {
    process.exitCode = 1;
  }
}
