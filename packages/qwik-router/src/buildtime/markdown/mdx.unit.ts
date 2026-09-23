import { describe, expect, test } from 'vitest';
import { createMdxTransformer } from './mdx';

// It could be that new MDX versions change the output used for snapshot matching. Change as needed.
describe('mdx', async () => {
  const ctx = {
    frontmatter: new Map(),
    opts: {
      mdx: {
        remarkPlugins: [],
        rehypePlugins: [],
      },
      mdxPlugins: {},
    },
  };

  const transformer = await createMdxTransformer(ctx as any);

  test('convert flat mdx', async () => {
    const mdx = `
# Hello
<a href="http://example.com">Hello</a>
<div>World</div>
`;
    const result = await transformer(mdx, 'file.mdx');

    expect(result).toMatchInlineSnapshot(`
{
  "code": "/*@jsxRuntime automatic*/
/*@jsxImportSource @qwik.dev/core*/
export const headings = [{
  "text": "Hello",
  "id": "hello",
  "level": 1
}];
export const frontmatter = undefined;
function MdxContent(props) {
  const _components = {
    a: "a",
    h1: "h1",
    span: "span",
    ...props.components
  };
  return <><_components.h1 id="hello"><_components.a aria-hidden="true" tabindex="-1" href="#hello"><_components.span class="icon icon-link" /></_components.a>{"Hello"}</_components.h1>{"\\n"}<a href="http://example.com">{"Hello"}</a>{"\\n"}<div>{"World"}</div></>;
}

function _missingMdxReference(id, component, place) {
  throw new Error("file.mdx: Expected " + (component ? "component" : "object") + " \`" + id + "\` to be defined: you likely forgot to import, pass, or provide it." + (place ? "\\nIt’s referenced in your code at \`" + place + "\`" : ""));
}
export default MdxContent;
",
  "map": {
    "file": "file.mdx",
    "mappings": ";;;;;;;;;;;;;;;gKACE,uCACCA,sBAA0B,wBACxB",
    "names": [
      "[object Object]",
    ],
    "sources": [
      "file.mdx",
    ],
    "version": 3,
  },
}
`);
  });

  test('exports the content under a name the compiler compiles as a component', async () => {
    const result = await transformer('# Hello', 'file.mdx');

    expect(result!.code).toMatch(/function MdxContent\(props\)/);
    expect(result!.code).toContain('export default MdxContent;');
    expect(result!.code).not.toContain('_createMdxContent');
  });

  test('convert layout mdx', async () => {
    const mdx = `
# Hello

export default function Layout({ children: content }) {
  return <main>{content}</main>;
}

<a href="http://example.com">Hello</a>
<div>World</div>
`;
    const result = await transformer(mdx, 'file.mdx');

    expect(result).toMatchInlineSnapshot(`
{
  "code": "/*@jsxRuntime automatic*/
/*@jsxImportSource @qwik.dev/core*/
export const headings = [{
  "text": "Hello",
  "id": "hello",
  "level": 1
}];
export const frontmatter = undefined;
const MDXLayout = function Layout({children: content}) {
  return <main>{content}</main>;
};
function MdxContent(props) {
  const _components = {
    a: "a",
    h1: "h1",
    span: "span",
    ...props.components
  };
  return <><_components.h1 id="hello"><_components.a aria-hidden="true" tabindex="-1" href="#hello"><_components.span class="icon icon-link" /></_components.a>{"Hello"}</_components.h1>{"\\n"}{"\\n"}<a href="http://example.com">{"Hello"}</a>{"\\n"}<div>{"World"}</div></>;
}

function _missingMdxReference(id, component, place) {
  throw new Error("file.mdx: Expected " + (component ? "component" : "object") + " \`" + id + "\` to be defined: you likely forgot to import, pass, or provide it." + (place ? "\\nIt’s referenced in your code at \`" + place + "\`" : ""));
}
export default () => <MDXLayout><MdxContent /></MDXLayout>;
",
  "map": {
    "file": "file.mdx",
    "mappings": ";;;;;;;;kBAGe,iBAAkBA,UAAUC;UACjCC,MAAMD,UAAUC;;;;;;;;;gKAHxB,6CAMCC,sBAA0B,wBACxB",
    "names": [
      "children",
      "content",
      "main",
      "[object Object]",
    ],
    "sources": [
      "file.mdx",
    ],
    "version": 3,
  },
}
`);
  });
});
