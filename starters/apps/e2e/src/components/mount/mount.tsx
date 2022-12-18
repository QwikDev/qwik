import { component$, useMount$, useServerMount$, useStore, useTask$ } from '@builder.io/qwik';
import { delay } from '../async/async';

export const MountRoot = component$(() => {
  const internal = useStore(
    {
      renders: 0,
    },
    {
      reactive: false,
    }
  );
  const store = useStore({
    logs: '',
  });
  useServerMount$(async () => {
    store.logs += 'BEFORE useServerMount1()\n';
    await delay(100);
    store.logs += 'AFTER useServerMount1()\n';
  });

  useMount$(async () => {
    store.logs += 'BEFORE useMount2()\n';
    await delay(50);
    store.logs += 'AFTER useMount2()\n';
  });

  useTask$(async () => {
    store.logs += 'BEFORE useTask()\n';
    await delay(20);
    store.logs += 'AFTER useTask()\n';
  });

  useServerMount$(async () => {
    store.logs += 'BEFORE useServerMount4()\n';
    await delay(10);
    store.logs += 'AFTER useServerMount4()\n';
  });

  internal.renders++;

  return (
    <>
      <button
        onClick$={() => {
          store.logs += 'Click\n';
        }}
      >
        Rerender
      </button>
      <pre id="renders">Renders: {internal.renders}</pre>
      <pre id="logs">{store.logs + ''}</pre>
    </>
  );
});

export const Child = component$((props: { counter: { count: number } }) => {
  return <>Rerender {props.counter.count}</>;
});
