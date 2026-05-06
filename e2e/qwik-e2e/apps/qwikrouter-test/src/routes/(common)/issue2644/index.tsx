import { component$ } from '@qwik.dev/core';
import { Form, routeAction$ } from '@qwik.dev/router';
import { SESSION_COOKIE, createSessionId, getSessionData } from './session-data';

export const useRootAction = routeAction$(
  (form, { redirect, cookie }) => {
    let sessionId = cookie.get(SESSION_COOKIE)?.value;
    if (!sessionId) {
      sessionId = createSessionId();
      cookie.set(SESSION_COOKIE, sessionId, { path: '/' });
    }
    const data = getSessionData(sessionId);
    data.length = 0;
    data.push(form.name as string);
    throw redirect(303, '/qwikrouter-test/issue2644/other/');
  },
  {
    id: 'root-action',
  }
);

export default component$(() => {
  const action = useRootAction();
  return (
    <Form action={action} spaReset>
      <input name="name" id="issue2644-input" />
      <button id="issue2644-submit">Submit</button>
    </Form>
  );
});
