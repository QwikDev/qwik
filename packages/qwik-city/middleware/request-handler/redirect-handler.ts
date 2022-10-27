import { Cookie } from './cookie';
import { createHeaders } from './headers';
import { HttpStatus } from './http-status-codes';
import type { QwikCityRequestContext } from './types';

export class RedirectResponse {
  public status: number;
  public headers: Headers;
  public cookie: Cookie;
  public location: string;

  constructor(public url: string, status?: number, headers?: Headers, cookie?: Cookie) {
    this.location = url;
    this.status = isRedirectStatus(status) ? status : HttpStatus.Found;
    this.headers = headers || createHeaders();
    this.headers.set('Location', this.location);
    this.headers.delete('Cache-Control');
    this.cookie = cookie || new Cookie('');
  }
}

export function redirectResponse(
  requestCtx: QwikCityRequestContext,
  responseRedirect: RedirectResponse
) {
  return requestCtx.response(
    responseRedirect.status,
    responseRedirect.headers,
    responseRedirect.cookie,
    async () => {}
  );
}

export function isRedirectStatus(status: number | undefined | null): status is number {
  return (
    typeof status === 'number' &&
    status >= HttpStatus.MovedPermanently &&
    status <= HttpStatus.PermanentRedirect
  );
}
