/* eslint-disable */
// @ts-ignore
import Utils from '@typescript-eslint/utils';
import { fileURLToPath } from 'node:url';
import { test } from 'uvu';
import { rules } from './index';

const RuleTester = Utils.ESLintUtils.RuleTester;

const testConfig = {
  parser: '@typescript-eslint/parser',
  env: {
    es6: true,
  },
  parserOptions: {
    tsconfigRootDir: fileURLToPath(new URL('.', import.meta.url)),
    project: ['./tsconfig-tests.json'],
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 2020,
    sourceType: 'module',
  },
};

const ruleTester = new RuleTester(testConfig as any);
test('no-use-after-await', () => {
  ruleTester.run('my-rule', rules['no-use-after-await'] as any, {
    valid: [
      `
      export const HelloWorld = component$(async () => {
          useMethod();
          await something();
          let a;
          a = 2;
          return $(() => {
            return <div>{a}</div>
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
            return <div></div>
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
                <div>
                  {prop}
                </div>
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
                <div>
                  {prop}
                </div>
              );
            });
          });`,
        errors: ['Calling use* methods after await is not safe.'],
      },
    ],
  });
});

test('valid-lexical-scope', () => {
  ruleTester.run('valid-lexical-scope', rules['valid-lexical-scope'], {
    valid: [
      `
      import { component$, SSRStream } from "@builder.io/qwik";
import { Readable } from "stream";

export const RemoteApp = component$(({ name }: { name: string }) => {
  return (
    <>
      <SSRStream>
        {async (stream) => {
          const res = await fetch('path');
          const reader = res.body as any as Readable;
          reader.setEncoding("utf8");

          // Readable streams emit 'data' events once a listener is added.
          reader.on("data", (chunk) => {
            chunk = String(chunk).replace(
              'q:base="/build/"',
            );
            stream.write(chunk);
          });

          return new Promise((resolve) => {
            reader.on("end", () => resolve());
          });
        }}
      </SSRStream>
    </>
  );
});
`,
      `
      export type NoSerialize<T> = (T & { __no_serialize__: true }) | undefined;
      import { useMethod, component$ } from 'stuff';
      export interface Value {
        value: number;
        fn: NoSerialize<() => void>;
        other: Value;
      }
      export function getFn(): NoSerialize<() => void> {
        return () => {};
      }
      export const HelloWorld = component$(() => {
        const state: Value = { value: 12, fn: getFn() };
        useWatch$(() => {
          console.log(state.value);
        });
        return <div></div>
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
          return <div></div>
        });`,
      `export const HelloWorld = component$(() => {
          const getMethod = () => {
            return 'value';
          }
          const useMethod = getMethod();
          useWatch$(() => {
            console.log(useMethod);
          });
          return <div></div>;
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
          return <div></div>;
        });`,
      `
        export const useMethod = () => {
          console.log('');
        }
        export const HelloWorld = component$(() => {
          const foo = 'bar';
          useMethod(foo);
          return <div></div>
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
            return <div></div>;
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
              stuff: new Date(),
              url: new URL(),
              regex: new RegExp("dfdf"),
              u: undefined,
              manu: 'string',
              complex: {
                s: true,
              }
            };
            useWatch$(() => {
              console.log(useMethod, obj);
            });
            return <div></div>;
          });`,
      `
          import { useWatch$ } from '@builder.io/qwik';
          export const HelloWorld = component$(() => {
            async function getValue() {
              return 'ffg';
            }
            const a = getValue();
            return <div onClick$={() => {
              console.log(a);
            }}></div>;
          });`,

      `
  export interface PropFnInterface<ARGS extends any[], RET> {
    (...args: ARGS): Promise<RET>
  }

  export type PropFunction<T extends Function> = T extends (...args: infer ARGS) => infer RET
    ? PropFnInterface<ARGS, RET>
    : never;

  export interface Props {
    method$: PropFunction<() => void>;
  }

  export const HelloWorld = component$((props: Props) => {
    return <div onClick$={async () => {
      await props.method$();
    }}></div>;
  });
      `,
      ``,
      `
import { component$ } from "@builder.io/qwik";

export const version = "0.13";

export default component$(() => {
  return {
    version,
  };
});
`,
      `
        import { component$ } from "@builder.io/qwik";
        
        export interface Props {
          serializableTuple: [string, number, boolean];
        }

        export const HelloWorld = component$((props: Props) => {
          return (
            <button onClick$={() => props.serializableTuple}></button>
          );
        });
      `,
    ],
    invalid: [
      {
        code: `
          const useMethod = 12;
          export const HelloWorld = component$(() => {
            const foo = 'bar';
            useMethod(foo);
            return <div></div>
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
            return <div></div>;
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
            return <div></div>;
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
            return <div></div>;
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
            return <div></div>;
          });`,

        errors: [
          'Identifier ("stuff") can not be captured inside the scope (useWatch$) because it is an instance of the "Stuff" class, which is not serializable. Use a simple object literal instead. Check out https://qwik.builder.io/docs/advanced/optimizer for more details.',
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
            return <div></div>;
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
            return <div></div>;
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
          return <div></div>
        });`,
        errors: [
          'Identifier ("state") can not be captured inside the scope (useWatch$) because "state.value" is a function, which is not serializable. Check out https://qwik.builder.io/docs/advanced/optimizer for more details.',
        ],
      },
      {
        code: `
        import { component$ } from 'stuff';
        export const HelloWorld = component$(() => {
          const click = () => console.log();
          return (
            <button onClick$={click}>
            </button>
          );
        });`,
        errors: [
          'JSX attributes that end with $ can only take an inlined arrow function of a QRL identifier. Make sure the value is created using $()',
        ],
      },
      {
        code: `
        import { component$ } from 'stuff';
        export const HelloWorld = component$(() => {
          let click: string = '';
          return (
            <button onClick$={() => {
              click = '';

            }}>
            </button>
          );
        });`,
        errors: [
          'The value of the identifier ("click") can not be changed once it is captured the scope (onClick$). Check out https://qwik.builder.io/docs/advanced/optimizer for more details.',
        ],
      },
      {
        code: `
        import { component$ } from "@builder.io/qwik";
        
        export interface Props {
          nonserializableTuple: [string, number, boolean, Function];
        }

        export const HelloWorld = component$((props: Props) => {
          return (
            <button onClick$={() => props.nonserializableTuple}></button>
          );
        });`,
        errors: [
          'Identifier ("props") can not be captured inside the scope (onClick$) because "props.nonserializableTuple" is an instance of the "Function" class, which is not serializable. Check out https://qwik.builder.io/docs/advanced/optimizer for more details.',
        ],
      },
    ],
  });
});

export {};
