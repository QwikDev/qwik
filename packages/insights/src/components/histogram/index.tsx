import { component$, useStore, useComputed$, type QwikMouseEvent } from '@builder.io/qwik';
import { vectorMax, type Bucket } from '~/stats/vector';

const height = 75;

// color values are mapped to tailwind classes! make sure to update them as well in this file
export const latencyColors = ['green', 10, 'yellow', 50, 'red', Number.MAX_SAFE_INTEGER];
export const delayColors = ['gray', 250, 'lightgray', Number.MAX_SAFE_INTEGER];
export const grayColors = ['gray', Number.MAX_SAFE_INTEGER];

export default component$<{
  name?: string;
  vector: number[];
  colors?: (string | number)[];
  buckets: Bucket[];
}>(({ name, vector, buckets, colors = grayColors }) => {
  const callout = useStore({
    show: false,
    x: 0,
    y: 0,
    value: 0,
    min: 0,
    avg: 0,
    max: 0,
  });
  const max = vectorMax(vector);
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
  return (
    // 18 = histogram info (callout) height below the chart on hover
    <div class="inline-block" style={{ height: height + 18 + 'px' }}>
      {name && <h2>{name}</h2>}
      <ol
        class="flex order-last items-end justify-between w-[400px] box-content border-b border-b-slate-200"
        style={{ height: height + 'px' }}
        onMouseEnter$={() => (callout.show = true)}
        onMouseLeave$={() => (callout.show = false)}
        onMouseMove$={(event: QwikMouseEvent<MouseEvent>) => {
          callout.x = event.clientX;
          callout.y = event.clientY;
          const target = event.target as HTMLElement;
          const targetData = target.closest('[data-histogram]') || target;
          const data = targetData.getAttribute('data-histogram');
          if (data) {
            const [value, min, avg, max] = data.split(';');
            callout.value = Number(value);
            callout.min = Number(min);
            callout.avg = Number(avg);
            callout.max = Number(max);
          }
        }}
      >
        {vector.map((value, idx) => (
          <li
            class="flex items-end justify-between"
            key={idx}
            style={{ height: height + 'px' }}
            data-histogram={`${value};${buckets[idx].min};${buckets[idx].avg};${buckets[idx].max}`}
          >
            <div
              class={[
                'inline-block w-[7px] rounded-t-lg',
                { 'bg-lime-500': barColors.value[idx] === 'green' },
                { 'bg-yellow-500': barColors.value[idx] === 'yellow' },
                { 'bg-red-500': barColors.value[idx] === 'red' },
                { 'bg-slate-500': barColors.value[idx] === 'gray' },
                { 'bg-slate-300': barColors.value[idx] === 'lightgray' },
              ]}
              style={{
                height: (height * value) / max + 'px',
              }}
            >
              {/* <code class={css({ display: 'inline-block', fontSize: 8 })}>{value}</code> */}
            </div>
          </li>
        ))}
      </ol>
      <div
        style={{
          display: callout.show ? 'inline-block' : 'none',
          top: callout.y + 4 + 'px',
          left: callout.x + 4 + 'px',
        }}
      >
        <code>{formatNumber(callout.value)} </code>
        <code>{formatNumber(callout.avg)}</code>
        <code>
          [{formatNumber(callout.min)}, {formatNumber(callout.max)})
        </code>
      </div>
    </div>
  );
});

function formatNumber(number: number): string {
  return Math.round(number).toLocaleString();
}
