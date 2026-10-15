import {
  Catch,
  component$,
  sync$,
  useServerData,
  useSignal,
  useTask$,
  useVisibleTask$,
} from '@qwik.dev/core';
import { defaultFallback } from '../../../../error-handling/src/components/catch/catch';

const Content = component$<{ mode: string }>(({ mode }) => {
  const count = useSignal(0);
  useTask$(({ cleanup }) => {
    const previous = count.value;
    if (mode === 'task' && previous > 0) {
      throw new Error('task failed');
    }
    cleanup(() => {
      if (mode === 'cleanup' && previous > 0) {
        throw new Error('cleanup failed');
      }
    });
  });
  useVisibleTask$(
    () => {
      if (mode === 'visible' && count.value > 0) {
        throw new Error('visible failed');
      }
    },
    { strategy: 'document-ready' }
  );
  return (
    <>
      <button
        id="runtime-fail"
        onClick$={() => {
          if (mode === 'event') {
            throw new Error('event failed');
          }
          if (mode === 'async') {
            return Promise.reject(new Error('event failed'));
          }
          count.value++;
        }}
      >
        {count.value}
      </button>
      <button
        id="runtime-sync"
        onClick$={sync$(() => {
          throw new Error('sync event failed');
        })}
      >
        sync
      </button>
    </>
  );
});

export default component$(() => {
  const mode =
    new URL(useServerData('url', 'http://localhost/')).searchParams.get('mode') ?? 'event';
  return (
    <Catch fallback$={defaultFallback}>
      <Content mode={mode} />
    </Catch>
  );
});
