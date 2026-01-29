import { type RequestHandler } from '@builder.io/qwik-city';

export const onGet: RequestHandler = async ({ status, getWritableStream }) => {
  status(200);
  const stream = getWritableStream();
  const writer = stream.getWriter();
  writer.write(new TextEncoder().encode('Hello World!'));
  writer.close();
};
