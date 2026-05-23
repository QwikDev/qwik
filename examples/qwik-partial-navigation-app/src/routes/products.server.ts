import { server$ } from '@qwik.dev/router';

type ProductInput = {
  productId: string;
  runId?: string;
  delayMs?: number;
};

const readsByProduct = new Map<string, number>();

export const getSegment = server$(async function () {
  return {
    plan: 'pro',
  };
});

export const getProduct = server$(async function ({
  productId,
  runId = 'partial-nav',
  delayMs = 75,
}: ProductInput) {
  await delay(delayMs);

  const readKey = `${runId}:${productId}`;
  const reads = (readsByProduct.get(readKey) ?? 0) + 1;
  readsByProduct.set(readKey, reads);

  return {
    id: productId,
    title: productId === 'keyboard' ? 'Mechanical Keyboard' : 'Wireless Mouse',
    description: `Partial navigation data for ${productId}.`,
    price: productId === 'keyboard' ? '$179' : '$99',
    reads,
  };
});

export const getPricing = server$(async function ({ productId, delayMs = 25 }: ProductInput) {
  const segment = await getSegment();
  await delay(delayMs);

  return {
    productId,
    price: segment.plan === 'pro' ? '$179' : '$199',
  };
});

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
