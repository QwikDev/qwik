import { server$ } from '@qwik.dev/router';

export type ProductInput = {
  productId: string;
  runId?: string;
  delayMs?: number;
};

const productReads = new Map<string, number>();
const recommendationReads = new Map<string, number>();

const products = {
  keyboard: {
    title: 'Mechanical Keyboard',
    category: 'Input',
    basePrice: 179,
    inventory: 18,
  },
  mouse: {
    title: 'Wireless Mouse',
    category: 'Input',
    basePrice: 99,
    inventory: 42,
  },
  dock: {
    title: 'USB-C Dock',
    category: 'Desk',
    basePrice: 229,
    inventory: 11,
  },
  lamp: {
    title: 'Task Lamp',
    category: 'Desk',
    basePrice: 149,
    inventory: 6,
  },
} as const;

export const getShopperSegment = server$(async function () {
  const headerPlan = (this as any)?.request?.headers?.get('x-shopper-plan');
  const cookiePlan = (this as any)?.cookie?.get('plan')?.value;
  const plan = headerPlan === 'pro' || cookiePlan === 'pro' ? 'pro' : 'free';
  return {
    plan,
    discount: plan === 'pro' ? 0.15 : 0,
  };
});

export const getProduct = server$(async function ({
  productId,
  runId = 'commerce',
  delayMs = 35,
}: ProductInput) {
  const segment = await getShopperSegment();
  await delay(delayMs);

  const product = products[productId as keyof typeof products] ?? products.keyboard;
  const readKey = `${runId}:${productId}:${segment.plan}`;
  const reads = (productReads.get(readKey) ?? 0) + 1;
  productReads.set(readKey, reads);

  return {
    kind: 'product',
    id: productId,
    title: product.title,
    category: product.category,
    summary: `${product.title} for ${segment.plan} shoppers.`,
    reads,
    segment: segment.plan,
  };
});

export const getPrice = server$(async function ({ productId, delayMs = 20 }: ProductInput) {
  const segment = await getShopperSegment();
  await delay(delayMs);

  const product = products[productId as keyof typeof products] ?? products.keyboard;
  const price = Math.round(product.basePrice * (1 - segment.discount));
  return {
    kind: 'price',
    productId,
    price: `$${price}`,
    segment: segment.plan,
  };
});

export const getInventory = server$(async function ({ productId, delayMs = 20 }: ProductInput) {
  const segment = await getShopperSegment();
  await delay(delayMs);

  const product = products[productId as keyof typeof products] ?? products.keyboard;
  return {
    kind: 'inventory',
    productId,
    label: product.inventory > 10 ? 'In stock' : 'Low stock',
    count: product.inventory,
    scope: `${segment.plan}:${productId}`,
  };
});

export const getRecommendations = server$(async function ({
  productId,
  runId = 'commerce',
  delayMs = 45,
}: ProductInput) {
  const segment = await getShopperSegment();
  await delay(delayMs);

  const key = `${runId}:${productId}:${segment.plan}`;
  const reads = (recommendationReads.get(key) ?? 0) + 1;
  recommendationReads.set(key, reads);

  const ids = Object.keys(products).filter((id) => id !== productId);
  return {
    kind: 'recommendations',
    ids: ids.slice(0, 3),
    segment: segment.plan,
    reads,
  };
});

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
