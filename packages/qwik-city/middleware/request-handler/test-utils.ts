import { mergeHeadersCookies } from './cookie';
import { createHeaders } from './headers';
import type { RequestContext, ServerRequestEvent } from './types';
import { WritableStream } from 'node:stream/web';

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

  return {
    url,
    request,
    getWritableStream: (status, headers, cookie, resolve) => {
      const chunks: Uint8Array[] = [];
      responseData.status = status;
      responseData.headers = mergeHeadersCookies(headers, cookie);
      const stream = new WritableStream<Uint8Array>({
        write: (chunk) => {
          chunks.push(chunk);
        },
        close: async () => {
          resolve(chunks.join(''));
        },
      });
      return stream;
    },
    responseData,
    platform: { testing: true },
    locale: undefined,
    mode: 'dev',
  };
}

export interface TestQwikCityRequestContext extends ServerRequestEvent {
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
