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

export default component$(() => {
  const loader = useErrorLoader();
  const action = useErrorAction();

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
    </div>
  );
});
