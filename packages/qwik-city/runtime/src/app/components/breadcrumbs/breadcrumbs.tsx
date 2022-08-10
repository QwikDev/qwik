import { component$, useStyles$ } from '@builder.io/qwik';
import { useContent, useLocation, ContentMenu } from '~qwik-city-runtime';
import styles from './breadcrumbs.css?inline';

export const Breadcrumbs = component$(
  () => {
    useStyles$(styles);

    const { menu } = useContent();
    const { pathname } = useLocation();

    const breadcrumbs = createBreadcrumbs(menu, pathname);
    if (breadcrumbs.length === 0) {
      return null;
    }

    return (
      <div class="breadcrumbs">
        {breadcrumbs.map((b, i) => (
          <span data-test-breadcrumb={i}>{b.href ? <a href={b.href}>{b.text}</a> : b.text}</span>
        ))}
      </div>
    );
  },
  { tagName: 'nav' }
);

export function createBreadcrumbs(menu: ContentMenu | undefined, pathname: string) {
  if (menu?.items) {
    for (const breadcrumbA of menu.items) {
      if (breadcrumbA.href === pathname) {
        return [breadcrumbA];
      }

      if (breadcrumbA.items) {
        for (const breadcrumbB of breadcrumbA.items) {
          if (breadcrumbB.href === pathname) {
            return [breadcrumbA, breadcrumbB];
          }

          if (breadcrumbB.items) {
            for (const breadcrumbC of breadcrumbB.items) {
              if (breadcrumbC.href === pathname) {
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
