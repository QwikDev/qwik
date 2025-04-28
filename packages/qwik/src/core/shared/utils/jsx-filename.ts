import type { DevJSX, JSXNodeInternal } from '../jsx/types/jsx-node';
import { qwikInspectorAttr } from './markers';

export function appendQwikInspectorAttribute(
  jsx: JSXNodeInternal,
  qwikInspectorAttrValue: string | null
) {
  if (qwikInspectorAttrValue && (!jsx.constProps || !(qwikInspectorAttr in jsx.constProps))) {
    (jsx.constProps ||= {})[qwikInspectorAttr] = qwikInspectorAttrValue;
  }
}

export function getFileLocationFromJsx(jsxDev?: DevJSX): string | null {
  if (!jsxDev) {
    return null;
  }
  const sanitizedFileName = jsxDev.fileName?.replace(/\\/g, '/');
  if (sanitizedFileName) {
    return `${sanitizedFileName}:${jsxDev.lineNumber}:${jsxDev.columnNumber}`;
  }
  return null;
}
