import { component$, useContext, useStyles$ } from '@builder.io/qwik';
import { type ContentMenu, useContent, useLocation } from '@builder.io/qwik-city';
import { GlobalStore } from '../../context';
import { CloseIcon } from '../svgs/close-icon';
import styles from './sidebar.css?inline';

const markdownItems = Object.fromEntries(
  await Promise.all(
    Object.entries(import.meta.glob<{ frontmatter?: MDX }>('../../routes/**/*.{md,mdx}')).map(
      async ([k, v]) => {
        // console.log(k, (await v())?.frontmatter);
        return [
          k
            .replace('../../routes', '')
            .replace('(qwikcity)/', '')
            .replace('(qwik)/', '')
            .replaceAll(/([()])/g, '')
            .replace('index.mdx', '')
            .replace('index.md', ''),
          await v(),
        ] as const;
      }
    )
  )
);

type MDX = {
  title: string;
  contributors: string[];
  created_at: string;
  updated_at: string;
};

export const SideBar = component$((props: { allOpen?: boolean }) => {
  useStyles$(styles);

  const globalStore = useContext(GlobalStore);
  const { menu } = useContent();
  const { url } = useLocation();
  const allOpen = url.pathname.startsWith('/qwikcity/') || props.allOpen;

  return (
    <aside class="sidebar">
      <nav class="menu">
        <button
          class="menu-close lg:hidden"
          onClick$={() => (globalStore.sideMenuOpen = !globalStore.sideMenuOpen)}
          type="button"
        >
          <CloseIcon width={24} height={24} />
        </button>
        <Items items={menu?.items} pathname={url.pathname} allOpen={allOpen} />
      </nav>
    </aside>
  );
});

export function Items({
  items,
  pathname,
  allOpen,
}: {
  items?: ContentMenu[];
  pathname: string;
  allOpen?: boolean;
}) {
  return (
    <ul>
      {items &&
        items.map((item, i) => (
          <li>
            {item.items ? (
              <details
                open={allOpen || i < 1 || item.items?.some((item) => pathname === item.href)}
              >
                <summary>
                  <h5>{item.text}</h5>
                </summary>
                <Items items={item.items} pathname={pathname} />
              </details>
            ) : (
              <a
                href={item.href}
                class={{
                  'is-active': pathname === item.href,
                }}
              >
                {item.text}
                {markdownItems[item.href!]?.frontmatter?.updated_at
                  ? new Date(markdownItems[item.href!]?.frontmatter?.updated_at!).getTime() +
                      5 * 24 * 60 * 60 * 1000 >
                    new Date().getTime()
                    ? 'new'
                    : null
                  : null}
              </a>
            )}
          </li>
        ))}
    </ul>
  );
}

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
