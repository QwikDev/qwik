import { getDocument } from '../util/dom';
import { isDocument } from '../util/element';
import { QContainerAttr } from '../util/markers';
import { qDev } from '../util/qdev';
import { snapshotState } from './store';

/**
 * Serialize the current state of the application into DOM
 *
 * @public
 */
export function pauseContainer(elmOrDoc: Element | Document) {
  const doc = getDocument(elmOrDoc);
  const containerEl = isDocument(elmOrDoc) ? elmOrDoc.documentElement : elmOrDoc;
  const parentJSON = isDocument(elmOrDoc) ? elmOrDoc.body : containerEl;
  const data = snapshotState(containerEl);
  const script = doc.createElement('script');
  script.setAttribute('type', 'qwik/json');
  script.textContent = JSON.stringify(data, undefined, qDev ? '  ' : undefined);
  parentJSON.appendChild(script);
  containerEl.setAttribute(QContainerAttr, 'paused');
}
