import { server$ } from '@qwik.dev/router';

type ProductInput = {
  productId: string;
};

const readsByProduct = new Map<string, number>();

export const getSegment = server$(async function () {
  return {
    plan: 'pro',
  };
});

export const getProduct = server$(async function ({ productId }: ProductInput) {
  await delay(75);

  const reads = (readsByProduct.get(productId) ?? 0) + 1;
  readsByProduct.set(productId, reads);

  return {
    id: productId,
    title: productId === 'keyboard' ? 'Mechanical Keyboard' : 'Wireless Mouse',
    description: `Partial navigation data for ${productId}.`,
    price: productId === 'keyboard' ? '$179' : '$99',
    reads,
  };
});

export const getPricing = server$(async function ({ productId }: ProductInput) {
  const segment = await getSegment();
  await delay(25);

  return {
    productId,
    price: segment.plan === 'pro' ? '$179' : '$199',
  };
});

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
