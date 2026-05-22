import { server$ } from '@qwik.dev/router';

export type StressInput = {
  id: string;
  runId: string;
};

const itemReads = new Map<string, number>();
const metricReads = new Map<string, number>();

export const getStressSegment = server$(async function () {
  const bucket = (this as any)?.request?.headers?.get('x-stress-bucket') === 'b' ? 'b' : 'a';
  return {
    bucket,
  };
});

export const getStressItem = server$(async function ({ id, runId }: StressInput) {
  const segment = await getStressSegment();
  await delay(id === 'slow' ? 80 : 10);
  const key = `${runId}:${id}:${segment.bucket}`;
  const reads = (itemReads.get(key) ?? 0) + 1;
  itemReads.set(key, reads);
  return {
    kind: 'stress-item',
    id,
    bucket: segment.bucket,
    reads,
    label: `Item ${id.toUpperCase()}`,
  };
});

export const getSharedMetric = server$(async function ({ id, runId }: StressInput) {
  const segment = await getStressSegment();
  await delay(15);
  const key = `${runId}:${id}:${segment.bucket}:metric`;
  const reads = (metricReads.get(key) ?? 0) + 1;
  metricReads.set(key, reads);
  return {
    kind: 'shared-metric',
    id,
    bucket: segment.bucket,
    reads,
    score: id.charCodeAt(0) + segment.bucket.charCodeAt(0),
  };
});

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
