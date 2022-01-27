import { QStore_dehydrate } from './store';

//TODO(misko): Add public DOCS.
//TODO(misko): Rename to dehydrate
/**
 * @public
 */
export function dehydrate(document: Document): void {
  QStore_dehydrate(document);
}
