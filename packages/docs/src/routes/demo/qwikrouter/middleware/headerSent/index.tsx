import { type RequestHandler } from '@qwik.dev/router';

export const onGet: RequestHandler = async ({ headersSent, json }) => {
  if (!headersSent) {
    json(200, { response: 'default response' });
  }
};

export const onRequest: RequestHandler = async ({ status }) => {
  status(200);
};
