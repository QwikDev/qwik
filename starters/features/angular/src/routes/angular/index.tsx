/* eslint-disable no-console */

import { $, component$, useSignal } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';
import { DemoComponent } from '~/integrations/angular';

export default component$(() => {
  const contentOption = useSignal<'one' | 'two'>('one');

  return (
    <div>
      <h1>
        Welcome to Qwik <span class="lightning">⚡️</span>
      </h1>

      <div>
        <DemoComponent
          client:hover
          contentOption={contentOption.value}
          hello={$((greeting: string) => console.log('Value from the component: ', greeting))}
        >
          <div>I am projected into Angular: "{contentOption.value}"</div>
        </DemoComponent>
      </div>

      <br />

      <button
        onClick$={$(() => {
          contentOption.value = contentOption.value === 'two' ? 'one' : 'two';
        })}
      >
        Wake up by update of the bound data: "{contentOption.value}"
      </button>
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Qwik Angular',
};
