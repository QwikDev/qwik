/* eslint-disable */
import {
  component$,
  useStore,
  useResource$,
  Resource,
  useSignal,
} from "@builder.io/qwik";
import { delay } from "./resource";

export const ResourceSerialization = component$(() => {
  const state = useStore({
    count0: 0,
    count1: 0,
  });
  const resourceSuccess = useResource$(
    async () => {
      await delay(100);
      return "Success";
    },
    {
      timeout: 1000,
    },
  );
  const resourceFailure = useResource$(async () => {
    await delay(100);
    throw new Error("failed");
  });
  const resourceTimeout = useResource$(
    async () => {
      await delay(1000);
      return "Success";
    },
    {
      timeout: 100,
    },
  );

  return (
    <>
      <Issue2014 />
      <IssueRaceCondition />
      <Resource
        value={resourceSuccess}
        onResolved={(data) => (
          <button class="success r1" onClick$={() => state.count0++}>
            PASS: {data} {state.count0}
          </button>
        )}
        onRejected={(reason) => (
          <button class="failure r1" onClick$={() => state.count1++}>
            ERROR: {String(reason)} {state.count1}
          </button>
        )}
      />
      <Resource
        value={resourceFailure}
        onResolved={(data) => (
          <button class="success r2" onClick$={() => state.count0++}>
            PASS: {data} {state.count0}
          </button>
        )}
        onRejected={(reason) => (
          <button class="failure r2" onClick$={() => state.count1++}>
            ERROR: {String(reason)} {state.count1}
          </button>
        )}
      />
      <Resource
        value={resourceTimeout}
        onResolved={(data) => (
          <button class="success r3" onClick$={() => state.count0++}>
            PASS: {data} {state.count0}
          </button>
        )}
        onRejected={(reason) => (
          <button class="failure r3" onClick$={() => state.count1++}>
            ERROR: {String(reason)} {state.count1}
          </button>
        )}
      />
    </>
  );
});

export const Issue2014 = component$(() => {
  const count = useSignal(0);
  console.log("render");

  const resource = useResource$<any>(async ({ track }) => {
    track(count);
    return {
      timestamp: count.value * 2,
    };
  });

  return (
    <div>
      <button id="issue-2014-btn" onClick$={() => count.value++}>
        <Resource
          value={resource}
          onResolved={(data) => <>{data.timestamp}</>}
        />
        (count is here: {count.value})
      </button>
    </div>
  );
});

export const IssueRaceCondition = component$(() => {
  const count = useSignal(0);
  const resource = useResource$<number>(async ({ track }) => {
    track(count);
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
      <Resource
        value={resource}
        onResolved={(data) => <div id="resource-race-result">{data}</div>}
      />
    </>
  );
});
