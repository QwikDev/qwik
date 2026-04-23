import { createHighlighter, type Highlighter } from 'shiki';

let highlighterPromise: Promise<Highlighter> | null = null;

export const getHighlighter = () => {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['nord'],
      langs: ['json', 'html', 'tsx', 'js', 'ts', 'jsx'],
    });
  }
  return highlighterPromise;
};
