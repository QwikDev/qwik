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
  name?: string;
  vector: number[];
  colors?: (string | number)[];
  buckets: Bucket[];
}>(({ name, vector, buckets, colors = grayColors }) => {
  const callout = useStore({
    show: false,
    index: 0,
    value: 0,
    min: 0,
    max: 0,
  });
  const max = vectorMax(vector);
  const ticks = getHistogramTicks(buckets);
  const selectBucket = $((index: number) => {
    const bucket = buckets[index];
    callout.show = true;
    callout.index = index;
    callout.value = vector[index];
    callout.min = bucket.min;
    callout.max = bucket.max;
  });
  const barColors = useComputed$(() => {
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
  });
  const calloutPosition = vector.length > 1 ? (callout.index / (vector.length - 1)) * 100 : 0;
  return (
    <div class="w-full max-w-editorial-chart">
      {name && <h2 class="text-editorial-12 font-semibold">{name}</h2>}
      <div
        class={['relative h-editorial-26', name && 'mt-editorial-3']}
        onMouseLeave$={() => (callout.show = false)}
      >
        {callout.show && (
          <div
            role="tooltip"
            class="pointer-events-none absolute bottom-editorial-8 z-10 w-24 -translate-x-1/2 rounded-editorial-sm border border-editorial-border-strong bg-editorial-surface px-editorial-3 py-editorial-2 font-editorial-ui text-editorial-12 text-editorial-primary"
            style={{
              left: `clamp(var(--spacing-editorial-12), ${calloutPosition}%, calc(100% - var(--spacing-editorial-12)))`,
            }}
          >
            <strong class="block font-semibold">
              {formatHistogramRange({ min: callout.min, max: callout.max })}
            </strong>
            <span class="mt-editorial-1 block text-editorial-secondary">
              {callout.value.toLocaleString('en')} {callout.value === 1 ? 'sample' : 'samples'}
            </span>
            <span
              class="absolute top-full left-1/2 h-editorial-6 border-l border-dashed border-editorial-border-strong"
              aria-hidden="true"
            />
          </div>
        )}
        <ol
          class="absolute inset-x-0 top-editorial-1 bottom-0 m-0 flex list-none items-end justify-between border-b border-editorial-border-strong p-0"
          aria-label="Latency histogram"
        >
          {vector.map((value, idx) => {
            const bucket = buckets[idx];
            return (
              <li
                class="flex h-full items-end"
                key={idx}
                tabIndex={value ? 0 : -1}
                aria-label={`${formatHistogramRange(bucket)}, ${value.toLocaleString('en')} ${value === 1 ? 'sample' : 'samples'}`}
                onMouseEnter$={() => selectBucket(idx)}
                onFocus$={() => selectBucket(idx)}
                onBlur$={() => (callout.show = false)}
              >
                <span
                  class={[
                    'block w-editorial-1',
                    { 'bg-editorial-success': barColors.value[idx] === 'green' },
                    { 'bg-editorial-warning': barColors.value[idx] === 'yellow' },
                    { 'bg-editorial-danger': barColors.value[idx] === 'red' },
                    { 'bg-editorial-secondary': barColors.value[idx] === 'gray' },
                    { 'bg-editorial-border-strong': barColors.value[idx] === 'lightgray' },
                    { 'bg-editorial-data-current': barColors.value[idx] === 'blue' },
                    { 'bg-editorial-data-previous': barColors.value[idx] === 'violet' },
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
              index === 0 ? 'left-0' : index === ticks.length - 1 ? 'right-0' : '-translate-x-1/2',
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
});
