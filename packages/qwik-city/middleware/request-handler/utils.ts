import type { QwikCityEnvData } from '../../runtime/src/library/types';
import type { UserResponseContext } from './types';

export function getQwikCityEnvData(userResponseContext: UserResponseContext): {
  qwikcity: QwikCityEnvData;
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
