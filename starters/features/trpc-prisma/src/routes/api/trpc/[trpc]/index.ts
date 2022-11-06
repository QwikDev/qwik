import { RequestHandler } from '@builder.io/qwik-city';
import { HTTPHeaders } from '@trpc/server/dist/http/internals/types';
import { resolveHTTPResponse } from '@trpc/server/http';
import { createContext } from '../../../../trpc-server/context';
import { appRouter } from '../../../../trpc-server/router/index';

export const onRequest: RequestHandler = async ({ request, response, params }) => {
  try {
    const httpResponse = await resolveHTTPResponse({
      router: appRouter,
      path: params.trpc,
      req: {
        body: await request.text(),
        headers: request.headers as unknown as HTTPHeaders,
        method: request.method,
        query: new URL(request.url).searchParams,
      },
      createContext,
    });
    response.status = httpResponse.status;
    return JSON.parse(httpResponse.body || '{}');
  } catch (error: any) {
    response.status = 500;
    return 'Internal Server Error';
  }
};
