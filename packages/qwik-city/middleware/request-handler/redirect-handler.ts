import { createHeaders } from './headers';
import { HttpStatus } from './http-status-codes';
import type { QwikCityRequestContext } from './types';

export class RedirectResponse {
  public status: number;
  public headers: Headers;
  public location: string;

  constructor(public url: string, status?: number, headers?: Headers) {
    this.location = url;
    this.status = isRedirectStatus(status) ? status : HttpStatus.Found;
    this.headers = headers || createHeaders();
    this.headers.set('Location', this.location);
    this.headers.delete('Cache-Control');
  }
}

export function redirectResponse(
  requestCtx: QwikCityRequestContext,
  responseRedirect: RedirectResponse
) {
  return requestCtx.response(responseRedirect.status, responseRedirect.headers, async () => {});
}

export function isRedirectStatus(status: number | undefined | null): status is number {
  return (
    typeof status === 'number' &&
    status >= HttpStatus.MovedPermanently &&
    status <= HttpStatus.PermanentRedirect
  );
}
