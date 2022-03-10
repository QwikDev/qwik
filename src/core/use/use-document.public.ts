import { getDocument } from '../util/dom';
import { useHostElement } from './use-host-element.public';

/**
 * @public
 */
export function useDocument(): Document {
  return getDocument(useHostElement());
}
