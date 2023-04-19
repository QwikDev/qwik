import type { RequestHandler } from '@builder.io/qwik-city';

export const onGet: RequestHandler = async ({ query, json }) => {
  const a = Number.parseFloat(query.get('a') || '0');
  const b = Number.parseFloat(query.get('b') || '0');
  const delayMs = Number.parseInt(query.get('delay') || '0');
  await delay(delayMs);
  json(200, a + b);
};

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));
