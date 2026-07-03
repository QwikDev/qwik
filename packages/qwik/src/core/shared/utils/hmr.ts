// A devPath/QRL-chunk belongs to `file` when it equals it, has an inspector
// suffix (`:line:col`), a query (`?t=`), or is a segment chunk (`<file>_<segment>.js`).
export const isHmrPathForFile = (hmrPath: string, file: string): boolean =>
  hmrPath === file ||
  hmrPath.startsWith(file + ':') ||
  hmrPath.startsWith(file + '?') ||
  hmrPath.startsWith(file + '_');
