export function getBuildFile(isSSR: boolean) {
  return `
export const isServer = ${isSSR};
export const isBrowser = ${!isSSR};
`;
}

export function removeQueryParams(id: string) {
  const [filteredId] = id.split('?');
  return filteredId;
}

export function forceJSExtension(path: any, id: string) {
  const ext = path.extname(id);
  if (ext === '') {
    return id + '.js';
  }
  if (EXTS[ext]) {
    return removeExtension(id) + '.js';
  }
  return id;
}

function removeExtension(id: string) {
  return id.split('.').slice(0, -1).join('.');
}

const EXTS: { [ext: string]: boolean } = { '.jsx': true, '.ts': true, '.tsx': true };

export const QWIK_BUILD_ID = '@builder.io/qwik/build';

export const QWIK_CORE_ID = '@builder.io/qwik';

export const QWIK_JSX_RUNTIME_ID = '@builder.io/qwik/jsx-runtime';

export const ENTRY_SERVER_DEFAULT = '/src/entry.server.tsx';

export const MAIN_DEFAULT = '/src/main.tsx';
