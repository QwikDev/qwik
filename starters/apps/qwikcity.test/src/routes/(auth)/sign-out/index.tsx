/**
 * Simple Auth For Testing Only!!!
 */

import type { RequestHandler } from '@builder.io/qwik-city';

export const onGet: RequestHandler = async ({ response, cookie }) => {
  cookie.delete('qwikcity-auth-token');
  throw response.redirect('/sign-in');
};
