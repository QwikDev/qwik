import { component$, onRender$, $, withStyles$ } from '@builder.io/qwik';
import { Footer } from '../footer/footer';
import { Header } from '../header/header';
import { Main } from '../main/main';
import type { Todos } from '../../state/state';
import styles from './app.css';

/* eslint no-console: ["off"] */

// TODO(misko): APIs for better debugger experience: getProps
// TODO(misko): APIs for better debugger experience: dehydrate
// TODO(misko): APIs to have a global way of notifying which events are being fired, so we can console out render events in the demo applications
// TODO(misko): Place breakpoint in DOM modification and notice that too many writes are happening.
// TODO(misko): <item> renders twice on toggle. 1) Due to state change, 2) due to <main> somehow triggering render.

////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////

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
    console.log('on:qRender => <ToDoApp/>');
    return (
      <section class="todoapp">
        <Header todos={props.todos} />
        <Main todos={props.todos} />
        <Footer todos={props.todos} />
      </section>
    );
  });
});
