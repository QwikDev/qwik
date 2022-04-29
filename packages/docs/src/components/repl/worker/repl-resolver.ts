import type { Plugin } from 'rollup';
import type { ReplInputOptions } from '../types';
import { ctx } from './constants';
import { getRuntimeBundle } from './utils';

export const replResolver = (options: ReplInputOptions, buildMode: 'client' | 'ssr'): Plugin => {
  return {
    name: 'repl-resolver',

    resolveId(id, importer) {
      if (!importer) {
        return id;
      }
      if (id === '@builder.io/qwik' || id === '@builder.io/qwik/jsx-runtime') {
        return '\0qwikCore';
      }
      if (id === '@builder.io/qwik/server') {
        return '\0qwikServer';
      }
      return {
        id,
        external: true,
      };
    },

    load(id) {
      const input = options.srcInputs.find((i) => i.path === id);
      if (input) {
        return input;
      }
      if (buildMode === 'ssr') {
        if (id === '\0qwikCore') {
          return getRuntimeBundle('qwikCore');
        }
        if (id === '\0qwikServer') {
          return getRuntimeBundle('qwikServer');
        }
      }
      if (id === '\0qwikCore') {
        return ctx.coreEsmCode;
      }
      return null;
    },
  };
};
