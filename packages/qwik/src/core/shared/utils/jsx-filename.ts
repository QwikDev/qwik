import type { DevJSX } from '../jsx/types/jsx-node';

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
