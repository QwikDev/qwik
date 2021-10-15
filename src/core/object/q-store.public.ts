import { QStore_dehydrate } from './q-store';

//TODO(misko): Add public DOCS.
//TODO(misko): Rename to qDehydrate
/**
 * @public
 */
export function qDehydrate(document: Document): void {
  QStore_dehydrate(document);
}
