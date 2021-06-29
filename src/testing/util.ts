import { pathToFileURL } from 'url';
import { isPromise } from '../core/util/promises';

export function toFileUrl(filePath: string) {
  return pathToFileURL(filePath).href;
}

export { isPromise };
