import { useStore, component$, Host } from '@builder.io/qwik';
import { Logo } from '../logo/logo';

export const App = component$(() => {
  const state = useStore({ name: 'World' });
  return (
    <Host class="my-app p-20">
      <Logo class="mb-10" />

      <h1 class="text-3xl mb-2">Congratulations Qwik is working!</h1>

      <h2 class="text-2xl my-1">Next steps:</h2>
      <ol class="list-decimal list-inside ml-10">
        <li>
          Open dev-tools network tab and notice that no JavaScript was downloaded to render this
          page. (Zero JavaScript no matter the size of your app.)
        </li>
        <li>
          Try interacting with this component by changing{' '}
          <input
            value={state.name}
            class="border-2 border-solid border-blue-500"
            placeholder="Write some text"
            onInput$={(event) => {
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
          Notice that Qwik automatically lazily-loaded and resumed the component upon interaction
          without the developer having to code that behavior. (Lazy hydration is what gives even
          large apps instant on behavior.)
        </li>
        <li>
          Read the docs <a href="https://github.com/builderio/qwik">here</a>.
        </li>
        <li>Replace the content of this component with your code.</li>
        <li>Build amazing web-sites with unbeatable startup performance.</li>
      </ol>
      <hr class="mt-10" />
      <p class="text-center text-sm mt-2">
        Made with ❤️ by{' '}
        <a target="_blank" href="https://www.builder.io/">
          Builder.io
        </a>
      </p>
    </Host>
  );
});
