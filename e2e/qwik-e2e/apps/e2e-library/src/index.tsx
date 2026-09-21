import {
  component$,
  createContextId,
  isSignal,
  useContext,
  useSignal,
  useTask$,
} from '@qwik.dev/core';

export interface Greeting {
  greeting: string;
}

export const GreetingContext = createContextId<Greeting>('e2e-library.greeting');

/** Lets the app detect whether the library evaluated its own copy of core. */
export const libraryIsSignal = isSignal;

export const LibCounter = component$(() => {
  const count = useSignal(0);
  const taskRuns = useSignal(0);
  const greeting = useContext(GreetingContext);

  useTask$(({ track }) => {
    track(count);
    taskRuns.value++;
  });

  return (
    <div id="lib-counter">
      <p id="lib-greeting">{greeting.greeting}</p>
      <p id="lib-count">{count.value}</p>
      <p id="lib-task-runs">{taskRuns.value}</p>
      <button id="lib-increment" onClick$={() => count.value++}>
        +
      </button>
    </div>
  );
});
