/* eslint-disable */
// @ts-ignore
import { RuleTester } from '@typescript-eslint/rule-tester';
import { fileURLToPath } from 'node:url';
import { rules } from './index';
import { suite } from 'uvu';

const lintSuite = suite('lint');
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

RuleTester.afterAll = lintSuite.after;
RuleTester.it = lintSuite;
RuleTester.itOnly = lintSuite.only;
RuleTester.describe = function (_, method) {
  return method.call(this);
};

const ruleTester = new RuleTester(testConfig as any);
ruleTester.run('use-method-usage', rules['use-method-usage'] as any, {
  valid: [
    `
export function useSession1() {
  useContext();
}
export function useSession2() {
  return useContext();
}
export function useSession3() {
  return useContext().value;
}
`,
    `
export const useSession1 = () => {
  useContext();
}

export const useSession2 = () => {
  return useContext();
}

export const useSession3 = () => useContext();

export const useSession4 = () => useContext().value;

export const useSession5 = () => useContext().value + 10;

`,

    `
export const useSession1 = () => {
  useContext()?.value;
}

export const useSession2 = () => {
  return useContext()?.value;
}

export const useSession3 = () => useContext()?.value;

export const useSession4 = () => useContext()?.value;

export const useSession5 = () => useContext()?.value; + 10;

`,
    `
export const HelloWorld = component$(async () => {
  const [todoForm, { Form, Field, FieldArray }] = useForm<TodoForm>({
    loader: useFormLoader(),
    action: useFormAction(),
    validate: zodForm$(todoSchema),
  });

  });
  `,
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
            return <div></div>
          });
        });`,
    `export const HelloWorld = component$(async () => {
          const test = useFunction() as string;

          });
          `,
    `export const InsideTask = component$(() => {
          const mySig = useSignal(0);
          useTask$(async function initTask(){
            if (isServer){
              await fetch('/url');
            }
          })

          useTask$(({track})=>{
            track(()=> mySig.value);
          })
          return <div></div>;
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
      errors: [{ messageId: 'use-after-await' }],
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
      errors: [{ messageId: 'use-after-await' }],
    },

    {
      code: `export function noUseSession() {
          useContext();
        }`,
      errors: [{ messageId: 'use-wrong-function' }],
    },
    {
      code: `export const noUseSession = () => {
          useContext();
        }`,
      errors: [{ messageId: 'use-wrong-function' }],
    },
    {
      code: `export const noUseSession = () => {
         return useContext();
        }`,
      errors: [{ messageId: 'use-wrong-function' }],
    },
    {
      code: `export const noUseSession = () => useContext();`,
      errors: [{ messageId: 'use-wrong-function' }],
    },
    {
      code: `export const noUseSession = () => useContext().value;`,
      errors: [{ messageId: 'use-wrong-function' }],
    },
    {
      code: `export const noUseSession = () => {
         return useContext();
        }`,
      errors: [{ messageId: 'use-wrong-function' }],
    },
  ],
});
ruleTester.run('valid-lexical-scope', rules['valid-lexical-scope'], {
  valid: [
    `
      import { component$, useTask$, useSignal } from '@builder.io/qwik';
      enum Color {
        Red,
        Blue,
        Green,
      }

      export default component$(() => {
        const color: Color = useSignal({ color: Color.Red })

        useTask$(() => {
          color.value.color = Color.Blue
        });
        return <></>
      })
      `,
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
        useTask$(() => {
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
          useTask$(() => {
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
          useTask$(() => {
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
          import { useTask$ } from '@builder.io/qwik';
          export const HelloWorld = component$(() => {
            function getValue(): number | string | null | undefined | { prop: string } {
              return window.aaa;
            }
            const a = getValue();
            useTask$(() => {
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
            useTask$(() => {
              console.log(useMethod, obj);
            });
            return <div></div>;
          });`,
    `
          import { useTask$ } from '@builder.io/qwik';
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
    method1$: PropFunction<() => void>;
    method2$: PropFunction<() => void> | null;
  }

  export const HelloWorld = component$(({method$, method1$, method2$, method3$}: Props) => {
    return <div
     onKeydown$={method$}
     onKeydown1$={method1$}
     onKeydown2$={method2$}
     onClick$={async () => {
      await method$();
    }}></div>;
  });
      `,
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
    `
      import { component$ } from "@builder.io/qwik";

      export const HelloWorld = component$(({onClick}: any) => {
        return (
          <button onClick$={onClick}></button>
        );
      });
    `,
    `
          const useMethod = 12;
          export const HelloWorld = component$(() => {
            const foo = 'bar';
            useMethod(foo);
            return <div></div>
          });`,
    `
      import {Component, component$, useStore} from '@builder.io/qwik';
      export const PopupManager = component$(() => {
        const popup = useStore({
            component: null as null | Component<any>,
            props: null as any,
            visible: false,
            x: 0,
            y: 0,
        });
        return (
            <div
                document:onMouseEnter$={(e) => {
                popup.visible = true;
            }}
                document:onMouseLeave$={(e) => {
                popup.visible = true;
            }}
            >
            </div>
        );
      });
    `,
  ],
  invalid: [
    {
      code: `
          export const HelloWorld = component$(() => {
            const getMethod = () => {
              return () => {};
            }
            const useMethod = getMethod();
            useTask$(() => {
              console.log(useMethod);
            });
            return <div></div>;
          });`,
      errors: [{ messageId: 'referencesOutside' }],
    },
    {
      code: `
          export const HelloWorld = component$(() => {
            let startX: number | undefined = 0;

            const handleMouseDown = $((e: QwikMouseEvent) => {
              console.log('working');
              startX = e.pageX - divRef.value!.offsetLeft;
            });
            return <div
              onMouseDown$={handleMouseDown}
            ></div>;
          });`,
      errors: [{ messageId: 'mutableIdentifier' }],
    },
    {
      code: `
          export const HelloWorld = component$(() => {
            function useMethod() {
              console.log('stuff');
            };
            useTask$(() => {
              console.log(useMethod);
            });
            return <div></div>;
          });`,

      errors: [{ messageId: 'referencesOutside' }],
    },
    {
      code: `
          export const HelloWorld = component$(() => {
            class Stuff { }
            useTask$(() => {
              console.log(new Stuff(), useMethod);
            });
            return <div></div>;
          });`,

      errors: [{ messageId: 'referencesOutside' }],
    },
    {
      code: `
          export const HelloWorld = component$(() => {
            class Stuff { }
            const stuff = new Stuff();
            useTask$(() => {
              console.log(stuff, useMethod);
            });
            return <div></div>;
          });`,

      errors: [{ messageId: 'referencesOutside' }],
    },
    {
      code: `
          import { useTask$ } from '@builder.io/qwik';
          export const HelloWorld = component$(() => {
            const a = Symbol();
            useTask$(() => {
              console.log(a);
            });
            return <div></div>;
          });`,

      errors: [{ messageId: 'referencesOutside' }],
    },
    {
      code: `
        import { component$, useTask$, useSignal } from '@builder.io/qwik';

        export default component$(() => {
          const color: Color = useSignal({ color: Color.Red })
          enum Color {
            Red,
            Blue,
            Green,
          }
          useTask$(() => {
            color.value.color = Color.Blue
          });
          return <></>
        })`,
      errors: [{ messageId: 'referencesOutside' }],
    },
    {
      code: `
          import { useTask$ } from '@builder.io/qwik';
          export const HelloWorld = component$(() => {
            function getValue() {
              if (Math.random() < 0.5) {
                return 'string';
              } else {
                return () => { console.log() };
              }
            }
            const a = getValue();
            useTask$(() => {
              console.log(a);
            });
            return <div></div>;
          });`,

      errors: [{ messageId: 'referencesOutside' }],
    },
    {
      code: `
        import { useMethod, component$ } from 'stuff';
        export interface Value {
          value: () => void;
        }
        export const HelloWorld = component$(() => {
          const state: Value = { value: () => console.log('thing') };
          useTask$(() => {
            console.log(state.value);
          });
          return <div></div>
        });`,
      errors: [{ messageId: 'referencesOutside' }],
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
        {
          messageId: 'invalidJsxDollar',
        },
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
        {
          messageId: 'mutableIdentifier',
        },
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
      errors: [{ messageId: 'referencesOutside' }],
    },
  ],
});

ruleTester.run('jsx-img', rules['jsx-img'], {
  valid: [
    `<img width={200} height={200} />`,
    `<img width="200" height="200" />`,
    `<img {...props}/>`,
  ],
  invalid: [
    {
      code: `<img height={200} />`,
      errors: [{ messageId: 'noWidthHeight' }],
    },
    {
      code: `<img width={200} />`,
      errors: [{ messageId: 'noWidthHeight' }],
    },
    {
      code: `<img />`,
      errors: [{ messageId: 'noWidthHeight' }],
    },
    {
      code: `<img src='./file.png' />`,
      errors: [{ messageId: 'noWidthHeight' }],
    },
  ],
});

ruleTester.run('jsx-a', rules['jsx-a'], {
  valid: [`<a href={value} />`, `<a {...props}/>`],
  invalid: [
    {
      code: `<a/>`,
      errors: [{ messageId: 'noHref' }],
    },
    {
      code: `<a style='display:block;' />`,
      errors: [{ messageId: 'noHref' }],
    },
  ],
});

ruleTester.run('qwik/loader-location', rules['loader-location'], {
  valid: [
    {
      filename: './src/routes/index.tsx',
      code: `
        import { routeLoader$ } from '@builder.io/qwik-city';

        export const useProductDetails = routeLoader$(async (requestEvent) => {
          const res = await fetch(\`https://.../products/\${requestEvent.params.productId}\`);
          const product = await res.json();
          return product as Product;
        });
      `,
    },
    {
      filename: './src/routes/index.tsx',
      code: `
        import { routeLoader$ } from "@builder.io/qwik-city";
        export { useFormLoader };
        const useFormLoader = routeLoader$(() => {
          return null;
        });
      `,
    },
  ],
  invalid: [
    {
      filename: './src/routes/index.tsx',
      code: `
        import { routeLoader$ } from '@builder.io/qwik-city';
        const useProductDetails = routeLoader$(async (requestEvent) => {
          const res = await fetch(\`https://.../products/\${requestEvent.params.productId}\`);
          const product = await res.json();
          return product as Product;
        });
      `,
      errors: [{ messageId: 'missingExport' }],
    },
  ],
});

lintSuite.run();

export {};
