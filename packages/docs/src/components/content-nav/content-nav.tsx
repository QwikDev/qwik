import { component$, useSignal, useStyles$, useTask$ } from '@qwik.dev/core';
import { type ContentMenu, Link, useContent, useLocation } from '@qwik.dev/router';
import styles from './content-nav.css?inline';

export const ContentNav = component$(() => {
  useStyles$(styles);

  const { menu } = useContent();
  const { url } = useLocation();

  if (!menu) {
    return null;
  }

  const items = flattenMenu(menu);

  const prev = useSignal<ContentMenu | undefined>(undefined);
  const next = useSignal<ContentMenu | undefined>(undefined);

  useTask$(({ track }) => {
    track(() => url.pathname);
    prev.value = getNav(items, url.pathname, -1);
    next.value = getNav(items, url.pathname, 1);
  });

  return (
    <nav class="content-nav border-t border-slate-300 flex flex-wrap py-4">
      <div class="flex-1">
        {prev.value ? (
          <Link class="px-3 py-1 prev" href={prev.value?.href}>
            {prev.value?.text}
          </Link>
        ) : null}
      </div>

      <div class="flex-1 text-right">
        {next.value ? (
          <Link class="px-3 py-1 next" href={next.value?.href}>
            {next.value?.text}
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
