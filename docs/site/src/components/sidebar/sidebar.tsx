import { onRender$, component, Host, withStyles$, $, createStore } from '@builder.io/qwik';
import { getDocs } from '../content/content';
import styles from './sidebar.css';

export const SideBar = component(
  'aside',
  $(() => {
    withStyles$(styles);
    const state = createStore({
      docs: Object.keys(getDocs()),
    });

    return onRender$(() => (
      <Host>
        <nav>
          <h1>left menu</h1>
          <ul>
            {state.docs.map((d) => (
              <li>
                <a href={`/docs/${d}`}>{d}</a>
              </li>
            ))}
          </ul>
        </nav>
      </Host>
    ));
  })
);
