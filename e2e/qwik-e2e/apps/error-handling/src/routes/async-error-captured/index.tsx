import { Catch, component$, useComputed$, type ReadonlySignal } from '@qwik.dev/core';

const AsyncValue = component$<{ data: ReadonlySignal<string> }>((props) => {
  const value = props.data.value;
  return <span id="async-value">{value}</span>;
});

const CapturedAsyncError = component$(() => {
  const data = useComputed$(async (): Promise<string> => {
    throw new Error('captured-async-boom');
  });
  return (
    <Catch
      fallback$={(error) => (
        <div>
          <div id="async-errored">errored</div>
          <span id="async-digest">{error.digest ?? 'no-digest'}</span>
        </div>
      )}
    >
      <AsyncValue data={data} />
    </Catch>
  );
});

export default component$(() => <CapturedAsyncError />);
