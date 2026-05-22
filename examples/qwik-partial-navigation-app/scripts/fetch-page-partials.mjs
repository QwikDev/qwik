#!/usr/bin/env node

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4176/';

for (const productId of ['keyboard', 'mouse']) {
  for (let index = 1; index <= 2; index++) {
    const response = await fetchPagePartial(baseUrl, productId, 'html');
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

const dataResponse = await fetchPagePartial(baseUrl, 'keyboard', 'data');
const dataPayload = await dataResponse.json();
console.log(
  [
    `mode=${dataPayload.mode}`,
    `status=${dataResponse.status}`,
    `renderSymbol=${dataPayload.render?.registry?.symbol ?? 'none'}`,
    `dataResources=${dataPayload.data?.resources?.length ?? 0}`,
    `hasValue=${Boolean(dataPayload.data?.resources?.some((resource) => 'value' in resource))}`,
    `hasHtml=${'html' in dataPayload}`,
  ].join(' ')
);

async function fetchPagePartial(url, productId, payload) {
  const endpoint = new URL(url);
  endpoint.searchParams.set('qcomponent', 'ProductPagePartial');
  if (payload === 'data') {
    endpoint.searchParams.set('qcomponent-payload', 'data');
  }

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
