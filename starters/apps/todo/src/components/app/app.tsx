import { component$, onRender$, withStyles$ } from '@builder.io/qwik';
import { Footer } from '../footer/footer';
import { Header } from '../header/header';
import { Main } from '../main/main';
import type { Todos } from '../../state/state';
import styles from './app.css';

/**
 * Overall application component.
 *
 * This component is static (meaning it will never change). Because of this
 * Qwik knows that it should never need to be rerendered, and its code will never
 * download to the client.
 */
export const App = component$((props: { todos: Todos }) => {
  withStyles$(styles);

  return onRender$(() => {
    return (
      <section class="todoapp">
        <Header todos={props.todos} />
        <Main todos={props.todos} />
        <Footer todos={props.todos} />
      </section>
    );
  });
});
