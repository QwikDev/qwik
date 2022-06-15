import type { PageAttributes } from '../../runtime/types';
import type { BuildContext } from '../types';
import { getBasename } from './fs';

export function getPageTitle(filePath: string, attrs: PageAttributes) {
  let title = '';
  if (typeof attrs.title === 'string') {
    title = attrs.title!.trim();
  }
  if (title === '') {
    title = getBasename(filePath);
    title = toTitleCase(title.replace(/-/g, ' '));
  }
  return title.trim();
}

export function toTitleCase(str: string) {
  return str.replace(/\w\S*/g, (txt) => {
    return txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase();
  });
}

export function addError(ctx: BuildContext, e: any) {
  ctx.diagnostics.push({
    type: 'error',
    message: String(e.stack || e),
  });
}

export function addWarning(ctx: BuildContext, message: string) {
  ctx.diagnostics.push({
    type: 'warn',
    message: String(message),
  });
}
