import { readFile } from 'node:fs/promises';

export interface DocumentationSnapshot {
  version: string;
  documents: {
    id: string;
    title: string;
    description: string;
    url: string;
    content: string;
  }[];
}

let snapshot: Promise<DocumentationSnapshot> | undefined;
export function loadDocs() {
  return (snapshot ??= readFile(new URL('../dist/docs.json', import.meta.url), 'utf8').then(
    (content) => JSON.parse(content) as DocumentationSnapshot
  ));
}

export function searchDocs(snapshot: DocumentationSnapshot, query: string, limit = 5) {
  const terms = query.toLowerCase().match(/[\p{L}\p{N}_$]+/gu) ?? [];
  const firstTerm = terms[0];
  if (!firstTerm) {
    return { version: snapshot.version, results: [] };
  }
  const matches = snapshot.documents.flatMap((document) => {
    const title = document.title.toLowerCase();
    const description = document.description.toLowerCase();
    const content = document.content.toLowerCase();
    const text = `${title}\n${description}\n${content}`;
    if (!terms.every((term) => text.includes(term))) {
      return [];
    }
    const score = terms.reduce(
      (score, term) =>
        score + (title.includes(term) ? 10 : 0) + (description.includes(term) ? 3 : 0),
      0
    );
    const start = Math.max(0, content.indexOf(firstTerm) - 80);
    const { content: _content, ...metadata } = document;
    return [{ score, ...metadata, snippet: document.content.slice(start, start + 320) }];
  });
  matches.sort((left, right) => right.score - left.score);
  return {
    version: snapshot.version,
    results: matches.slice(0, limit).map(({ score: _score, ...result }) => result),
  };
}

export function getDoc(snapshot: DocumentationSnapshot, id: string) {
  const document = snapshot.documents.find((document) => document.id === id);
  if (!document) {
    throw new Error(`Unknown documentation ID: ${id}. Use search_docs to find a page.`);
  }
  return { version: snapshot.version, ...document };
}
