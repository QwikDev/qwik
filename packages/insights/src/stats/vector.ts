/**
 * Controls the number of buckets to quantize to.
 */
export const NUMBER_OF_BUCKETS = 50;

/**
 * Max value which cant be quantized. Any value greater than this value will
 * result in the last bucket.
 */
export const MAX_VALUE = 10000;

/**
 * Without offset Math.log2(0) is -Infinity, and Math.Log(1) and Math.Log(2)
 * leave an empty bucket. So by offsetting it we cane ensure that the
 * buckets are not skipped.
 */
const VALUE_OFFSET = Math.floor(Math.pow(2, 2.5));

/**
 * A computed constant which is used for scaling so that we spread MAX_VALUE into BUCKETS.
 */
const { RESULT_OFFSET, SCALE } = (() => {
  let previousResultOffset = -1;
  let resultOffset = 0;
  let scale = 1;
  let count = 10;
  while (previousResultOffset !== resultOffset && count-- > 0) {
    previousResultOffset = resultOffset;
    scale = (NUMBER_OF_BUCKETS + resultOffset - 1) / Math.log2(MAX_VALUE + VALUE_OFFSET);
    resultOffset = Math.floor(scale * Math.log2(VALUE_OFFSET));
  }
  return { RESULT_OFFSET: resultOffset, SCALE: scale };
})();

/**
 * Quantize the value into one of the buckets
 */
export function toBucket(value: number): number {
  value = Math.max(0, value);
  return Math.min(
    NUMBER_OF_BUCKETS - 1, // Make sure we never return a value greater than number of buckets
    Math.floor(SCALE * Math.log2(value + VALUE_OFFSET)) - RESULT_OFFSET
  );
}

export interface Bucket {
  min: number;
  max: number;
  avg: number;
}
export const BUCKETS: Bucket[] = (() => {
  const buckets: ReturnType<typeof fromBucket>[] = [];
  for (let i = 0; i <= MAX_VALUE; i++) {
    const bucketIdx = toBucket(i);
    if (bucketIdx < buckets.length) {
      const bucket = buckets[bucketIdx];
      bucket.max = i + 1;
      bucket.avg = (bucket.min + i + 1) / 2;
    } else {
      buckets.push({ min: i, max: i + 1, avg: (i + i + 1) / 2 });
    }
  }
  return buckets;
})();

export function fromBucket(bucket: number): { min: number; max: number; avg: number } {
  return BUCKETS[Math.min(BUCKETS.length - 1, bucket)];
}

export function vectorSum(vector: number[]): number {
  let sum = 0;
  for (let i = 0; i < vector.length; i++) {
    sum += vector[i];
  }
  return sum;
}
export function vectorSum2(vector: number[], split: number): [number, number] {
  let sum1 = 0;
  let sum2 = 0;
  for (let i = 0; i < vector.length; i++) {
    const bucket = BUCKETS[i];
    if (bucket.avg < split) {
      sum1 += vector[i];
    } else {
      sum2 += vector[i];
    }
  }
  return [sum1, sum2];
}

export function vectorAdd(dst: number[], src: number[]) {
  let max = 0;
  for (let i = 0; i < dst.length; i++) {
    max = Math.max(max, (dst[i] += src[i]));
  }
  return max;
}

export function vectorAvg(vector: number[]): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < vector.length; i++) {
    const value = vector[i];
    sum += value * BUCKETS[i].avg;
    count += value;
  }
  return sum / count;
}

export function vectorMax(vector: number[]): number {
  let max = 0;
  for (let i = 0; i < vector.length; i++) {
    const value = vector[i];
    max = Math.max(max, value);
  }
  return max;
}

const VECTOR_TEMPLATE = (() => {
  const vector: number[] = [];
  for (let i = 0; i < NUMBER_OF_BUCKETS; i++) {
    vector.push(0);
  }
  return vector;
})();

export function vectorNew(): number[] {
  return VECTOR_TEMPLATE.slice();
}
