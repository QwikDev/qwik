import type { RequestEventBase } from '@builder.io/qwik-city';
import type { CookieOptions } from '@supabase/auth-helpers-shared';
import {
  CookieAuthStorageAdapter,
  parseCookies,
  serializeCookie,
} from '@supabase/auth-helpers-shared';

export class QwikServerAuthStorageAdapter extends CookieAuthStorageAdapter {
  constructor(
    private readonly requestEv: RequestEventBase,
    cookieOptions?: CookieOptions
  ) {
    super(cookieOptions);
  }

  protected getCookie(name: string): string | null | undefined {
    return parseCookies(this.requestEv.request.headers.get('Cookie') ?? '')[name];
  }
  protected setCookie(name: string, value: string): void {
    const cookieStr = serializeCookie(name, value, {
      ...this.cookieOptions,
      // Allow supabase-js on the client to read the cookie as well
      httpOnly: false,
    });
    this.requestEv.headers.append('set-cookie', cookieStr);
  }
  protected deleteCookie(name: string): void {
    const cookieStr = serializeCookie(name, '', {
      ...this.cookieOptions,
      maxAge: 0,
      // Allow supabase-js on the client to read the cookie as well
      httpOnly: false,
    });
    this.requestEv.headers.append('set-cookie', cookieStr);
  }
}
