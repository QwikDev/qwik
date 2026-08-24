import { $, component$, useComputed$, useStore } from '@qwik.dev/core';
import { vectorMax, type Bucket } from '~/stats/vector';
import { formatHistogramRange, getHistogramTicks } from './labels';

// color values are mapped to tailwind classes! make sure to update them as well in this file
export const latencyColors = ['green', 10, 'yellow', 50, 'red', Number.MAX_SAFE_INTEGER];
export const delayColors = ['gray', 250, 'lightgray', Number.MAX_SAFE_INTEGER];
export const grayColors = ['gray', Number.MAX_SAFE_INTEGER];
export const currentColors = ['blue', Number.MAX_SAFE_INTEGER];
export const previousColors = ['violet', Number.MAX_SAFE_INTEGER];

export default component$<{
  ariaLabel?: string;
  comparison?: {
    label: string;
    vector: number[];
    colors?: (string | number)[];
  };
  class?: string;
  chartClass?: string;
  name?: string;
  seriesLabel?: string;
  vector: number[];
  colors?: (string | number)[];
  buckets: Bucket[];
}>(
  ({
    ariaLabel = 'Histogram',
    class: className,
    chartClass,
    comparison,
    name,
    seriesLabel = 'Samples',
    vector,
    buckets,
    colors = grayColors,
  }) => {
    const callout = useStore({
      show: false,
      index: 0,
      value: 0,
      comparisonValue: 0,
      min: 0,
      max: 0,
    });
    const max = Math.max(vectorMax(vector), vectorMax(comparison?.vector ?? []));
    const ticks = getHistogramTicks(buckets);
    const selectBucket = $((index: number) => {
      const bucket = buckets[index];
      callout.show = true;
      callout.index = index;
      callout.value = vector[index];
      callout.comparisonValue = comparison?.vector[index] ?? 0;
      callout.min = bucket.min;
      callout.max = bucket.max;
    });
    const barColors = useComputed$(() => getBarColors(colors, buckets));
    const comparisonBarColors = useComputed$(() =>
      getBarColors(comparison?.colors ?? previousColors, buckets)
    );
    const calloutPosition = vector.length > 1 ? (callout.index / (vector.length - 1)) * 100 : 0;
    return (
      <div class={['w-full', className ?? 'max-w-editorial-chart']}>
        {name && <h2 class="text-editorial-12 font-semibold">{name}</h2>}
        <div
          class={['relative', chartClass ?? 'h-editorial-26', name && 'mt-editorial-3']}
          onMouseLeave$={() => (callout.show = false)}
        >
          {callout.show && (
            <div
              role="tooltip"
              class="pointer-events-none absolute bottom-editorial-8 z-10 w-28 -translate-x-1/2 rounded-editorial-sm border border-editorial-border-strong bg-editorial-surface px-editorial-3 py-editorial-2 font-editorial-ui text-editorial-12 text-editorial-primary"
              style={{
                left: `clamp(var(--spacing-editorial-12), ${calloutPosition}%, calc(100% - var(--spacing-editorial-12)))`,
              }}
            >
              <strong class="block font-semibold">
                {formatHistogramRange({ min: callout.min, max: callout.max })}
              </strong>
              <HistogramValue label={seriesLabel} value={callout.value} />
              {comparison && (
                <HistogramValue label={comparison.label} value={callout.comparisonValue} />
              )}
              <span
                class="absolute top-full left-1/2 h-editorial-6 border-l border-dashed border-editorial-border-strong"
                aria-hidden="true"
              />
            </div>
          )}
          <span
            class="absolute inset-x-0 top-1/4 border-t border-editorial-border"
            aria-hidden="true"
          />
          <span
            class="absolute inset-x-0 top-1/2 border-t border-editorial-border"
            aria-hidden="true"
          />
          <span
            class="absolute inset-x-0 top-3/4 border-t border-editorial-border"
            aria-hidden="true"
          />
          <ol
            class="absolute inset-x-0 top-editorial-1 bottom-0 m-0 flex list-none items-end justify-between border-b border-editorial-border-strong p-0"
            aria-label={ariaLabel}
          >
            {vector.map((value, idx) => {
              const bucket = buckets[idx];
              const comparisonValue = comparison?.vector[idx] ?? 0;
              return (
                <li
                  class="flex h-full items-end gap-px"
                  key={idx}
                  tabIndex={value || comparisonValue ? 0 : -1}
                  aria-label={
                    comparison
                      ? `${formatHistogramRange(bucket)}, ${seriesLabel}: ${formatSampleCount(value)}, ${comparison.label}: ${formatSampleCount(comparisonValue)}`
                      : `${formatHistogramRange(bucket)}, ${formatSampleCount(value)}`
                  }
                  onMouseEnter$={() => selectBucket(idx)}
                  onFocus$={() => selectBucket(idx)}
                  onBlur$={() => (callout.show = false)}
                >
                  {comparison && (
                    <span
                      class={[
                        'block w-editorial-2',
                        getBarColorClass(comparisonBarColors.value[idx]),
                      ]}
                      style={{
                        height: max ? `${(100 * comparisonValue) / max}%` : '0',
                        borderTopLeftRadius: 'var(--radius-editorial-full)',
                        borderTopRightRadius: 'var(--radius-editorial-full)',
                      }}
                      aria-hidden="true"
                    />
                  )}
                  <span
                    class={[
                      'block',
                      comparison ? 'w-editorial-2' : 'w-editorial-1',
                      getBarColorClass(barColors.value[idx]),
                    ]}
                    style={{
                      height: max ? `${(100 * value) / max}%` : '0',
                      borderTopLeftRadius: 'var(--radius-editorial-full)',
                      borderTopRightRadius: 'var(--radius-editorial-full)',
                    }}
                    aria-hidden="true"
                  />
                </li>
              );
            })}
          </ol>
        </div>
        <div class="relative mt-editorial-3 h-editorial-5 text-editorial-11 text-editorial-muted">
          {ticks.map((tick, index) => (
            <span
              key={tick.label}
              class={[
                'absolute top-0 whitespace-nowrap',
                index === 0
                  ? 'left-0'
                  : index === ticks.length - 1
                    ? 'right-0'
                    : '-translate-x-1/2',
              ]}
              style={
                index > 0 && index < ticks.length - 1 ? { left: `${tick.position}%` } : undefined
              }
            >
              {tick.label}
            </span>
          ))}
        </div>
      </div>
    );
  }
);

const HistogramValue = component$<{ label: string; value: number }>(({ label, value }) => (
  <span class="mt-editorial-1 block text-editorial-secondary">
    {label}: {formatSampleCount(value)}
  </span>
));

function getBarColors(colors: (string | number)[], buckets: Bucket[]): string[] {
  const barColors = [];
  let currentColor = colors[0] as string;
  let colorIdx = 1;
  for (let i = 0; i < buckets.length; i++) {
    const bucket = buckets[i];
    const color = colors[colorIdx];
    if (typeof color === 'number') {
      if (color < bucket.min) {
        colorIdx++;
        currentColor = colors[colorIdx] as string;
        colorIdx++;
      }
    }
    barColors.push(currentColor);
  }
  return barColors;
}

function getBarColorClass(color: string): string {
  switch (color) {
    case 'green':
      return 'bg-editorial-success';
    case 'yellow':
      return 'bg-editorial-warning';
    case 'red':
      return 'bg-editorial-danger';
    case 'lightgray':
      return 'bg-editorial-border-strong';
    case 'blue':
      return 'bg-editorial-data-current';
    case 'violet':
      return 'bg-editorial-data-previous';
    default:
      return 'bg-editorial-secondary';
  }
}

function formatSampleCount(value: number): string {
  return `${value.toLocaleString('en')} ${value === 1 ? 'sample' : 'samples'}`;
}
