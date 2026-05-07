export interface ServerOnlyModuleOptions {
  rootDir?: string | null;
  srcDir?: string | null;
}

const SERVER_ONLY_FILE_REGEX = /\.server\.[cm]?[jt]sx?$/;
const SERVER_ONLY_QRL_REGEX = /\.server\.[cm]?[jt]sx?_/;
const SERVER_DIR_SEGMENT_REGEX = /(^|\/)server(\/|$)/;

export const mightContainServerOnlyImport = (code: string): boolean => {
  return (
    code.includes('.server') ||
    code.includes('/server') ||
    code.includes('\\server') ||
    code.includes('server/') ||
    code.includes('server\\')
  );
};

const normalizeServerOnlyPath = (pathId: string) =>
  pathId.replace(/\\/g, '/').replace(/^\/@fs\//, '');

const toComparablePath = (pathId: string, opts: ServerOnlyModuleOptions): string => {
  const normalizedPath = normalizeServerOnlyPath(pathId);
  const normalizedRootDir = opts.rootDir
    ? normalizeServerOnlyPath(opts.rootDir).replace(/\/+$/, '')
    : '';
  if (
    normalizedRootDir &&
    (normalizedPath === normalizedRootDir || normalizedPath.startsWith(normalizedRootDir + '/'))
  ) {
    return normalizedPath;
  }
  if (
    normalizedRootDir &&
    normalizedPath.startsWith('/') &&
    !normalizedPath.startsWith('//') &&
    !/^[a-zA-Z]:\//.test(normalizedPath)
  ) {
    return `${normalizedRootDir}${normalizedPath}`;
  }
  return normalizedPath;
};

export const isServerOnlyFile = (pathId: string): boolean => {
  const normalizedPath = normalizeServerOnlyPath(pathId);
  return SERVER_ONLY_FILE_REGEX.test(normalizedPath) || SERVER_ONLY_QRL_REGEX.test(normalizedPath);
};

export const isInSrcServerDir = (
  pathId: string,
  srcDirOrOpts?: string | null | ServerOnlyModuleOptions
): boolean => {
  const opts =
    typeof srcDirOrOpts === 'string' || srcDirOrOpts == null
      ? { srcDir: srcDirOrOpts }
      : srcDirOrOpts;
  if (!opts.srcDir) {
    return false;
  }
  const normalizedPath = toComparablePath(pathId, opts);
  const normalizedSrcDir = normalizeServerOnlyPath(opts.srcDir).replace(/\/+$/, '');
  if (!normalizedPath.startsWith(normalizedSrcDir + '/')) {
    return false;
  }
  return SERVER_DIR_SEGMENT_REGEX.test(normalizedPath.slice(normalizedSrcDir.length + 1));
};

export const isServerOnlyModule = (pathId: string, opts: ServerOnlyModuleOptions): boolean =>
  isServerOnlyFile(pathId) || isInSrcServerDir(pathId, opts);

export const createServerOnlyImportError = (pathId: string, importerId?: string | null): string => {
  const importer = importerId ? `\nImporter: ${importerId}` : '';
  return (
    `Server-only module cannot be imported by client code.\n\n` +
    `Server-only module: ${pathId}${importer}\n\n` +
    `Files named \`.server.*\` or placed under \`src/**/server/**\` are excluded from ` +
    `client bundles. Move this import behind SSR-only route loaders, actions, endpoint handlers, ` +
    `or expose the operation through an intentional \`server$\` API.`
  );
};
