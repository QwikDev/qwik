'use strict';
exports.__esModule = true;
exports.configs = exports.rules = void 0;
var noUseAfterAwait_1 = require('./lib/noUseAfterAwait');
exports.rules = {
  'no-use-after-await': noUseAfterAwait_1.noUseAfterAwait,
};
exports.configs = {
  recommended: {
    plugins: ['qwik'],
    rules: {
      'qwik/no-use-after-await': 'error',
    },
  },
};
