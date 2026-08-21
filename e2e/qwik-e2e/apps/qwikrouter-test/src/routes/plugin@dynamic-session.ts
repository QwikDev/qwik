import { $ } from '@qwik.dev/core';
import {
  globalAction$,
  routeLoaderQrl,
  type RequestEventLoader,
  type RequestHandler,
} from '@qwik.dev/router';

const SESSION_COOKIE = 'qwik-dynamic-session';
const SESSION_KEY = 'qwik-dynamic-session';

export const onRequest: RequestHandler = ({ cookie, sharedMap }) => {
  sharedMap.set(SESSION_KEY, cookie.get(SESSION_COOKIE)?.value ?? null);
};

export const useDynamicSession = routeLoaderQrl(
  $(({ sharedMap }: RequestEventLoader) => sharedMap.get(SESSION_KEY))
);

export const useDynamicSignIn = globalAction$((_data, { cookie, redirect }) => {
  cookie.set(SESSION_COOKIE, 'admin', { path: '/' });
  throw redirect(302, '/qwikrouter-test/dynamic-session/dashboard/');
});
