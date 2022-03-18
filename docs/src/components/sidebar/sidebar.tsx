import { component$, Host, $, useHostElement, useScopedStyles$ } from '@builder.io/qwik';
import { usePageIndex } from '@builder.io/qwest';
import styles from './sidebar.css';

export const SideBar = component$(
  () => {
    useScopedStyles$(styles);
    const hostElm = useHostElement();

    return $(() => {
      const navIndex = usePageIndex(hostElm);

      return (
        <Host class="sidebar">
          <nav class="breadcrumbs">breadcrumbs</nav>
          <nav class="menu">
            {navIndex
              ? navIndex.items?.map((item) => (
                  <>
                    <h5 class="font-semibold text-slate-200 bg-slate-700 px-3 py-1 mb-1 rounded-md whitespace-nowrap">
                      {item.text}
                    </h5>

                    <ul class="border-slate-100 pb-5">
                      {item.items?.map((item) => (
                        <li class="whitespace-nowrap">
                          <a
                            class="py-1 pl-3 block rounded-md text-slate-900 hover:bg-slate-200"
                            href={item.href || '#'}
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
    });
  },
  { tagName: 'aside' }
);
