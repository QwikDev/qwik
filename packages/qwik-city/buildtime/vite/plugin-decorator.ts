import { babel } from '@rollup/plugin-babel';
import type { QwikCityVitePluginOptions } from './types';

const ENV = 'development';

const defaultOptions: QwikCityVitePluginOptions = {
  include: 'src/**',
  exclude: 'node_modules/**',
  extensions: ['.js', '.jsx', '.es6', '.es', '.mjs', '.ts', '.tsx'],
};

export function undecoratePlugin(option: QwikCityVitePluginOptions = defaultOptions) {
  const { NODE_ENV } = process.env;
  let plugins = [];
  if (NODE_ENV === ENV) {
    plugins.push(
      babel({
        include: option.include,
        exclude: option.exclude,
        babelHelpers: 'bundled',
        extensions: option.extensions,
        plugins: [
          ['@babel/plugin-proposal-decorators', { legacy: true }],
          ['@babel/plugin-proposal-class-properties', { loose: true }],
        ],
      })
    );
  } else {
    plugins = [];
  }
  return plugins;
}
