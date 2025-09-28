import type { Transformer } from 'unified';
import type { RoutingContext, FrontmatterAttrs } from '../types';
import { normalizePath } from '../../utils/fs';
import { visit } from 'unist-util-visit';
import { parse as parseYaml } from 'yaml';
import type { ResolvedDocumentHead } from '../../runtime/src';
import type { DocumentMeta, Editable } from '../../runtime/src/types';

export function parseFrontmatter(ctx: RoutingContext): Transformer {
  return (mdast, vfile) => {
    const attrs: FrontmatterAttrs = {};

    visit(mdast, 'yaml', (node: any) => {
      const parsedAttrs = parseFrontmatterAttrs(node.value) as FrontmatterAttrs;
      for (const k in parsedAttrs) {
        attrs[k] = parsedAttrs[k];
      }
    });

    if (Object.keys(attrs).length > 0) {
      ctx.frontmatter.set(normalizePath(vfile.path), attrs);
    }
  };
}

export function parseFrontmatterAttrs(yaml: string) {
  if (typeof yaml === 'string') {
    yaml = yaml.trim();
    if (yaml !== '') {
      return parseYaml(yaml);
    }
  }
  return null;
}

// https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta/name
const metaNames: { [attrName: string]: boolean } = {
  author: true,
  creator: true,
  'color-scheme': true,
  description: true,
  generator: true,
  keywords: true,
  publisher: true,
  referrer: true,
  robots: true,
  'theme-color': true,
  viewport: true,
};

export function frontmatterAttrsToDocumentHead(attrs: FrontmatterAttrs | undefined) {
  if (attrs != null && typeof attrs === 'object') {
    const attrNames = Object.keys(attrs);
    if (attrNames.length > 0) {
      const head: Editable<Required<ResolvedDocumentHead>> = {
        title: '',
        meta: [],
        styles: [],
        links: [],
        scripts: [],
        frontmatter: {},
      };

      for (const attrName of attrNames) {
        const attrValue = attrs[attrName];
        if (attrValue != null) {
          if (attrName === 'title') {
            head.title = attrValue.toString();
            head.title = head.title.replace(/\\@/g, '@');
          } else if (attrName === 'og' || attrName === 'opengraph') {
            // set custom open graph property
            if (typeof attrValue === 'object') {
              for (const opengraph of Array.isArray(attrValue) ? attrValue : [attrValue]) {
                if (
                  opengraph != null &&
                  typeof opengraph === 'object' &&
                  !Array.isArray(opengraph)
                ) {
                  for (const [property, content] of Object.entries(opengraph)) {
                    // proxy title & description if value is set to `true`
                    if ((property === 'title' || property === 'description') && content === true) {
                      // only proxy property when exists in attrs
                      if (attrNames.includes(property)) {
                        (head.meta as DocumentMeta[]).push({
                          property: `og:${property}`,
                          content: attrs[property]?.toString(),
                        });
                      }
                    }
                    // otherwise set custom property and content
                    else {
                      (head.meta as DocumentMeta[]).push({
                        property: `og:${property}`,
                        content: content?.toString(),
                      });
                    }
                  }
                }
              }
            }
          } else if (metaNames[attrName]) {
            (head.meta as DocumentMeta[]).push({
              name: attrName,
              content: attrValue.toString(),
            });
          } else {
            (head.frontmatter as Record<string, any>)[attrName] = attrValue;
          }
        }
      }
      return head;
    }
  }
  return null;
}
