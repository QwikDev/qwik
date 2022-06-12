/* eslint-disable */
// @ts-ignore
const RuleTester = require('@typescript-eslint/utils').ESLintUtils.RuleTester;
import { rules } from './index';

const testConfig = {
  parser: '@typescript-eslint/parser',
  env: {
    es6: true,
  },
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ['./tsconfig-tests.json'],
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 2021,
    sourceType: 'module',
  },
};

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

ruleTester.run('valid-lexical-scope', rules['valid-lexical-scope'], {
  valid: [
    `
      import { useMethod, component$ } from 'stuff';
      export const HelloWorld = component$(() => {
        const bar = () => 'bar';
        const foo = 'bar';
        useMethod(foo, bar);
        return <Host></Host>
      });`,
    `export const HelloWorld = component$(() => {
        const getMethod = () => {
          return 'value';
        }
        const useMethod = getMethod();
        useWatch$(() => {
          console.log(useMethod);
        });
        return <Host></Host>;
      });`,

    `export const HelloWorld = component$(() => {
        const getMethod = () => {
          return {
            value: 'string',
            other: 12,
            foo: {
              bar: 'string'
            }
          };
        }
        const useMethod = getMethod();
        useWatch$(() => {
          console.log(useMethod);
        });
        return <Host></Host>;
      });`,
    `
      export const useMethod = () => {
        console.log('');
      }
      export const HelloWorld = component$(() => {
        const foo = 'bar';
        useMethod(foo);
        return <Host></Host>
      });`,
  ],
  invalid: [
    {
      code: `
        const useMethod = () => {
          console.log('');
        }
        export const HelloWorld = component$(() => {
          const foo = 'bar';
          useMethod(foo);
          return <Host></Host>
        });`,
      errors: ['Referenced invalid identifier'],
    },
    {
      code: `
        export const HelloWorld = component$(() => {
          const getMethod = () => {
            return () => {};
          }
          const useMethod = getMethod();
          useWatch$(() => {
            console.log(useMethod);
          });
          return <Host></Host>;
        });`,
      errors: ['Referenced invalid identifier'],
    },
    {
      code: `
        export const HelloWorld = component$(() => {
          const getMethod = () => {
            return Promise.resolve();
          }
          const useMethod = getMethod();
          const obj = {
            stuff: 12,
            b: false,
            n: null,
            u: undefined,
            manu: 'string',
            complex: {
              s: true,
            }
          };
          useWatch$(() => {
            console.log(useMethod, obj);
          });
          return <Host></Host>;
        });`,

      errors: ['Referenced invalid identifier'],
    },
    {
      code: `
        export const HelloWorld = component$(() => {
          function useMethod() {
            console.log('stuff');
          };
          useWatch$(() => {
            console.log(useMethod);
          });
          return <Host></Host>;
        });`,

      errors: ['Referenced invalid identifier'],
    },
    {
      code: `
        export const HelloWorld = component$(() => {
          class Stuff { }
          useWatch$(() => {
            console.log(new Stuff(), useMethod);
          });
          return <Host></Host>;
        });`,

      errors: ['Referenced invalid identifier'],
    },
    {
      code: `
        export const HelloWorld = component$(() => {
          class Stuff { }
          const stuff = new Stuff();
          useWatch$(() => {
            console.log(stuff, useMethod);
          });
          return <Host></Host>;
        });`,

      errors: ['Referenced invalid identifier'],
    },
    {
      code: `
        export const HelloWorld = component$(() => {
          const obj = {
            stuff: new Date(),
            b: false,
            n: null,
            u: undefined,
            manu: 'string',
            complex: {
              s: true,
            }
          };
          useWatch$(() => {
            console.log(obj, stuff, useMethod);
          });
          return <Host></Host>;
        });`,

      errors: ['Referenced invalid identifier'],
    },
  ],
});

export {};
