import type { Transformer } from 'unified';
import Slugger from 'github-slugger';
import type { Root } from 'mdast';
import type { MdxjsEsm } from 'mdast-util-mdx';
import { valueToEstree } from 'estree-util-value-to-estree';
import { headingRank } from 'hast-util-heading-rank';
import { toString } from 'hast-util-to-string';
import { visit } from 'unist-util-visit';
import type { PageHeading } from '../runtime';

const slugs = new Slugger();

export function rehypeHeadings(): Transformer {
  return (ast) => {
    const mdast = ast as Root;
    const headings: PageHeading[] = [];

    slugs.reset();

    visit(mdast, 'element', (node: any) => {
      const level = headingRank(node);
      if (level && node.properties && !hasProperty(node, 'id')) {
        const text = toString(node);
        const id = slugs.slug(text);
        node.properties.id = id;

        headings.push({
          text,
          id,
          level,
        });
      }
    });

    prependHeadings(mdast, headings);
  };
}

function prependHeadings(mdast: Root, headings: any) {
  const mdxjsEsm: MdxjsEsm = {
    type: 'mdxjsEsm',
    value: '',
    data: {
      estree: {
        type: 'Program',
        sourceType: 'module',
        body: [
          {
            type: 'ExportNamedDeclaration',
            source: null,
            specifiers: [],
            declaration: {
              type: 'VariableDeclaration',
              kind: 'const',
              declarations: [
                {
                  type: 'VariableDeclarator',
                  id: { type: 'Identifier', name: 'headings' },
                  init: valueToEstree(headings),
                },
              ],
            },
          },
        ],
      },
    },
  };
  mdast.children.unshift(mdxjsEsm);
}

const own = {}.hasOwnProperty;
function hasProperty(node: any, propName: string) {
  const value =
    propName &&
    node &&
    typeof node === 'object' &&
    node.type === 'element' &&
    node.properties &&
    own.call(node.properties, propName) &&
    node.properties[propName];
  return value != null && value !== false;
}
