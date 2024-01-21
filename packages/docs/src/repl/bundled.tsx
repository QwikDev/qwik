import { version as qwikVersion } from '../../../qwik';

import prettierPkgJson from 'prettier/package.json';
import prettierParserHtml from 'prettier/plugins/html.js?url';
import prettierStandaloneJs from 'prettier/standalone.js?url';
import type { BundledFiles } from './types';
import { qwikFiles } from './qwikFiles';

export const bundled: BundledFiles = {
  '@builder.io/qwik': {
    version: qwikVersion,
    ...Object.fromEntries(
      qwikFiles.map((f) => [`/${f}`, `${import.meta.env.BASE_URL}repl/bundled/qwik/${f}`])
    ),
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
