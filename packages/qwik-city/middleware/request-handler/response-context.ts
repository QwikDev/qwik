import type { ResponseContext as ResponseContextInterface } from '../../runtime/src/types';
import type { QwikCityRequestContext, UserResponseContext } from './types';
import { ErrorResponse } from './error-handler';
import { RedirectResponse } from './redirect-handler';

const UserRsp = Symbol('UserResponse');
const RequestCtx = Symbol('RequestContext');

export class ResponseContext implements ResponseContextInterface {
  [UserRsp]: UserResponseContext;
  [RequestCtx]: QwikCityRequestContext;

  constructor(userResponse: UserResponseContext, requestCtx: QwikCityRequestContext) {
    this[UserRsp] = userResponse;
    this[RequestCtx] = requestCtx;
  }
  get status() {
    return this[UserRsp].status;
  }
  set status(code) {
    this[UserRsp].status = code;
  }
  get headers() {
    return this[UserRsp].headers;
  }
  get locale() {
    return this[RequestCtx].locale;
  }
  set locale(locale) {
    this[RequestCtx].locale = locale;
  }
  redirect(url: string, status?: number) {
    return new RedirectResponse(url, status, this[UserRsp].headers, this[UserRsp].cookie);
  }
  error(status: number, message?: string) {
    return new ErrorResponse(status, message);
  }
  html(html: string) {
    this[UserRsp].headers.set('Content-Type', 'text/html; charset=utf-8');
    this.send(html);
  }
  json(data: any) {
    this[UserRsp].headers.set('Content-Type', 'application/json; charset=utf-8');
    this.send(JSON.stringify(data));
  }
  send(body: any) {
    const usrRsp = this[UserRsp];
    if (usrRsp.bodySent) {
      throw new Error('Body already sent');
    }
    usrRsp.bodySent = true;
    usrRsp.resolvedBody = body;
  }
}
