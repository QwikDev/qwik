#!/usr/bin/env node

import { performance } from 'node:perf_hooks';

const args = parseArgs(process.argv.slice(2));
const cacheLevel = args.cache ?? 'request';
const delayMs = Number(args.delay ?? 80);
const repeat = Number(args.repeat ?? 2);
const ids = String(args.ids ?? '1,2,1,3')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);
const unsafe = String(args.unsafe ?? 'false') === 'true';

if (!['off', 'request', 'memory'].includes(cacheLevel)) {
  throw new Error(`Unknown --cache value "${cacheLevel}". Use off, request, or memory.`);
}

const metrics = {
  serverCalls: 0,
  serverRequestHits: 0,
  serverMemoryHits: 0,
  serverMisses: 0,
  componentHtmlHits: 0,
  componentHtmlMisses: 0,
  componentFallbacks: 0,
  componentRenders: 0,
};

const stores = {
  serverMemory: new Map(),
  componentHtmlMemory: new Map(),
};

const serverRegistry = {
  getProduct: async ({ productId }) => {
    metrics.serverCalls++;
    await delay(delayMs);
    return {
      title: `Keyboard ${productId}`,
      price: `$${199 + Number(productId || 0)}`,
    };
  },
};

const componentRegistry = {
  ProductCard: {
    safe: !unsafe,
    server: [{ name: 'product', resource: 'getProduct', input: ({ props }) => props }],
    render({ props, server }) {
      metrics.componentRenders++;
      return [
        `<article data-product-id="${escapeAttr(props.productId)}" class="product-card">`,
        `<h2>${escapeHtml(server.product.title)}</h2>`,
        `<p>${escapeHtml(server.product.price)}</p>`,
        `</article>`,
      ].join('');
    },
  },
};

const run = async () => {
  const started = performance.now();
  const requests = [];
  for (let index = 1; index <= repeat; index++) {
    requests.push(await renderRequest(index));
  }
  const durationMs = Math.round(performance.now() - started);

  console.log(`cache=${cacheLevel} delay=${delayMs}ms repeat=${repeat} ids=${ids.join(',')}`);
  console.log(`unsafe=${unsafe}`);
  for (const request of requests) {
    console.log(
      `request ${request.index}: ${request.durationMs}ms, htmlBytes=${request.html.length}, serverCalls=${request.serverCalls}`
    );
  }
  console.log(JSON.stringify({ durationMs, metrics }, null, 2));
};

const renderRequest = async (index) => {
  const requestStarted = performance.now();
  const request = {
    resourceCache: new Map(),
  };
  const serverCallsBefore = metrics.serverCalls;

  const cards = await Promise.all(
    ids.map((productId) =>
      renderComponent(request, 'ProductCard', {
        productId,
      })
    )
  );
  const html = `<main>${cards.join('')}</main>`;

  return {
    index,
    html,
    durationMs: Math.round(performance.now() - requestStarted),
    serverCalls: metrics.serverCalls - serverCallsBefore,
  };
};

const renderComponent = async (request, componentId, props) => {
  const component = componentRegistry[componentId];
  if (!component) {
    throw new Error(`Unknown component "${componentId}"`);
  }

  const htmlKey = stableKey(['component-html', componentId, props]);
  const canUseComponentHtmlCache = cacheLevel === 'memory' && component.safe;
  if (canUseComponentHtmlCache && stores.componentHtmlMemory.has(htmlKey)) {
    metrics.componentHtmlHits++;
    return stores.componentHtmlMemory.get(htmlKey);
  }

  if (!component.safe) {
    metrics.componentFallbacks++;
  } else {
    metrics.componentHtmlMisses++;
  }

  const server = {};
  await Promise.all(
    component.server.map(async (edge) => {
      server[edge.name] = await runServerResource(request, edge.resource, edge.input({ props }));
    })
  );

  const html = component.render({ props, server });
  if (canUseComponentHtmlCache) {
    stores.componentHtmlMemory.set(htmlKey, html);
  }
  return html;
};

const runServerResource = async (request, resourceId, input) => {
  const key = stableKey(['server', resourceId, input]);

  if (cacheLevel !== 'off' && request.resourceCache.has(key)) {
    metrics.serverRequestHits++;
    return request.resourceCache.get(key);
  }

  if (cacheLevel === 'memory' && stores.serverMemory.has(key)) {
    metrics.serverMemoryHits++;
    const value = stores.serverMemory.get(key);
    request.resourceCache.set(key, value);
    return value;
  }

  metrics.serverMisses++;
  const promise = serverRegistry[resourceId](input);
  if (cacheLevel !== 'off') {
    request.resourceCache.set(key, promise);
  }
  const value = await promise;
  if (cacheLevel !== 'off') {
    request.resourceCache.set(key, value);
  }
  if (cacheLevel === 'memory') {
    stores.serverMemory.set(key, value);
  }
  return value;
};

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match) {
      parsed[match[1]] = match[2];
    }
  }
  return parsed;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stableKey(value) {
  return stableSerialize(value, new Set());
}

function stableSerialize(value, seen) {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'number') {
    if (Object.is(value, -0)) {
      return '{"$number":"-0"}';
    }
    if (!Number.isFinite(value)) {
      return `{"$number":${JSON.stringify(String(value))}}`;
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'undefined') {
    return '{"$undefined":true}';
  }
  if (typeof value !== 'object') {
    throw new Error('Cannot create a stable key for this value.');
  }
  if (seen.has(value)) {
    throw new Error('Cannot create a stable key for circular input.');
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => stableSerialize(item, seen)).join(',')}]`;
    }
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item, seen)}`)
      .join(',')}}`;
  } finally {
    seen.delete(value);
  }
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', '&quot;');
}

await run();
