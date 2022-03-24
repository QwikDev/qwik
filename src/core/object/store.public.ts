import { getDocument } from '../util/dom';
import { isDocument } from '../util/element';
import { qDev } from '../util/qdev';
import { snapshotState } from './store';

/**
 * Serialize the current state of the application into DOM
 *
 * @public
 */
export function snapshot(elmOrDoc: Element | Document) {
  const doc = getDocument(elmOrDoc);
  const data = snapshotState(elmOrDoc);
  const parentJSON = isDocument(elmOrDoc) ? elmOrDoc.body : elmOrDoc;
  const script = doc.createElement('script');
  script.setAttribute('type', 'qwik/json');
  script.textContent = JSON.stringify(data, undefined, qDev ? '  ' : undefined);
  parentJSON.appendChild(script);
}
