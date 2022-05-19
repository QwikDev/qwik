import { getDocument } from '../util/dom';
import { isDocument } from '../util/element';
import { QContainerAttr } from '../util/markers';
import { qDev } from '../util/qdev';
import { escapeText, snapshotState } from './store';
import type { SnapshotState, SnapshotResult } from './store';

// <docs markdown="../readme.md#pauseContainer">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#pauseContainer instead)
/**
 * Serialize the current state of the application into DOM
 *
 * @alpha
 */
// </docs>
export function pauseContainer(elmOrDoc: Element | Document): SnapshotResult {
  const doc = getDocument(elmOrDoc);
  const containerEl = isDocument(elmOrDoc) ? elmOrDoc.documentElement : elmOrDoc;
  const parentJSON = isDocument(elmOrDoc) ? elmOrDoc.body : containerEl;
  const data = snapshotState(containerEl);
  const script = doc.createElement('script');
  script.setAttribute('type', 'qwik/json');
  script.textContent = escapeText(JSON.stringify(data.state, undefined, qDev ? '  ' : undefined));
  parentJSON.appendChild(script);
  containerEl.setAttribute(QContainerAttr, 'paused');
  return data;
}

export type { SnapshotState, SnapshotResult };
