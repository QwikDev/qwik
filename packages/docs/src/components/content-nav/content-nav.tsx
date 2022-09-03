import { ContentMenu, Link, useContent, useLocation } from '@builder.io/qwik-city';
import { component$, mutable, useStyles$ } from '@builder.io/qwik';
import styles from './content-nav.css?inline';

export const ContentNav = component$(() => {
  useStyles$(styles);

  const { menu } = useContent();
  const { pathname } = useLocation();

  if (!menu) {
    return null;
  }

  const items = flattenMenu(menu);

  const prev = getNav(items, pathname, -1);
  const next = getNav(items, pathname, 1);

  return (
    <nav class="content-nav border-t border-slate-300 flex flex-wrap py-4">
      <div class="flex-1">
        {prev ? (
          <Link class="px-3 py-1 prev" href={mutable(prev.href)} prefetch={true}>
            {prev.text}
          </Link>
        ) : null}
      </div>
      <div class="flex-1 text-right">
        {next ? (
          <Link class="px-3 py-1 next" href={mutable(next.href)} prefetch={true}>
            {next.text}
          </Link>
        ) : null}
      </div>
    </nav>
  );
});

export const getNav = (items: ContentMenu[], currentPathname: string, direction: -1 | 1) => {
  const currentIndex = items.findIndex((p) => p.href === currentPathname);
  if (currentIndex > -1) {
    let item = items[currentIndex + direction];
    if (item && item.href) {
      return item;
    }
    item = items[currentIndex + direction + direction];
    if (item && item.href) {
      return item;
    }
  }
};

export const flattenMenu = (menu: ContentMenu) => {
  const items: ContentMenu[] = [];
  const readMenu = (m: ContentMenu) => {
    items.push(m);
    if (m.items) {
      for (const item of m.items) {
        readMenu(item);
      }
    }
  };
  readMenu(menu);
  return items;
};
