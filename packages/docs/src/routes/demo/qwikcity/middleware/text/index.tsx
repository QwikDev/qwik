import { type RequestHandler } from '@builder.io/qwik-city';

export const onGet: RequestHandler = async ({ text }) => {
  text(200, 'Text based response.');
};
