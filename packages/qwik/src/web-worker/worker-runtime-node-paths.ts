export type RuntimeFsLike = {
  existsSync?: (path: string | URL) => boolean;
};

export const tryParseUrl = (value: string) => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

export const getImportMetaDirUrl = (metaUrl: string) => {
  const moduleUrl = tryParseUrl(metaUrl);
  if (!moduleUrl || moduleUrl.protocol !== 'file:') {
    return null;
  }

  moduleUrl.pathname = moduleUrl.pathname.slice(0, moduleUrl.pathname.lastIndexOf('/') + 1);
  return moduleUrl;
};

export const getPublicBuildPath = (assetUrl: string) => {
  const assetsIndex = assetUrl.lastIndexOf('/assets/');
  if (assetsIndex === -1) {
    return null;
  }

  return `${assetUrl.slice(0, assetsIndex)}/build/`;
};

export const getNodeDistUrl = (metaUrl: string, fsModule?: RuntimeFsLike) => {
  if (!fsModule?.existsSync) {
    return null;
  }

  let currentDirUrl = getImportMetaDirUrl(metaUrl);
  if (!currentDirUrl) {
    return null;
  }

  for (let i = 0; i < 8; i++) {
    const distUrl: URL = new URL('dist/', currentDirUrl);
    if (fsModule.existsSync(distUrl)) {
      return distUrl;
    }

    const parentDirUrl: URL = new URL('../', currentDirUrl);
    if (parentDirUrl.href === currentDirUrl.href) {
      break;
    }
    currentDirUrl = parentDirUrl;
  }

  return null;
};

export const getNodeWorkerUrlFromDist = (assetUrl: string, distUrl: URL) => {
  return new URL(`.${assetUrl}`, distUrl);
};

export const getNodeWorkerQrlBaseUrlFromDist = (assetUrl: string, distUrl: URL) => {
  const publicBuildPath = getPublicBuildPath(assetUrl);
  if (!publicBuildPath) {
    return null;
  }

  return new URL(`.${publicBuildPath}`, distUrl);
};
