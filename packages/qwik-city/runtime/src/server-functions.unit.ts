import { test } from 'uvu';
import { equal } from 'uvu/assert';
import { exportedForTesting } from './server-functions';
const { streamEvents } = exportedForTesting;
import { ReadableStream } from 'node:stream/web';

type SSE = ReturnType<typeof streamEvents> extends AsyncGenerator<infer X> ? X : never;

const _ = async (s: string) => {
  const bytes = new TextEncoder().encode(s);
  const stream = new ReadableStream({
    pull: (controller) => {
      controller.enqueue(bytes);
      controller.close();
    },
  });

  const result: SSE[] = [];
  for await (const event of await streamEvents(stream)) {
    result.push(event);
  }
  return result;
};

test('parse a single field, return one object', async () => {
  equal(await _('data'), [{ data: '' }]);
});

test('parse two fields, return one object', async () => {
  equal(await _('data\nevent'), [{ data: '', event: '' }]);
});

test('if only a comment, return an empty object', async () => {
  equal(await _(':\n\n'), [{}]);
});

test('if only newlines, return nothing', async () => {
  equal(await _('\n\n\n\n'), []);
});

test('if data provided several times, join with newline', async () => {
  equal(await _('data\ndata'), [{ data: '\n' }]);
});

test('if data provided several times, return two objects', async () => {
  equal(await _('data\n\ndata'), [{ data: '' }, { data: '' }]);
});

test('parse field value', async () => {
  equal(await _('data:value'), [{ data: 'value' }]);
});

test('parse field value, skip optional space', async () => {
  equal(await _('data: value'), [{ data: 'value' }]);
});

test.run();
