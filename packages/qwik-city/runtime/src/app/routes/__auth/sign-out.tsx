/**
 * Simple Auth For Testing Only!!!
 */

import type { EndpointHandler } from '~qwik-city-runtime';
import { signOut } from '../../auth/auth';
import {} from '../../auth/cookies';

export const onGet: EndpointHandler = async ({ request }) => {
  const result = await signOut();
  return {
    redirect: '/sign-in',
    headers: {
      'Set-Cookie': result.cookie,
    },
  };
};
