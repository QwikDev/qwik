import { $, component, Host, withStyles$, $, createStore } from '@builder.io/qwik';
import { getDocs } from '../content/content';
import styles from './sidebar.css';

export const SideBar = component(
  'aside',
  $(() => {
    withStyles$(styles);

    const state = createStore({
      docs: Object.keys(getDocs()),
    });

    return $(() => (
      <Host>
        <nav>
          <h5 class="mb-8 lg:mb-3 font-semibold text-slate-900 dark:text-slate-200">Docs</h5>
          <ul class="space-y-6 lg:space-y-2 border-slate-100 dark:border-slate-800">
            {state.docs.map((d) => (
              <li>
                <a
                  class="block pl-4 -ml-px dark:hover:border-slate-500 text-slate-700 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-300"
                  href={`/docs/${d}`}
                >
                  {d}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </Host>
    ));
  })
);
