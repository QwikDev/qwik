import { component$, Host, useScopedStyles$ } from '@builder.io/qwik';
import { useContentMenu, useLocation, ContentMenu } from '~qwik-city-runtime';
import styles from './breadcrumbs.css?inline';

export const Breadcrumbs = component$(
  () => {
    useScopedStyles$(styles);

    const menu = useContentMenu();
    const loc = useLocation();

    const breadcrumbs = createBreadcrumbs(menu, loc.pathname);

    return (
      <Host class="breadcrumbs">
        {breadcrumbs.map((b, i) => (
          <span data-test-breadcrumb={i}>{b.href ? <a href={b.href}>{b.text}</a> : b.text}</span>
        ))}
      </Host>
    );
  },
  { tagName: 'nav' }
);

export function createBreadcrumbs(menu: ContentMenu | undefined, pathname: string) {
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

interface ContentBreadcrumb {
  text: string;
  href?: string;
}
