import type { RequestContext } from '../../runtime/src/library/types';
import { createHeaders } from './headers';
import type { ResponseHandler } from './types';

export function mockRequestContext(opts?: { method?: string; url?: string | URL }) {
  const url = new URL(opts?.url || '/', 'https://qwik.builder.io');

  const request: RequestContext = {
    method: opts?.method || 'GET',
    url,
    headers: createHeaders(),
  } as any;

  const responseData: { status: number; headers: Headers; body: Promise<string> } = {
    status: 200,
    headers: createHeaders(),
    body: null as any,
  };

  const response: ResponseHandler = async (status, headers, body) => {
    const chunks: string[] = [];
    responseData.status = status;
    responseData.headers = headers as any;
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

  return { url, request, response, responseData };
}

export async function wait() {
  return new Promise((resolve) => setTimeout(resolve, 10));
}
