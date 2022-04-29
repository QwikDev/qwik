import type { OutputAsset, OutputChunk } from 'rollup';
import type { ReplModuleOutput } from '../types';

export const getNpmCdnUrl = (pkgName: string, pkgVersion: string, pkgPath: string) =>
  new URL(`https://cdn.jsdelivr.net/npm/${pkgName}${pkgVersion ? '@' + pkgVersion : ''}${pkgPath}`)
    .href;

export const getRuntimeBundle = (runtimeBundle: string) => {
  const exportKeys = Object.keys((self as any)[runtimeBundle]);
  const code = `
    const { ${exportKeys.join(', ')} } = self.${runtimeBundle};
    export { ${exportKeys.join(', ')} };
  `;
  return code;
};

export const getOutput = (o: OutputChunk | OutputAsset) => {
  const f: ReplModuleOutput = {
    path: o.fileName,
    code: '',
    isEntry: false,
    size: '',
  };
  if (o.type === 'chunk') {
    f.code = o.code || '';
    f.isEntry = o.isDynamicEntry;
  } else if (o.type === 'asset') {
    f.code = String(o.source || '');
    f.isEntry = false;
  }
  f.size = `${f.code.length} B`;
  return f;
};
