import { type RequestHandler } from '@builder.io/qwik-city';

// Generic function `onRequest` is executed first
export const onRequest: RequestHandler = async ({ next, sharedMap, json }) => {
  const log: string[] = [];
  sharedMap.set('log', log);

  log.push('onRequest start');
  await next(); // Execute next middleware function (onGet)
  log.push('onRequest end');

  json(200, log);
};

// Specific functions such as `onGet` are executed next
export const onGet: RequestHandler = async ({ next, sharedMap }) => {
  const log = sharedMap.get('log') as string[];

  log.push('onGET start');
  // execute next middleware function
  // (in our case, there are no more middleware functions nor components.)
  await next();
  log.push('onGET end');
};
