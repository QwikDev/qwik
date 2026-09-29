import { expect, test } from 'vitest';
import { readPage } from './page';

test('HTML is opt-in, limited in UTF-8 bytes, and selector failures are explicit', async () => {
  const element = { outerHTML: '<div>' + 'ą'.repeat(40000) + '</div>' };
  const doc = {
    documentElement: element,
    querySelector: (selector: string) => {
      if (selector === '[') {
        throw new Error('Invalid selector');
      }
      return selector === '#missing' ? null : element;
    },
  } as unknown as Document;
  const bridge = {
    readComponentTree: async () => [
      {
        path: 'Counter',
        name: 'Counter',
        signals: [{ name: 'count', hookType: 'useSignal', value: 2 }],
        hooks: [],
      },
    ],
    readVNodeTree: async () => [
      { id: '1', props: { private: 'secret' }, children: [{ id: '2', props: { value: 42 } }] },
    ],
  };
  const summary = await readPage({}, doc, bridge, 'http://localhost/');
  expect(summary).not.toHaveProperty('html');
  expect(summary.tree).toEqual([{ id: '1', children: [{ id: '2' }] }]);
  expect(
    (await readPage({}, doc, bridge, 'http://localhost/')).components[0].signals[0]
  ).not.toHaveProperty('value');
  const result = await readPage(
    { includeHtml: true, includeSignalValues: true },
    doc,
    bridge,
    'http://localhost/'
  );
  expect(result.html).toMatchObject({ source: 'live-dom', truncated: true });
  expect(new TextEncoder().encode(result.html!.content).length).toBeLessThanOrEqual(65536);
  expect(result.components[0].signals[0]).toHaveProperty('value', 2);
  await expect(readPage({ selector: '#missing' }, doc, bridge, '')).rejects.toThrow('No element');
  await expect(readPage({ selector: '[' }, doc, bridge, '')).rejects.toThrow('Invalid selector');
});
