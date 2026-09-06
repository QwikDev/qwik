import type { Bucket } from '~/stats/vector';

const numberFormatter = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });

export interface HistogramTick {
  label: string;
  position: number;
}

export function formatHistogramRange(bucket: Pick<Bucket, 'min' | 'max'>): string {
  const [divisor, unit] = getDurationUnit(bucket.max);
  return `${formatNumber(bucket.min / divisor)}–${formatNumber(bucket.max / divisor)} ${unit}`;
}

export function getHistogramTicks(buckets: Bucket[]): HistogramTick[] {
  const max = buckets.at(-1)?.max ?? 0;
  const milestones = max > 60_000 ? [0, 1000, 10_000, 60_000] : [0, 10, 100, 1000];
  const values = [...milestones.filter((value) => value < max), max];

  return values.map((value) => {
    const bucketIndex =
      value === max ? buckets.length - 1 : buckets.findIndex((bucket) => value < bucket.max);
    return {
      label: formatDuration(value),
      position: buckets.length > 1 ? (Math.max(0, bucketIndex) / (buckets.length - 1)) * 100 : 0,
    };
  });
}

function formatDuration(milliseconds: number): string {
  const [divisor, unit] = getDurationUnit(milliseconds);
  return `${formatNumber(milliseconds / divisor)} ${unit}`;
}

function getDurationUnit(milliseconds: number): [number, string] {
  if (milliseconds >= 60_000) {
    return [60_000, 'min'];
  }
  if (milliseconds >= 1000) {
    return [1000, 's'];
  }
  return [1, 'ms'];
}

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}
