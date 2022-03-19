import { component$, Host, $, useHostElement, useScopedStyles$, useStore } from '@builder.io/qwik';
import { usePage, usePageIndex } from '@builder.io/qwest';
import styles from './sidebar.css';

export const SideBar = component$(
  () => {
    useScopedStyles$(styles);

    const store = useStore({
      isOpen: false,
    });

    return $(async () => {
      const hostElm = useHostElement();
      const page = (await usePage(hostElm))!;
      const navIndex = usePageIndex(hostElm);

      return (
        <Host class="sidebar">
          <nav class="breadcrumbs">
            <button
              on$:click={() => {
                store.isOpen = !store.isOpen;
              }}
            >
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
          <nav
            class={{
              menu: true,
              'is-open': store.isOpen,
            }}
          >
            {navIndex
              ? navIndex.items?.map((item) => (
                  <>
                    <h5>{item.text}</h5>
                    <ul>
                      {item.items?.map((item) => (
                        <li>
                          <a href={item.href}>{item.text}</a>
                        </li>
                      ))}
                    </ul>
                  </>
                ))
              : null}
          </nav>
        </Host>
      );
    });
  },
  { tagName: 'aside' }
);
