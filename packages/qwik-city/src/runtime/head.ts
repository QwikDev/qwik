import type { LayoutModule, PageModule } from './types';
import { jsx, JSXNode } from '@builder.io/qwik';

export const createHead = (updatedModules: (PageModule | LayoutModule)[]) => {
  // TODO: merge with parent layouts and root

  return (props: { children: JSXNode[] }) => {
    return jsx('head', {});
    // if (pageHead) {
    //   const children: JSXNode[] = [];

    //   if (pageHead.title) {
    //     children.push(
    //       jsx('title', {
    //         children: pageHead.title,
    //       })
    //     );
    //   }

    //   if (pageHead.meta) {
    //     Object.entries(pageHead.meta).forEach(([metaName, metaContent]) => {
    //       children.push(
    //         jsx('meta', {
    //           [metaName.startsWith('og:') ? 'property' : 'name']: metaName,
    //           content: metaContent,
    //           key: metaName,
    //         })
    //       );
    //     });
    //   }

    //   if (pageHead.links) {
    //     for (const link of pageHead.links) {
    //       children.push(jsx('link', link));
    //     }
    //   }

    //   if (pageHead.styles) {
    //     for (const style of pageHead.styles) {
    //       children.push(
    //         jsx('style', {
    //           children: style.style,
    //           ...style.attributes,
    //           key: style.key,
    //         })
    //       );
    //     }
    //   }

    //   return jsx('head', {});
    // }
  };
};
