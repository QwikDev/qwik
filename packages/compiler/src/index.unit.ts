import { describe, expect, test } from 'vitest';
import { transformModules } from './index';

describe('transformModules', () => {
  test('transforms jsx expressions to the compiler mock', async () => {
    const result = await transformModules({
      input: [
        {
          path: 'src/component.tsx',
          code: `type Props = { name: string };
export const view = (props: Props) => <p>Hello {props.name}</p>;
`,
        },
      ],
      srcDir: 'src',
      sourceMaps: false,
      transpileTs: true,
      transpileJsx: true,
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "diagnostics": [],
        "isJsx": true,
        "isTypeScript": true,
        "modules": [
          {
            "code": "const __qwikJsx = () => "hello world";
      const __qwikFragment = Symbol.for("qwik.fragment");
      export const view = (props) => __qwikJsx("p", null, "Hello ", props.name);
      ",
            "isEntry": false,
            "map": null,
            "origPath": null,
            "path": "src/component.tsx",
            "segment": null,
          },
        ],
      }
    `);
  });
});
