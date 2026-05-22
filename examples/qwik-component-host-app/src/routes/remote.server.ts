import { server$ } from '@qwik.dev/router';

export type RemoteInput = {
  productId: string;
  source: 'host' | 'external-team';
};

const reads = new Map<string, number>();

export const getRemoteSegment = server$(async function () {
  const origin = (this as any)?.request?.headers?.get('x-component-origin') || 'trusted-team-a';
  return {
    origin,
  };
});

export const getRemoteProduct = server$(async function ({ productId, source }: RemoteInput) {
  const segment = await getRemoteSegment();
  await delay(30);
  const key = `${segment.origin}:${source}:${productId}`;
  const count = (reads.get(key) ?? 0) + 1;
  reads.set(key, count);
  return {
    kind: 'remote-product',
    productId,
    source,
    origin: segment.origin,
    title: productId === 'dock' ? 'Remote Dock Tile' : 'Remote Keyboard Tile',
    reads: count,
  };
});

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
