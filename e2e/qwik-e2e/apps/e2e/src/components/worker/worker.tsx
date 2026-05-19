import { component$, useSignal, $, useTask$ } from '@qwik.dev/core';
import { worker$ } from '@qwik.dev/core/worker';

const serverWorker = worker$(() => {
  return 'hello from worker';
});

const incrementInWorker = worker$((count: number) => count + 1);

const inspectEventInWorker = worker$((event: Event | null) => {
  return event === null ? 'null' : 'event';
});

const submitInWorker = worker$((data: FormData) => {
  return `${data.get('name')}:${data.get('count')}`;
});

const formatError = (err: unknown) => {
  if (err instanceof Error) {
    return err.stack || err.message;
  }
  return String(err);
};

export const WorkerRoot = component$(() => {
  const count = useSignal(0);
  const serverWorkerResult = useSignal('');
  const eventResult = useSignal('pending');
  const formResult = useSignal('pending');
  const status = useSignal('idle');

  useTask$(async () => {
    serverWorkerResult.value = await serverWorker();
  });

  return (
    <div>
      <button
        id="worker-add"
        onClick$={async () => {
          status.value = 'increment:start';
          try {
            count.value = await incrementInWorker(count.value);
            status.value = 'increment:done';
          } catch (err) {
            status.value = `increment:error:${formatError(err)}`;
          }
        }}
      >
        Increment in worker
      </button>
      <div id="worker-add-result">{count.value}</div>

      <button
        id="worker-event"
        onClick$={async (event) => {
          status.value = 'event:start';
          try {
            eventResult.value = await inspectEventInWorker(event);
            status.value = 'event:done';
          } catch (err) {
            status.value = `event:error:${formatError(err)}`;
          }
        }}
      >
        Inspect event in worker
      </button>
      <div id="worker-event-result">{eventResult.value}</div>

      <form
        id="worker-form"
        preventdefault:submit
        onSubmit$={async (event) => {
          status.value = 'form:start';
          try {
            formResult.value = await submitInWorker(event);
            status.value = 'form:done';
          } catch (err) {
            status.value = `form:error:${formatError(err)}`;
          }
        }}
      >
        <input name="name" value="qwik" />
        <input name="count" value="2" />
        <button id="worker-form-submit" type="submit">
          Submit to worker
        </button>
      </form>
      <div id="worker-form-result">{formResult.value}</div>
      <div id="worker-status">{status.value}</div>
      <div id="worker-server-result">{serverWorkerResult.value}</div>
    </div>
  );
});
