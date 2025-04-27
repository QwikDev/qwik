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
        "code": "import { jsx, _jsxC, RenderOnce } from '@builder.io/qwik';
      import {Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs} from "@builder.io/qwik/jsx-runtime";
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
      const WrappedMdxContent = (props = {}) => {
        const content = _jsxC(RenderOnce, {children: _jsxC(_createMdxContent, props, 3, null)}, 3, "eB2HIyA1");
        if (typeof MDXLayout === 'function'){
            return jsx(MDXLayout, {children: content});
        }
        return content;
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
        "code": "import { jsx, _jsxC, RenderOnce } from '@builder.io/qwik';
      import {Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs} from "@builder.io/qwik/jsx-runtime";
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
      const WrappedMdxContent = (props = {}) => {
        const content = _jsxC(RenderOnce, {children: _jsxC(_createMdxContent, props, 3, null)}, 3, "UdQmQWC3");
        if (typeof MDXLayout === 'function'){
            return jsx(MDXLayout, {children: content});
        }
        return content;
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
