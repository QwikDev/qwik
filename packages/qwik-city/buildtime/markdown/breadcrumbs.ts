import type { BuildContext } from '../types';
import type { ContentBreadcrumb } from '../../runtime/src/library/types';

export function createBreadcrumbs(ctx: BuildContext, pathname: string, menuPathname: string) {
  const menu = ctx.menus.find((m) => m.pathname === menuPathname);
  if (menu?.items) {
    for (const indexA of menu.items) {
      const breadcrumbA: ContentBreadcrumb = {
        text: indexA.text,
      };
      if (typeof indexA.href === 'string') {
        breadcrumbA.href = indexA.href;
      }
      if (indexA.href === pathname) {
        return [breadcrumbA];
      }

      if (indexA.items) {
        for (const indexB of indexA.items) {
          const breadcrumbB: ContentBreadcrumb = {
            text: indexB.text,
          };
          if (typeof indexB.href === 'string') {
            breadcrumbB.href = indexB.href;
          }
          if (indexB.href === pathname) {
            return [breadcrumbA, breadcrumbB];
          }

          if (indexB.items) {
            for (const indexC of indexB.items) {
              const breadcrumbC: ContentBreadcrumb = {
                text: indexC.text,
              };
              if (typeof indexC.href === 'string') {
                breadcrumbC.href = indexC.href;
              }
              if (indexC.href === pathname) {
                return [breadcrumbA, breadcrumbB, breadcrumbC];
              }
            }
          }
        }
      }
    }
  }

  return [];
}
