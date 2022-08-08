import { createHeaders } from './headers';
import { HttpStatus } from './http-status-codes';
import type { QwikCityRequestContext } from './types';
import type { RedirectResponse } from './user-response';

export function redirectResponse(
  requestCtx: QwikCityRequestContext,
  responseRedirect: RedirectResponse
) {
  const { response } = requestCtx;

  const status = getRedirectStatus(responseRedirect.status);

  const headers = responseRedirect.headers || createHeaders();
  headers.set('Location', responseRedirect.location);

  return response(status, headers, async () => {});
}

export function getRedirectStatus(status: number | undefined | null) {
  return isRedirectStatus(status) ? status : HttpStatus.TemporaryRedirect;
}

export function isRedirectStatus(status: number | undefined | null): status is number {
  return (
    typeof status === 'number' &&
    status >= HttpStatus.MovedPermanently &&
    status <= HttpStatus.PermanentRedirect
  );
}
