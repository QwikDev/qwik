import type { RequestHandler } from '@builder.io/qwik-city';
import type { HTTPHeaders } from '@trpc/server/dist/http/internals/types';

export const onRequest: RequestHandler = async ({ request, response, params }) => {

  const {resolveHTTPResponse} = await import("@trpc/server/http");
  const {appRouter} = await import("../../../../trpc-server/router/index");
  const {createContext} = await import("../../../../trpc-server/context");


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
