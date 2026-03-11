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
        "code": "import { jsx } from '@qwik.dev/core';
      import {Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs} from "@qwik.dev/core/jsx-runtime";
      export const headings = [{
        "text": "Hello",
        "id": "hello",
        "level": 1
      }];
      export const frontmatter = undefined;
      function _createMdxContent(props) {
        const _components = {
          a: "a",
          h1: "h1",
          span: "span",
          ...props.components
        };
        return _jsxs(_Fragment, {
          children: [_jsxs(_components.h1, {
            id: "hello",
            children: [_jsx(_components.a, {
              "aria-hidden": "true",
              tabindex: "-1",
              href: "#hello",
              children: _jsx(_components.span, {
                class: "icon icon-link"
              })
            }), "Hello"]
          }), "\\n", _jsx("a", {
            href: "http://example.com",
            children: "Hello"
          }), "\\n", _jsx("div", {
            children: "World"
          })]
        });
      }

      function _missingMdxReference(id, component, place) {
        throw new Error("file.mdx: Expected " + (component ? "component" : "object") + " \`" + id + "\` to be defined: you likely forgot to import, pass, or provide it." + (place ? "\\nIt’s referenced in your code at \`" + place + "\`" : ""));
      }
      const WrappedMdxContent = () => {
        const content = _createMdxContent({});
        return typeof MDXLayout === 'function' ? jsx(MDXLayout, {children: content}) : content;
      };
      export default WrappedMdxContent;
      ",
        "map": {
          "file": "file.mdx",
          "mappings": ";;;;;;;;;;;;;;;;;;;;;;;;UACE;;;gBAC2B;;gBACxB",
          "names": [],
          "sources": [
            "file.mdx",
          ],
          "version": 3,
        },
      }
    `);
  });

  test('plain .md generates head with eTag', async () => {
    const md = `# Hello World\n`;
    const result = await transformer(md, 'file.md');
    expect(result?.code).toContain('export const head = { "eTag":');
    // Should not have duplicate head exports (headings doesn't count)
    const headExports = result?.code.match(/export const head =/g);
    expect(headExports?.length).toBe(1);
  });

  test('plain .md with frontmatter merges eTag into head', async () => {
    const md = `---
title: My Page
description: A test page
---
# Hello World
`;
    const result = await transformer(md, 'page.md');
    expect(result?.code).toContain('"eTag":');
    // Only one `export const head =` (eTag merged into frontmatter-generated head)
    const headExports = result?.code.match(/export const head =/g);
    expect(headExports?.length).toBe(1);
    // Should still have the title from frontmatter
    expect(result?.code).toContain('"title": "My Page"');
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
        "code": "import { jsx } from '@qwik.dev/core';
      import {Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs} from "@qwik.dev/core/jsx-runtime";
      export const headings = [{
        "text": "Hello",
        "id": "hello",
        "level": 1
      }];
      export const frontmatter = undefined;
      const MDXLayout = function Layout({children: content}) {
        return _jsx("main", {
          children: content
        });
      };
      function _createMdxContent(props) {
        const _components = {
          a: "a",
          h1: "h1",
          span: "span",
          ...props.components
        };
        return _jsxs(_Fragment, {
          children: [_jsxs(_components.h1, {
            id: "hello",
            children: [_jsx(_components.a, {
              "aria-hidden": "true",
              tabindex: "-1",
              href: "#hello",
              children: _jsx(_components.span, {
                class: "icon icon-link"
              })
            }), "Hello"]
          }), "\\n", "\\n", _jsx("a", {
            href: "http://example.com",
            children: "Hello"
          }), "\\n", _jsx("div", {
            children: "World"
          })]
        });
      }

      function _missingMdxReference(id, component, place) {
        throw new Error("file.mdx: Expected " + (component ? "component" : "object") + " \`" + id + "\` to be defined: you likely forgot to import, pass, or provide it." + (place ? "\\nIt’s referenced in your code at \`" + place + "\`" : ""));
      }
      const WrappedMdxContent = () => {
        const content = _createMdxContent({});
        return typeof MDXLayout === 'function' ? jsx(MDXLayout, {children: content}) : content;
      };
      export default WrappedMdxContent;
      ",
        "map": {
          "file": "file.mdx",
          "mappings": ";;;;;;;kBAGe,iBAAkBA,UAAUC;cACjC;cAAMA;;;;;;;;;;;;;;;;;;;;UAHd;;;gBAM2B;;gBACxB",
          "names": [
            "children",
            "content",
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
