/* eslint-disable */
// @ts-ignore
const RuleTester = require('eslint').RuleTester;
import { rules } from './index';

const testConfig = {
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

describe('no-use-after-await', () => {
  const ruleTester = new RuleTester(testConfig);
  ruleTester.run('my-rule', rules['no-use-after-await'], {
    valid: [
      `export const HelloWorld = component$(async () => {
        useMethod();
        await something();
        return $(() => {
          return <Host></Host>
        });
      });`,
      `export const HelloWorld = component$(async () => {
        useMethod();
        await something();
        await stuff();
        return $(() => {
          useHostElement();
          return <Host></Host>
        });
      });`,
    ],
    invalid: [
      {
        code: `export const HelloWorld = component$(async () => {
          await something();
          useMethod();
          return $(() => {
            return (
              <Host>
                {prop}
              </Host>
            );
          });
        });`,
        errors: ['Calling use* methods after await is not safe.'],
      },
      {
        code: `export const HelloWorld = component$(async () => {
          if (stuff) {
            await something();
          }
          useMethod();
          return $(() => {
            return (
              <Host>
                {prop}
              </Host>
            );
          });
        });`,
        errors: ['Calling use* methods after await is not safe.'],
      },
    ],
  });
});

export {};
