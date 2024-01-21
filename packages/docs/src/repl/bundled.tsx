import { version as qwikVersion } from '../../../qwik';
import buildIndexDts from '../../../qwik/dist/build/index.d.ts?url';
import coreCjs from '../../../qwik/dist/core.cjs?url';
import coreDts from '../../../qwik/dist/core.d.ts?url';
import coreMinMjs from '../../../qwik/dist/core.min.mjs?url';
import coreMjs from '../../../qwik/dist/core.mjs?url';
import jsxRuntimeDts from '../../../qwik/dist/jsx-runtime.d.ts?url';
import optimizerCjs from '../../../qwik/dist/optimizer.cjs?url';
import serverCjs from '../../../qwik/dist/server.cjs?url';
import serverDts from '../../../qwik/dist/server.d.ts?url';

import prettierPkgJson from 'prettier/package.json';
import prettierParserHtml from 'prettier/plugins/html.js?url';
import prettierStandaloneJs from 'prettier/standalone.js?url';
import type { BundledFiles } from './types';

export const bundled: BundledFiles = {
  '@builder.io/qwik': {
    version: qwikVersion,
    '/build/index.d.ts': buildIndexDts,
    '/core.cjs': coreCjs,
    '/core.d.ts': coreDts,
    '/core.min.mjs': coreMinMjs,
    '/core.mjs': coreMjs,
    '/jsx-runtime.d.ts': jsxRuntimeDts,
    '/optimizer.cjs': optimizerCjs,
    '/server.cjs': serverCjs,
    '/server.d.ts': serverDts,
  },
  prettier: {
    version: prettierPkgJson.version,
    '/plugins/html.js': prettierParserHtml,
    '/standalone.js': prettierStandaloneJs,
  },
};

export const getNpmCdnUrl = (
  bundled: BundledFiles,
  pkgName: string,
  pkgVersion: string,
  pkgPath: string
) => {
  if (pkgVersion === 'bundled') {
    const files = bundled[pkgName];
    if (files) {
      pkgVersion = files.version;
      const url = files[pkgPath];
      if (url) {
        return url;
      }
    } else {
      // fall back to latest
      pkgVersion = '';
    }
  }
  return `https://cdn.jsdelivr.net/npm/${pkgName}${pkgVersion ? '@' + pkgVersion : ''}${pkgPath}`;
};
