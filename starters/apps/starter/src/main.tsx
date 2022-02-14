import { createStore, $, component$, useEvent, Host } from '@builder.io/qwik';
import { Logo } from './components/logo/logo';

import './global.css';

export const App = component$(() => {
  const state = createStore({ name: 'World' });
  return $(() => (
    <Host class="my-app">
      <Logo />

      <p>Congratulations Qwik is working!</p>

      <p>Next steps:</p>
      <ol>
        <li>
          Open dev-tools network tab and notice that no JavaScript was downloaded to render this
          page. (Zero JavaScript no matter the size of your app.)
        </li>
        <li>
          Try interacting with this component by changing{' '}
          <input
            value={state.name}
            on$:keyup={() => {
              const event = useEvent<KeyboardEvent>();
              const input = event.target as HTMLInputElement;
              state.name = input.value;
            }}
          ></input>
          .
        </li>
        <li>
          Observe that the binding changes: <code>Hello {state.name}!</code>
        </li>
        <li>
          Notice that Qwik automatically lazily-loaded and hydrated the component upon interaction
          without the developer having to code that behavior. (Lazy hydration is what gives even
          large apps instant on behavior.)
        </li>
        <li>
          Read the docs <a href="https://github.com/builderio/qwik">here</a>.
        </li>
        <li>Replace the content of this component with your code.</li>
        <li>Build amazing web-sites with unbeatable startup performance.</li>
      </ol>
      <hr />
      <p style={{ 'text-align': 'center' }}>
        Made with ❤️ by{' '}
        <a target="_blank" href="https://www.builder.io/">
          Builder.io
        </a>
      </p>
    </Host>
  ));
});
