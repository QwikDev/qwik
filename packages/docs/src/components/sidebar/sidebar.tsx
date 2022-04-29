import { component$, Host, useHostElement, useScopedStyles$ } from '@builder.io/qwik';
import { usePage, usePageIndex } from '@builder.io/qwik-city';
import type { SiteStore } from '../app/app';
import { CloseIcon } from '../svgs/close-icon';
import styles from './sidebar.css?inline';

interface SideBarProps {
  store: SiteStore;
}

export const SideBar = component$(
  async (props: SideBarProps) => {
    useScopedStyles$(styles);

    const hostElm = useHostElement();
    const page = (await usePage(hostElm))!;
    const navIndex = usePageIndex(hostElm);

    return (
      <Host class="sidebar">
        <nav class="breadcrumbs">
          <button onClick$={() => (props.store.sideMenuOpen = !props.store.sideMenuOpen)}>
            <span class="sr-only">Navigation</span>
            <svg width="24" height="24">
              <path
                d="M5 6h14M5 12h14M5 18h14"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
          </button>
          <ol>
            {page.breadcrumbs.map((b) => (
              <li>{b.text}</li>
            ))}
          </ol>
        </nav>
        <nav class="menu">
          <button
            class="menu-close lg:hidden"
            onClick$={() => (props.store.sideMenuOpen = !props.store.sideMenuOpen)}
          >
            <CloseIcon width={24} height={24} />
          </button>
          {navIndex
            ? navIndex.items?.map((item) => (
                <>
                  <h5>{item.text}</h5>
                  <ul>
                    {item.items?.map((item) => (
                      <li>
                        <a
                          href={item.href}
                          class={{ 'is-active': page.url.pathname === item.href }}
                        >
                          {item.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </>
              ))
            : null}
        </nav>
      </Host>
    );
  },
  { tagName: 'aside' }
);
