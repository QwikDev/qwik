import { component$, useSignal } from '@qwik.dev/core';
import { Form, isServerError, routeAction$, useLocation } from '@qwik.dev/router';

export const useAbortAction = routeAction$((form, ev) => {
  if (form.boom) {
    throw ev.error(418, { reason: 'teapot' });
  }
  return { ok: true };
});

export default component$(() => {
  const action = useAbortAction();
  const loc = useLocation();
  const caught = useSignal('');
  const formDetail = useSignal('');
  return (
    <div>
      <button
        id="abort-run"
        onClick$={async () => {
          try {
            await action.submit({ boom: true });
            caught.value = 'resolved';
          } catch (err) {
            caught.value = isServerError(err) ? `caught:${err.status}` : 'caught:unknown';
          }
        }}
      >
        Run aborting action
      </button>
      <p id="abort-caught">{caught.value}</p>
      <p id="abort-state">{`${action.isRunning}:${String(action.value)}:${String(action.error)}:${loc.isNavigating}`}</p>
      <Form
        action={action}
        onSubmitCompleted$={(ev) => {
          formDetail.value = ev.detail.aborted
            ? `aborted:${ev.detail.aborted.status}`
            : 'completed';
        }}
      >
        <input type="hidden" name="boom" value="1" />
        <button id="abort-form-submit">Submit aborting form</button>
      </Form>
      <p id="abort-form-detail">{formDetail.value}</p>
    </div>
  );
});
