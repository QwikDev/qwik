import { BUILD_MODE_OPTIONS, ENTRY_STRATEGY_OPTIONS } from './repl-options';
import { compressSync, decompressSync, strFromU8, strToU8 } from 'fflate';

export const parsePlaygroundShareUrl = (shareable: string) => {
  if (typeof shareable === 'string' && shareable.length > 0) {
    try {
      const params = new URLSearchParams(shareable);
      const data: PlaygroundShareUrl = {
        version: '',
        buildMode: 'development',
        entryStrategy: 'hook',
        files: [],
      };

      const version = params.get('version')!;
      if (typeof version === 'string' && version.split('.').length > 2) {
        data.version = version;
      }

      const buildMode = params.get('buildMode')!;
      if (BUILD_MODE_OPTIONS.includes(buildMode)) {
        data.buildMode = buildMode;
      }

      const entryStrategy = params.get('entryStrategy')!;
      if (ENTRY_STRATEGY_OPTIONS.includes(entryStrategy)) {
        data.entryStrategy = entryStrategy;
      }

      if (params.has('files')) {
        // Old URLs that didn't compress
        // the files, used the `files` key
        const filesBase64 = params.get('files')!;
        if (typeof filesBase64 === 'string') {
          data.files = parseUncompressedFiles(filesBase64);
        }
      } else if (params.has('f')) {
        // New URLs that didn't compress
        // the files, use the `f` key
        const filesBase64 = params.get('f');
        if (typeof filesBase64 === 'string') {
          data.files = parseCompressedFiles(filesBase64);
        }
      }
      if (data.files.length > 0) {
        return data;
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  }
};

export const createPlaygroundShareUrl = (data: PlaygroundShareUrl, pathname = '/playground/') => {
  const params = new URLSearchParams();
  params.set('version', data.version);
  params.set('buildMode', data.buildMode);
  params.set('entryStrategy', data.entryStrategy);

  const filesStr = JSON.stringify(data.files);
  const filesBuf = strToU8(filesStr);
  const compressedUint8Array = compressSync(filesBuf);
  const compressedString = strFromU8(compressedUint8Array, true);
  const filesBase64 = btoa(compressedString);

  params.set('f', filesBase64);

  return `${pathname}#${params.toString()}`;
};

function parseUncompressedFiles(filesBase64: string) {
  const encoded = atob(filesBase64);
  const filesStr = decodeURIComponent(encoded);
  const files = JSON.parse(filesStr);

  if (Array.isArray(files)) {
    return files.filter((f) => typeof f.code === 'string' && typeof f.path === 'string');
  }

  return [];
}

function parseCompressedFiles(filesBase64: string) {
  const encoded = atob(filesBase64);
  const compressedUint8Array = strToU8(encoded, true);

  let filesStr = '';

  try {
    const filesBuf = decompressSync(compressedUint8Array);
    filesStr = strFromU8(filesBuf);
  } catch (error) {
    // Treat string as not compressed
    filesStr = decodeURIComponent(encoded);
  }

  const files = JSON.parse(filesStr);

  if (Array.isArray(files)) {
    return files.filter((f) => typeof f.code === 'string' && typeof f.path === 'string');
  }

  return [];
}

interface PlaygroundShareUrl {
  version: any;
  buildMode: any;
  entryStrategy: any;
  files: any[];
}
