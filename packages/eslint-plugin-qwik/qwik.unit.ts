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
    `
    export const HelloWorld = component$(async () => {
        useMethod();
        await something();
        return $(() => {
          return <Host></Host>
        });
      });
      const A = () => { console.log('A') };
      export const B = () => {
        A();
      }
      `,
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
    export type NoSerialize<T> = (T & { __no_serialize__: true }) | undefined;
    import { useMethod, component$ } from 'stuff';
    export interface Value {
      value: number;
      fn: NoSerialize<() => void>;
    }
    export function getFn(): NoSerialize<() => void> {
      return () => {};
    }
    export const HelloWorld = component$(() => {
      const state: Value = { value: 12, fn: getFn() };
      useWatch$(() => {
        console.log(state.value);
      });
      return <Host></Host>
    });`,
    `
      import { useMethod, component$ } from 'stuff';
      interface Value {
        value: 12;
      }
      type NullValue = Value | null;

      export const HelloWorld = component$(() => {
        const bar = () => 'bar';
        const foo = 'bar';
        const a: Value = {value: 12};
        const b: NullValue = null;
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
            values: ['23', 22, {prop: number}],
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
    `
        import { useWatch$ } from '@builder.io/qwik';
        export const HelloWorld = component$(() => {
          function getValue(): number | string | null | undefined | { prop: string } {
            return window.aaa;
          }
          const a = getValue();
          useWatch$(() => {
            console.log(a);
          });
          return <Host></Host>;
        });`,
    `
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
    `
        import { useWatch$ } from '@builder.io/qwik';
        export const HelloWorld = component$(() => {
          async function getValue() {
            return 'ffg';
          }
          const a = getValue();
          return <Host onClick$={() => {
            console.log(a);
          }}></Host>;
        });`,
  ],
  invalid: [
    {
      code: `
        const useMethod = 12;
        export const HelloWorld = component$(() => {
          const foo = 'bar';
          useMethod(foo);
          return <Host></Host>
        });`,
      errors: [
        'Identifier ("useMethod") can not be captured inside the scope (component$) because it\'s declared at the root of the module and it is not exported. Add export. Check out https://qwik.builder.io/docs/advanced/optimizer for more details.',
      ],
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
      errors: [
        'Identifier ("useMethod") can not be captured inside the scope (useWatch$) because it is a function, which is not serializable. Check out https://qwik.builder.io/docs/advanced/optimizer for more details.',
      ],
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

      errors: [
        'Identifier ("useMethod") can not be captured inside the scope (useWatch$) because it is a function, which is not serializable. Check out https://qwik.builder.io/docs/advanced/optimizer for more details.',
      ],
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

      errors: [
        'Identifier ("Stuff") can not be captured inside the scope (useWatch$) because it is a class constructor, which is not serializable. Check out https://qwik.builder.io/docs/advanced/optimizer for more details.',
      ],
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

      errors: [
        'Identifier ("stuff") can not be captured inside the scope (useWatch$) because it is an instance of the "Stuff" class, which is not serializable. Use a simple object literal instead. Check out https://qwik.builder.io/docs/advanced/optimizer for more details.',
      ],
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

      errors: [
        'Identifier ("obj") can not be captured inside the scope (useWatch$) because "obj.stuff" is an instance of the "Date" class, which is not serializable. Check out https://qwik.builder.io/docs/advanced/optimizer for more details.',
      ],
    },
    {
      code: `
        import { useWatch$ } from '@builder.io/qwik';
        export const HelloWorld = component$(() => {
          const a = Symbol();
          useWatch$(() => {
            console.log(a);
          });
          return <Host></Host>;
        });`,

      errors: [
        'Identifier ("a") can not be captured inside the scope (useWatch$) because it is Symbol, which is not serializable. Check out https://qwik.builder.io/docs/advanced/optimizer for more details.',
      ],
    },
    {
      code: `
        import { useWatch$ } from '@builder.io/qwik';
        export const HelloWorld = component$(() => {
          function getValue() {
            if (Math.random() < 0.5) {
              return 'string';
            } else {
              return () => { console.log() };
            }
          }
          const a = getValue();
          useWatch$(() => {
            console.log(a);
          });
          return <Host></Host>;
        });`,

      errors: [
        'Identifier ("a") can not be captured inside the scope (useWatch$) because it is a function, which is not serializable. Check out https://qwik.builder.io/docs/advanced/optimizer for more details.',
      ],
    },
    {
      code: `
      import { useMethod, component$ } from 'stuff';
      export interface Value {
        value: () => void;
      }
      export const HelloWorld = component$(() => {
        const state: Value = { value: () => console.log('thing') };
        useWatch$(() => {
          console.log(state.value);
        });
        return <Host></Host>
      });`,
      errors: [
        'Identifier ("state") can not be captured inside the scope (useWatch$) because "state.value" is a function, which is not serializable. Check out https://qwik.builder.io/docs/advanced/optimizer for more details.',
      ],
    },
  ],
});

export {};
