import { component$ } from '@qwik.dev/core';
import { Form, routeAction$, routeLoader$ } from '@qwik.dev/router';

/** Loader that does `return error()` — surfaces on `loader.error`, never aborts the page. */
export const useErrorLoader = routeLoader$(({ error, query }) => {
  if (query.get('fail') === '1') {
    return error(418, { reason: 'loader teapot' });
  }
  return { ok: 'loader-ok' };
});

/** Action that does `return error()` — surfaces on `action.error`, never aborts the page. */
export const useErrorAction = routeAction$((data, { error }) => {
  if ((data as { fail?: string }).fail === '1') {
    return error(422, { reason: 'action teapot' });
  }
  return { ok: 'action-ok' };
});

/** Action that does `return fail()` — the deprecated `.value.failed` union PLUS the new `.error`. */
export const useFailAction = routeAction$((_data, { fail }) => {
  return fail(400, { reason: 'soft fail' });
});

/** Action whose `error()` is intentionally never read via `.error` — triggers the dev-only warning. */
export const useUnhandledAction = routeAction$((_data, { error }) => {
  return error(409, { reason: 'unhandled' });
});

export default component$(() => {
  const loader = useErrorLoader();
  const action = useErrorAction();
  const failAction = useFailAction();
  const unhandledAction = useUnhandledAction();

  return (
    <div>
      <p id="loader-value">{loader.value ? JSON.stringify(loader.value) : 'no-value'}</p>
      <p id="loader-error">
        {loader.error ? `${loader.error.status}:${JSON.stringify(loader.error.data)}` : 'no-error'}
      </p>

      <Form action={action}>
        <input type="hidden" name="fail" value="1" />
        <button id="submit-fail" type="submit">
          Submit failing
        </button>
      </Form>

      <p id="action-value">{action.value ? JSON.stringify(action.value) : 'no-value'}</p>
      <p id="action-error">
        {action.error ? `${action.error.status}:${JSON.stringify(action.error.data)}` : 'no-error'}
      </p>

      <Form action={failAction}>
        <button id="submit-soft-fail" type="submit">
          Submit soft fail
        </button>
      </Form>
      <p id="fail-value">{failAction.value ? JSON.stringify(failAction.value) : 'no-value'}</p>
      <p id="fail-error">
        {failAction.error
          ? `${failAction.error.status}:${JSON.stringify(failAction.error.data)}`
          : 'no-error'}
      </p>

      <Form action={unhandledAction}>
        <button id="submit-unhandled" type="submit">
          Submit unhandled
        </button>
      </Form>
      {/* unhandledAction.error is intentionally NOT read — submitting it should log the dev warning. */}
      <p id="unhandled-value">
        {unhandledAction.value ? JSON.stringify(unhandledAction.value) : 'no-value'}
      </p>
    </div>
  );
});
