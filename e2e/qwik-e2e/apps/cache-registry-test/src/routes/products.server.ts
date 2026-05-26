import { server$ } from '@qwik.dev/router';

export interface ProductInput {
  productId: string;
  runId: string;
}

const readsByKey = new Map<string, number>();

export const getSegment = server$(async function (_input?: Partial<ProductInput>) {
  const headerPlan = (this as any)?.request?.headers?.get('x-cache-plan');
  const cookiePlan = (this as any)?.cookie?.get('plan')?.value;
  const plan = headerPlan === 'pro' || cookiePlan === 'pro' ? 'pro' : 'free';
  return {
    plan,
    runId: _input?.runId ?? 'none',
  };
});

export const getProduct = server$(async function (input: ProductInput) {
  const segment = await getSegment(input);
  await delay(5);

  const reads = nextRead(`product:${input.runId}:${input.productId}:${segment.plan}`);

  return {
    kind: 'product',
    id: input.productId,
    runId: input.runId,
    title: input.productId === 'mouse' ? 'Wireless Mouse' : 'Mechanical Keyboard',
    segment: segment.plan,
    reads,
  };
});

export const getPricing = server$(async function (input: ProductInput) {
  const segment = await getSegment(input);
  await delay(5);

  return {
    kind: 'pricing',
    id: input.productId,
    runId: input.runId,
    price: segment.plan === 'pro' ? '$159' : '$179',
    segment: segment.plan,
  };
});

export const getInventory = server$(async function (input: ProductInput) {
  const segment = await getSegment(input);
  await delay(5);

  return {
    kind: 'inventory',
    id: input.productId,
    runId: input.runId,
    scope: `${segment.plan}:${input.productId}`,
  };
});

const nextRead = (key: string) => {
  const reads = (readsByKey.get(key) ?? 0) + 1;
  readsByKey.set(key, reads);
  return reads;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
