import { component$, useStore } from '@builder.io/qwik';
import { Footer } from './components/footer/footer';
import { Header } from './components/header/header';
import { Body } from './components/body/body';
import type { Todos } from './state/state';

import './base.css';
import './index.css';

/**
 * Overall application component.
 *
 * This component is static (meaning it will never change). Because of this
 * Qwik knows that it should never need to be rerendered, and its code will never
 * download to the client.
 */
export const Main = component$(() => {
  const todos = useStore<Todos>({
    filter: 'all',
    items: [
      { completed: false, title: 'Read Qwik docs' },
      { completed: false, title: 'Build HelloWorld' },
      { completed: false, title: 'Profit' },
    ],
  });
  return (
    <section class="todoapp">
      <Header todos={todos} />
      <Body todos={todos} />
      <Footer todos={todos} />
    </section>
  );
});
