#!/usr/bin/env node

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4175/';
const productId = process.argv[3] ?? 'keyboard';

const scenarios = [
  {
    useCase: 'card',
    component: 'ProductCard',
    props: { productId },
    expects: [productId === 'mouse' ? 'Wireless Mouse' : 'Mechanical Keyboard'],
  },
  {
    useCase: 'same-card-different-props',
    component: 'ProductCard',
    props: { productId: 'mouse' },
    expects: ['Wireless Mouse'],
  },
  {
    useCase: 'price-widget',
    component: 'PricingBadge',
    props: { productId },
    expects: ['Pro price', '$179'],
  },
];

for (const scenario of scenarios) {
  for (let index = 1; index <= 2; index++) {
    const response = await fetchComponent(baseUrl, scenario.component, scenario.props);
    const html = await response.text();

    console.log(
      [
        `useCase=${scenario.useCase}`,
        `component=${scenario.component}`,
        `request=${index}`,
        `status=${response.status}`,
        `componentCache=${response.headers.get('x-qwik-component-cache')}`,
        `matched=${scenario.expects.some((expected) => html.includes(expected))}`,
        `bytes=${html.length}`,
      ].join(' ')
    );
  }
}

async function fetchComponent(url, component, props) {
  const endpoint = new URL(url);
  endpoint.searchParams.set('qcomponent', component);

  return fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-QCOMPONENT': component,
    },
    body: JSON.stringify({
      props,
    }),
  });
}
