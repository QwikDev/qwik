/**
 * Simple Auth For Testing Only!!!
 */

import type { RequestHandler } from '~qwik-city-runtime';

export const onGet: RequestHandler = async ({ response, cookie }) => {
  cookie.delete('qwikcity-auth-token');
  throw response.redirect('/sign-in');
};
