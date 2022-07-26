import type { QwikCityUserContext } from '../../runtime/src/library/types';
import type { UserResponseContext } from './types';

export function getQwikCityUserContext(userResponseContext: UserResponseContext): {
  qwikcity: QwikCityUserContext;
} {
  return {
    qwikcity: {
      route: {
        href: userResponseContext.url.href,
        pathname: userResponseContext.url.pathname,
        params: { ...userResponseContext.params },
        query: Object.fromEntries(userResponseContext.url.searchParams.entries()),
      },
      response: {
        body: userResponseContext.body,
        status: userResponseContext.status,
      },
    },
  };
}
