import { type RequestHandler } from '@qwik.dev/router';

export const onGet: RequestHandler = async ({ env, json }) => {
  json(200, {
    USER: env.get('USER'),
    MODE_ENV: env.get('MODE_ENV'),
    PATH: env.get('PATH'),
    SHELL: env.get('SHELL'),
  });
};
