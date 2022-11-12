import { Cookie as CookieI } from './cookie';
import { createHeaders } from './headers';
import { HttpStatus } from './http-status-codes';
import type { Cookie, QwikCityRequestContext } from './types';

export class RedirectResponse {
  public status: number;
  public headers: Headers;
  public cookies: Cookie;
  public location: string;

  constructor(public url: string, status?: number, headers?: Headers, cookies?: Cookie) {
    this.location = url;
    this.status = isRedirectStatus(status) ? status : HttpStatus.Found;
    this.headers = headers ?? createHeaders();
    this.headers.set('Location', this.location);
    this.headers.delete('Cache-Control');
    this.cookies = cookies ?? new CookieI();
  }
}

export function redirectResponse(
  requestCtx: QwikCityRequestContext,
  responseRedirect: RedirectResponse
) {
  return requestCtx.response(
    responseRedirect.status,
    responseRedirect.headers,
    responseRedirect.cookies,
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
