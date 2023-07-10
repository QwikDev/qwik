import { component$, useStore, useComputed$, type QwikMouseEvent } from '@builder.io/qwik';
import { vectorMax, type Bucket } from '~/stats/vector';
import { css } from '~/styled-system/css';

const height = 75;

export const latencyColors = ['green', 10, 'yellow', 50, 'red', Number.MAX_SAFE_INTEGER];
export const delayColors = ['gray', 250, 'lightgray', Number.MAX_SAFE_INTEGER];
export const grayColors = ['gray', Number.MAX_SAFE_INTEGER];

export default component$<{
  name?: string;
  vector: number[];
  colors?: (string | number)[];
  buckets: Bucket[];
}>(({ name, vector, buckets, colors = grayColors }) => {
  const callout = useStore({ show: false, x: 0, y: 0, value: 0, min: 0, avg: 0, max: 0 });
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
    <div>
      {name && <h2>{name}</h2>}
      <ol
        class={css({
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          height: 'var(--chart-height)', // Why can't I do: `${height}px`,
          border: '1px solid black',
          width: '400px',
        })}
        style={{ '--chart-height': height + 'px' }}
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
            key={idx}
            class={css({
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              height: 'var(--chart-height)',
            })}
            data-histogram={`${value};${buckets[idx].min};${buckets[idx].avg};${buckets[idx].max}`}
          >
            <div
              class={css({
                display: 'inline-block',
                width: '7px',
                height: 'var(--value)',
              })}
              style={{
                '--value': (height * value) / max + 'px',
                backgroundColor: barColors.value[idx],
              }}
            >
              {/* <code class={css({ display: 'inline-block', fontSize: 8 })}>{value}</code> */}
            </div>
          </li>
        ))}
      </ol>
      <div
        class={css({
          display: 'inline-block',
          position: 'fixed',
          border: '1px solid black',
          backgroundColor: 'white',
          padding: '4px',
          fontSize: '8px',
        })}
        style={{
          display: callout.show ? 'inline-block' : 'none',
          top: callout.y + 4 + 'px',
          left: callout.x + 4 + 'px',
        }}
      >
        <code
          class={css({
            display: 'block',
            textAlign: 'center',
            fontWeight: 'bold',
            fontSize: '10px',
          })}
        >
          {callout.value}{' '}
        </code>
        <code
          class={css({
            display: 'block',
            textAlign: 'center',
          })}
        >
          {callout.avg}
        </code>
        <code
          class={css({
            display: 'block',
          })}
        >
          [{callout.min}, {callout.max})
        </code>
      </div>
    </div>
  );
});
