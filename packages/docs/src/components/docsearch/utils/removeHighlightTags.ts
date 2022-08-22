import type { DocSearchHit, InternalDocSearchHit } from '../types';

const regexHighlightTags = /(<mark>|<\/mark>)/g;
const regexHasHighlightTags = RegExp(regexHighlightTags.source);

export function removeHighlightTags(hit: DocSearchHit | InternalDocSearchHit): string {
  const internalDocSearchHit = hit as InternalDocSearchHit;

  if (!internalDocSearchHit.__docsearch_parent && !hit._highlightResult) {
    return hit.hierarchy.lvl0;
  }

  const { value } =
    (internalDocSearchHit.__docsearch_parent
      ? internalDocSearchHit.__docsearch_parent?._highlightResult?.hierarchy?.lvl0
      : hit._highlightResult?.hierarchy?.lvl0) || {};

  return value && regexHasHighlightTags.test(value) ? value.replace(regexHighlightTags, '') : value;
}
