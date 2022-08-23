import type { DocSearchHit } from './DocSearchHit';

export type InternalDocSearchHit = DocSearchHit & {
  __docsearch_parent: InternalDocSearchHit | null;
  __autocomplete_id: number;
};
