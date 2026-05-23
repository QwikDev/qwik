import { server$ } from '@qwik.dev/router';

export type PartialInput = {
  slug: string;
  runId?: string;
  delayMs?: number;
};

const reads = new Map<string, number>();

export const getRouteSegment = server$(async function () {
  const header = (this as any)?.request?.headers?.get('x-route-segment');
  return {
    segment: header === 'pro' ? 'pro' : 'free',
  };
});

export const getProductPage = server$(async function ({
  slug,
  runId = 'partial-router',
  delayMs = 25,
}: PartialInput) {
  const segment = await getRouteSegment();
  await delay(delayMs);
  const key = `${runId}:${slug}:${segment.segment}`;
  const count = (reads.get(key) ?? 0) + 1;
  reads.set(key, count);
  return {
    kind: 'product-page',
    slug,
    title: slug === 'dock' ? 'USB-C Dock' : 'Mechanical Keyboard',
    segment: segment.segment,
    reads: count,
  };
});

export const getAccountPage = server$(async function ({ slug, delayMs = 20 }: PartialInput) {
  const segment = await getRouteSegment();
  await delay(delayMs);
  return {
    kind: 'account-page',
    slug,
    title: segment.segment === 'pro' ? 'Pro workspace' : 'Free workspace',
    segment: segment.segment,
  };
});

export const getSearchPage = server$(async function ({ slug, delayMs = 20 }: PartialInput) {
  const segment = await getRouteSegment();
  await delay(delayMs);
  return {
    kind: 'search-page',
    slug,
    results: [`${slug} keyboard`, `${slug} dock`, `${slug} lamp`],
    segment: segment.segment,
  };
});

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
