import { type RequestHandler } from '@builder.io/qwik-city';

export const onRequest: RequestHandler = async ({ next, sharedMap, json }) => {
  const log: string[] = [];
  sharedMap.set('log', log);

  log.push('onRequest');
  if (isLoggedIn()) {
    // normal behavior call next middleware
    await next();
  } else {
    // If not logged in throw to prevent implicit call to the next middleware.
    throw json(404, log);
  }
};

export const onGet: RequestHandler = async ({ sharedMap }) => {
  const log = sharedMap.get('log') as string[];
  log.push('onGET');
};

function isLoggedIn() {
  return false; // always return false as mock example
}
