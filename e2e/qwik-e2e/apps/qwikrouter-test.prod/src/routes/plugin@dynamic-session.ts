import { globalAction$, type RequestHandler } from '@qwik.dev/router';
import { createDynamicSession } from '../session.qwik.js';

const SESSION_COOKIE = 'qwik-prod-session';

export const onRequest: RequestHandler = ({ cookie, sharedMap }) => {
  sharedMap.set(SESSION_COOKIE, cookie.get(SESSION_COOKIE)?.value ?? null);
};

export const { useDynamicSession } = createDynamicSession();

export const useDynamicSignIn = globalAction$((_data, { cookie, redirect }) => {
  cookie.set(SESSION_COOKIE, 'admin', { path: '/' });
  throw redirect(303, '/qwikrouter-test.prod/loaders/child/');
});
