'use strict';
exports.__esModule = true;
/* eslint-disable */
// @ts-ignore
var RuleTester = require('eslint').RuleTester;
var index_1 = require('./index');
var testConfig = {
  env: {
    es6: true,
  },
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 2021,
    sourceType: 'module',
  },
};
describe('no-use-after-await', function () {
  var ruleTester = new RuleTester(testConfig);
  ruleTester.run('my-rule', index_1.rules['no-use-after-await'], {
    valid: [
      'export const HelloWorld = component$(async () => {\n        useMethod();\n        await something();\n        return $(() => {\n          return <Host></Host>\n        });\n      });',
      'export const HelloWorld = component$(async () => {\n        useMethod();\n        await something();\n        await stuff();\n        return $(() => {\n          useHostElement();\n          return <Host></Host>\n        });\n      });',
    ],
    invalid: [
      {
        code: 'export const HelloWorld = component$(async () => {\n          await something();\n          useMethod();\n          return $(() => {\n            return (\n              <Host>\n                {prop}\n              </Host>\n            );\n          });\n        });',
        errors: ['Calling use* methods after await is not safe.'],
      },
      {
        code: 'export const HelloWorld = component$(async () => {\n          if (stuff) {\n            await something();\n          }\n          useMethod();\n          return $(() => {\n            return (\n              <Host>\n                {prop}\n              </Host>\n            );\n          });\n        });',
        errors: ['Calling use* methods after await is not safe.'],
      },
    ],
  });
});
