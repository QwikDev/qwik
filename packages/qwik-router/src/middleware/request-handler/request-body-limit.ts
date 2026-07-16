import { ServerError } from './server-error';

export const DEFAULT_REQUEST_BODY_LIMIT = 10 * 1024 * 1024;

export class RequestBodyLimitError extends ServerError<string> {
  code = 'QWIK_REQUEST_BODY_LIMIT';
  statusCode = 413;

  constructor(limit: number) {
    super(413, `Request body exceeds ${limit} bytes`);
  }
}

export const validateRequestBodyLimit = (requestBodyLimit: number): void => {
  if (!Number.isSafeInteger(requestBodyLimit) || requestBodyLimit <= 0) {
    throw new TypeError('requestBodyLimit must be a positive safe integer');
  }
};

export const limitRequestBody = (
  request: Request,
  requestBodyLimit = DEFAULT_REQUEST_BODY_LIMIT
): Request => {
  validateRequestBodyLimit(requestBodyLimit);
  if (!request.body) {
    return request;
  }

  let received = 0;
  const body = request.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        if (chunk.byteLength > requestBodyLimit - received) {
          throw new RequestBodyLimitError(requestBodyLimit);
        }
        received += chunk.byteLength;
        controller.enqueue(chunk);
      },
    })
  );

  return new Request(request, { body, duplex: 'half' } as RequestInit);
};
