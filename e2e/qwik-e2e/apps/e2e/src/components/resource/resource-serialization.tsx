/* eslint-disable */
import { component$, useComputed$, useSignal, useStore } from '@qwik.dev/core';
import { delay } from '../delay';

export const ResourceSerialization = component$(() => {
  const state = useStore({
    count0: 0,
    count1: 0,
  });
  const resourceSuccess = useComputed$(
    async () => {
      await delay(100);
      return 'Success';
    },
    {
      timeout: 1000,
    }
  );
  const resourceFailure = useComputed$(async () => {
    await delay(100);
    throw new Error('failed');
  });
  const resourceTimeout = useComputed$(
    async () => {
      await delay(1000);
      return 'Success';
    },
    {
      timeout: 100,
    }
  );

  return (
    <>
      <ResourceSignalResumabilityIssue2014 />
      <IssueRaceCondition />
      {resourceSuccess.pending ? null : resourceSuccess.error ? (
        <button class="failure r1" onClick$={() => state.count1++}>
          ERROR: {String(resourceSuccess.error)} {state.count1}
        </button>
      ) : (
        <button class="success r1" onClick$={() => state.count0++}>
          PASS: {resourceSuccess.value} {state.count0}
        </button>
      )}
      {resourceFailure.pending ? null : resourceFailure.error ? (
        <button class="failure r2" onClick$={() => state.count1++}>
          ERROR: {String(resourceFailure.error)} {state.count1}
        </button>
      ) : (
        <button class="success r2" onClick$={() => state.count0++}>
          PASS: {resourceFailure.value} {state.count0}
        </button>
      )}
      {resourceTimeout.pending ? null : resourceTimeout.error ? (
        <button class="failure r3" onClick$={() => state.count1++}>
          ERROR: {String(resourceTimeout.error)} {state.count1}
        </button>
      ) : (
        <button class="success r3" onClick$={() => state.count0++}>
          PASS: {resourceTimeout.value} {state.count0}
        </button>
      )}
    </>
  );
});

export const ResourceSignalResumabilityIssue2014 = component$(() => {
  const count = useSignal(0);
  console.log('render');

  const resource = useComputed$(async () => {
    count.value;
    return {
      timestamp: count.value * 2,
    };
  });

  return (
    <div>
      <button id="issue-2014-btn" onClick$={() => count.value++}>
        {resource.value.timestamp}
        (count is here: {count.value})
      </button>
    </div>
  );
});

export const IssueRaceCondition = component$(() => {
  const count = useSignal(0);
  const resource = useComputed$(async () => {
    count.value;
    const value = count.value;
    if (count.value === 1) {
      await delay(500);
    }
    return value;
  });

  return (
    <>
      <button id="resource-race-btn" onClick$={() => count.value++}>
        {count.value}
      </button>
      <div id="resource-race-result">{resource.value}</div>
    </>
  );
});
