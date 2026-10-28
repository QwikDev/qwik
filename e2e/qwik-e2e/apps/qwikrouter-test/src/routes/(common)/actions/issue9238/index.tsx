import { $, component$, sync$, useSignal } from '@qwik.dev/core';
import { Form, routeAction$, useLocation, useNavigate } from '@qwik.dev/router';

export const useSave = routeAction$(
  async (payload) => ({
    value: String(payload.value ?? 'saved'),
    file: payload.file instanceof File ? await payload.file.text() : '',
    intent: String(payload.intent ?? ''),
  }),
  { invalidate: [] }
);

export default component$(() => {
  const save = useSave();
  const location = useLocation();
  const nav = useNavigate();
  const outcome = useSignal('idle');
  const wasRunning = useSignal(false);
  const completed = useSignal(0);
  const handlers = useSignal(0);
  const checked = useSignal(0);
  const syncFormKey = useSignal(0);
  const onSubmit = $(async () => {
    handlers.value++;
    if (location.url.searchParams.has('delay')) {
      await fetch('/issue9238-ready');
    }
    if (location.url.searchParams.has('throw') && handlers.value === 1) {
      throw new Error('Submission handler failed');
    }
  });
  const onCompleted = $(() => {
    completed.value++;
  });

  return (
    <>
      <button
        id="programmatic-submit"
        onClick$={async () => {
          await save.submit.resolve();
          outcome.value = 'pending';
          const pending = save.submit();
          wasRunning.value = save.isRunning;
          try {
            await pending;
            outcome.value = 'resolved';
          } catch {
            outcome.value = 'rejected';
          }
        }}
      >
        Submit
      </button>
      <button id="reload" onClick$={() => nav()}>
        Reload
      </button>
      <button id="check-queue" onClick$={() => checked.value++}>
        Check queue
      </button>
      <button id="replace-sync-form" onClick$={() => syncFormKey.value++}>
        Replace synchronous form
      </button>
      <Form action={save} onSubmitCompleted$={onCompleted}>
        <button id="bare-submit">Bare</button>
      </Form>
      <div
        id="submit-parent"
        data-submits="0"
        onSubmit$={sync$((_event: SubmitEvent, element: HTMLDivElement) => {
          element.setAttribute(
            'data-submits',
            String(Number(element.getAttribute('data-submits')) + 1)
          );
        })}
      >
        <Form
          key={syncFormKey.value}
          action={save}
          onSubmit$={[
            sync$((event: SubmitEvent, form: HTMLFormElement) => {
              event.stopPropagation();
              form.setAttribute('data-handler-order', 'sync');
              form.setAttribute(
                'data-sync-calls',
                String(Number(form.getAttribute('data-sync-calls')) + 1)
              );
            }),
            $((_event, form) => {
              form.setAttribute(
                'data-async-calls',
                String(Number(form.getAttribute('data-async-calls')) + 1)
              );
              form.setAttribute(
                'data-handler-order',
                form.getAttribute('data-handler-order') + ',async'
              );
            }),
          ]}
          onSubmitCompleted$={onCompleted}
        >
          <button id="sync-submit">Synchronous</button>
        </Form>
      </div>
      <Form
        action={save}
        spaReset={location.url.searchParams.has('reset')}
        onSubmit$={onSubmit}
        onSubmitCompleted$={onCompleted}
      >
        <input id="submission-value" name="value" />
        <input id="submission-file" type="file" name="file" />
        <button id="single-submit" name="intent" value="save">
          Single
        </button>
        <button id="changed-submitter" name="intent" value="publish">
          Publish
        </button>
      </Form>
      <Form
        action={save}
        onSubmitCompleted$={onCompleted}
        onSubmit$={[
          onSubmit,
          $(async (_event, form) => {
            await Promise.resolve();
            const payload = new FormData(form);
            payload.set('value', 'form-data');
            await save.submit(payload);
            completed.value++;
          }),
        ]}
      >
        <button id="manual-form-data-submit">Manual FormData</button>
      </Form>
      <Form
        action={save}
        onSubmitCompleted$={onCompleted}
        onSubmit$={[
          onSubmit,
          $(async () => {
            await Promise.resolve();
            await save.submit({ value: 'object' });
            completed.value++;
          }),
        ]}
      >
        <button id="manual-object-submit">Manual object</button>
      </Form>
      <Form action={save} onSubmit$={[onSubmit]} onSubmitCompleted$={onCompleted}>
        <button id="array-submit" disabled={save.isRunning}>
          Array
        </button>
      </Form>
      <Form
        action={save}
        onSubmit$={[onSubmit, $((event) => save.submit(event as SubmitEvent))]}
        onSubmitCompleted$={onCompleted}
      >
        <button id="manual-submit" disabled={save.isRunning}>
          Manual
        </button>
      </Form>
      <output id="outcome">{outcome.value}</output>
      <output id="was-running">{String(wasRunning.value)}</output>
      <output id="is-running">{String(save.isRunning)}</output>
      <output id="is-navigating">{String(location.isNavigating)}</output>
      <output id="completed">{completed.value}</output>
      <output id="handlers">{handlers.value}</output>
      <output id="checked">{checked.value}</output>
      <output id="saved-value">{save.value?.value ?? ''}</output>
      <output id="saved-file">{save.value?.file ?? ''}</output>
      <output id="saved-intent">{save.value?.intent ?? ''}</output>
    </>
  );
});
