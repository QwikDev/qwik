import type { RequestContext } from '../../runtime/src/types';
import { mergeHeadersCookies } from './cookie';
import { createHeaders } from './headers';
import type { QwikCityRequestContext, ResponseHandler } from './types';

export function mockRequestContext(opts?: {
  method?: string;
  url?: string | URL;
  headers?: Record<string, string>;
}): TestQwikCityRequestContext {
  const url = new URL(opts?.url || '/', 'https://qwik.builder.io');

  const request: RequestContext = {
    method: opts?.method || 'GET',
    url: url.href,
    headers: createHeaders(),
    formData: () => Promise.resolve(new URLSearchParams()),
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  };
  if (opts?.headers) {
    for (const key in opts.headers) {
      request.headers.set(key, opts.headers[key]);
    }
  }

  const responseData: { status: number; headers: Headers; body: Promise<string> } = {
    status: 200,
    headers: createHeaders(),
    body: null as any,
  };

  const response: ResponseHandler = async (status, headers, cookie, body) => {
    const chunks: string[] = [];
    responseData.status = status;
    responseData.headers = mergeHeadersCookies(headers, cookie);
    responseData.body = new Promise<string>((resolve) => {
      body({
        write: (chunk) => {
          chunks.push(chunk);
        },
      }).finally(() => {
        resolve(chunks.join(''));
      });
    });
  };

  return {
    url,
    request,
    response,
    responseData,
    platform: { testing: true },
    locale: undefined,
    mode: 'dev',
  };
}

export interface TestQwikCityRequestContext extends QwikCityRequestContext {
  responseData: {
    status: number;
    headers: Headers;
    body: any;
  };
  locale: string | undefined;
}

export async function wait() {
  return new Promise((resolve) => setTimeout(resolve, 10));
}
