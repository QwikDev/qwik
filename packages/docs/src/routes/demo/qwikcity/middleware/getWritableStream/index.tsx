import type { RequestHandler } from '@builder.io/qwik-city';

export const onGet: RequestHandler = async (requestEvent) => {
  const writableStream = requestEvent.getWritableStream();
  const writer = writableStream.getWriter();
  const encoder = new TextEncoder();

  writer.write(encoder.encode('Hello World\n'));
  await wait(100);
  writer.write(encoder.encode('After 100ms\n'));
  await wait(100);
  writer.write(encoder.encode('After 200ms\n'));
  await wait(100);
  writer.write(encoder.encode('END'));
  writer.close();
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
