/**
 * Symbol-activation quantization shared by the collector (writes) and the build-time strategy
 * reader. Mirrors packages/insights/src/stats/vector.ts — the model is fixed, so change both places
 * together if it ever moves.
 */
export const NUMBER_OF_BUCKETS = 50;
const MAX_VALUE = 10000;
const TIMELINE_MAX_VALUE = 15 * 60 * 1000;
const VALUE_OFFSET = Math.floor(Math.pow(2, 2.5));
const TIMELINE_VALUE_OFFSET = Math.floor(Math.pow(2, 10));

const getResultOffsetAndScale = (maxValue: number, valueOffset: number) => {
  let previous = -1;
  let resultOffset = 0;
  let scale = 1;
  let count = 10;
  while (previous !== resultOffset && count-- > 0) {
    previous = resultOffset;
    scale = (NUMBER_OF_BUCKETS + resultOffset - 1) / Math.log2(maxValue + valueOffset);
    resultOffset = Math.floor(scale * Math.log2(valueOffset));
  }
  return { RESULT_OFFSET: resultOffset, SCALE: scale };
};
const { RESULT_OFFSET, SCALE } = getResultOffsetAndScale(MAX_VALUE, VALUE_OFFSET);
const { RESULT_OFFSET: TIMELINE_RESULT_OFFSET, SCALE: TIMELINE_SCALE } = getResultOffsetAndScale(
  TIMELINE_MAX_VALUE,
  TIMELINE_VALUE_OFFSET
);

/** Quantize a delay/latency (ms) into a bucket index. */
export function toBucket(value: number): number {
  value = Math.max(0, value);
  return Math.min(
    NUMBER_OF_BUCKETS - 1,
    Math.floor(SCALE * Math.log2(value + VALUE_OFFSET)) - RESULT_OFFSET
  );
}

/** Quantize a route-timeline value (ms) into a bucket index. */
export function toBucketTimeline(value: number): number {
  value = Math.max(0, value);
  return Math.min(
    NUMBER_OF_BUCKETS - 1,
    Math.floor(TIMELINE_SCALE * Math.log2(value + TIMELINE_VALUE_OFFSET)) - TIMELINE_RESULT_OFFSET
  );
}

/** Zero-padded two-digit bucket index, for `delay_count_NN`-style column names. */
export const padBucket = (n: number) => String(n).padStart(2, '0');

/** Average ms represented by each delay bucket — used to split related vs unrelated activations. */
export const BUCKET_AVERAGES = (() => {
  const sum = new Array(NUMBER_OF_BUCKETS).fill(0);
  const count = new Array(NUMBER_OF_BUCKETS).fill(0);
  for (let value = 0; value <= MAX_VALUE; value++) {
    const bucket = toBucket(value);
    sum[bucket] += value;
    count[bucket]++;
  }
  return sum.map((s, i) => (count[i] ? s / count[i] : 0));
})();

/** Split a delay histogram into [related, unrelated] counts around a ms threshold. */
export function vectorSum2(vector: number[], split: number): [number, number] {
  let related = 0;
  let unrelated = 0;
  for (let i = 0; i < vector.length; i++) {
    if (BUCKET_AVERAGES[i] < split) {
      related += vector[i];
    } else {
      unrelated += vector[i];
    }
  }
  return [related, unrelated];
}
