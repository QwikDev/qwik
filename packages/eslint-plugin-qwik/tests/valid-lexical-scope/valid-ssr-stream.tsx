import { component$, SSRStream } from '@qwik.dev/core';
import { Readable } from 'stream';

export const RemoteApp = component$(() => {
  return (
    <>
      <SSRStream>
        {async (stream) => {
          const res = await fetch('path');
          const reader = res.body as any as Readable;
          reader.setEncoding('utf8');

          // Readable streams emit 'data' events once a listener is added.
          reader.on('data', (chunk) => {
            chunk = String(chunk).replace('q:base="/build/"', '!');
            stream.write(chunk);
          });

          return new Promise((resolve) => {
            reader.on('end', () => resolve());
          });
        }}
      </SSRStream>
    </>
  );
});
