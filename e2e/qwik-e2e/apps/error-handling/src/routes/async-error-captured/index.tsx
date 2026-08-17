import { component$, useAsync$, useSignal } from '@qwik.dev/core';

const CapturedAsyncError = component$(() => {
  const digestProbe = useSignal('unread');
  const data = useAsync$(async (): Promise<string> => {
    throw new Error('captured-async-boom');
  });
  if (data.loading) {
    return <span id="async-loading">loading</span>;
  }
  return (
    <div>
      <div id="async-errored">{data.error ? 'errored' : 'ok'}</div>
      <button
        id="async-probe"
        onClick$={() => {
          digestProbe.value =
            (data.error as (Error & { digest?: string }) | undefined)?.digest ?? 'no-digest';
        }}
      >
        probe
      </button>
      <span id="async-digest">{digestProbe.value}</span>
    </div>
  );
});

export default component$(() => <CapturedAsyncError />);
