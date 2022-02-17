import { component$, Host, useStyles$, $ } from '@builder.io/qwik';
import type { IndexItem } from '@builder.io/qwest';
import styles from './sidebar.css';

interface SidebarProps {
  navIndex: IndexItem;
}

export const SideBar = component$(
  ({ navIndex }: SidebarProps) => {
    useStyles$(styles);

    return $(() => (
      <Host>
        <nav>
          {navIndex.items?.map((item) => (
            <>
              <h5 class="mb-8 lg:mb-3 font-semibold text-slate-900 dark:text-slate-200">
                {item.href ? (
                  <a
                    class="block pl-4 -ml-px dark:hover:border-slate-500 text-slate-700 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-300"
                    href={item.href}
                  >
                    {item.text}
                  </a>
                ) : (
                  item.text
                )}
              </h5>
              <ul class="space-y-6 lg:space-y-2 border-slate-100 dark:border-slate-800">
                {item.items?.map((item) => (
                  <li>
                    {item.href ? (
                      <a
                        class="block pl-4 -ml-px dark:hover:border-slate-500 text-slate-700 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-300"
                        href={item.href}
                      >
                        {item.text}
                      </a>
                    ) : (
                      item.text
                    )}
                  </li>
                ))}
              </ul>
            </>
          ))}
        </nav>
      </Host>
    ));
  },
  { tagName: 'aside' }
);
