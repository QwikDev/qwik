import { expect, test, vi } from 'vitest';
import { locateElement, readPage } from './page';

vi.mock('@qwik.dev/core/internal', () => ({}));

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
  expect(typeof result.html!.nextOffset).toBe('number');
  const rest = await readPage(
    { includeHtml: true, offset: result.html!.nextOffset! },
    doc,
    bridge,
    'http://localhost/'
  );
  expect(result.html!.content + rest.html!.content).toBe(element.outerHTML);
  expect(rest.html).toMatchObject({ truncated: false, nextOffset: null });
  await expect(readPage({ includeHtml: true, offset: 6 }, doc, bridge, '')).rejects.toThrow(
    'Invalid offset'
  );
  expect(result.components[0].signals[0]).toHaveProperty('value', 2);
  await expect(readPage({ selector: '#missing' }, doc, bridge, '')).rejects.toThrow('No element');
  await expect(readPage({ selector: '[' }, doc, bridge, '')).rejects.toThrow('Invalid selector');
});

test('locates the source of an element from its inspector attribute', () => {
  const withSource = {
    tagName: 'BUTTON',
    getAttribute: (name: string) =>
      name === 'data-qwik-inspector' ? '/src/routes/index.tsx:5:5' : null,
  };
  const withSourceElement = { ...withSource, closest: () => withSourceElement };
  const injected = { closest: () => withSource };
  const clientRendered = { closest: () => null };
  const elementsBySelector: Record<string, unknown[]> = {
    '#button': [withSourceElement, withSourceElement],
    '#injected': [injected],
    '#client': [clientRendered],
  };
  const doc = {
    querySelectorAll: (selector: string) => elementsBySelector[selector] ?? [],
  } as unknown as Document;

  expect(locateElement({ selector: '#button' }, doc, 'http://localhost/')).toEqual({
    url: 'http://localhost/',
    selector: '#button',
    matches: 2,
    source: { file: '/src/routes/index.tsx', line: 5, column: 5, tag: 'button', exact: true },
  });
  expect(locateElement({ selector: '#injected' }, doc, 'http://localhost/').source).toMatchObject({
    line: 5,
    exact: false,
  });
  expect(locateElement({ selector: '#client' }, doc, 'http://localhost/').source).toBeNull();
  expect(() => locateElement({ selector: '#missing' }, doc, 'http://localhost/')).toThrow(
    'No element matches selector: #missing'
  );
});
