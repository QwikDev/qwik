import { expect, test } from 'vitest';
import { getDoc, searchDocs, type DocumentationSnapshot } from './docs';

const snapshot: DocumentationSnapshot = {
  version: '2.0.0-test',
  documents: [
    {
      id: '/tasks/',
      title: 'Tasks',
      description: 'Side effects',
      url: 'https://qwik.dev/tasks/',
      content: 'Read useSignal() before using a task.',
    },
    {
      id: '/signals/',
      title: 'useSignal()',
      description: 'Reactive state',
      url: 'https://qwik.dev/signals/',
      content: '# useSignal()\n\n' + 'Example useSignal() updates. '.repeat(100),
    },
  ],
};

test('search ranks title matches, ignores case, bounds snippets and respects the limit', () => {
  const result = searchDocs(snapshot, 'USESIGNAL()', 1);
  expect(result.version).toBe(snapshot.version);
  expect(result.results).toHaveLength(1);
  expect(result.results[0]).toMatchObject({
    id: '/signals/',
    title: 'useSignal()',
    url: 'https://qwik.dev/signals/',
  });
  expect(result.results[0].snippet.length).toBeLessThanOrEqual(320);
  expect(searchDocs(snapshot, 'useSignal nonexistent').results).toEqual([]);
  expect(searchDocs(snapshot, '!!!').results).toEqual([]);
});

test('get_doc returns the full versioned document and rejects unknown IDs', () => {
  expect(getDoc(snapshot, '/signals/')).toEqual({
    version: snapshot.version,
    ...snapshot.documents[1],
  });
  expect(() => getDoc(snapshot, '../../package.json')).toThrow('Unknown documentation ID');
});
