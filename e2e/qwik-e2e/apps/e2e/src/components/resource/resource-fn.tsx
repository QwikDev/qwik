import { component$, useComputed$, useSignal } from '@qwik.dev/core';

export const ResourceFn = component$(() => {
  const resource = useComputed$(({ track }) => {
    track(() => {
      return;
    });
    return { name: 'resource' };
  });
  const signal = useSignal({ name: 'signal' });
  const asyncSignal = useComputed$(() => Promise.resolve({ name: 'asyncSignal' }));
  const promise = useComputed$(() => Promise.resolve({ name: 'promise' }));

  return (
    <div>
      <div id={resource.value.name}>{resource.value.name}</div>
      <div id={signal.value.name}>{signal.value.name}</div>
      <div id={asyncSignal.value.name}>{asyncSignal.value.name}</div>
      <div id={promise.value.name}>{promise.value.name}</div>
    </div>
  );
});
