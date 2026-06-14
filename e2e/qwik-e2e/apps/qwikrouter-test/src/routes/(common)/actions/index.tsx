import { globalAction$, routeLoader$, type DocumentHead } from '@qwik.dev/router';
import { component$, useSignal } from '@qwik.dev/core';
import { SecretForm, delay } from './login';

export const useDateLoader = routeLoader$(() => new Date());

export const useOtherAction = globalAction$(async () => {
  await delay(300);
  return {
    success: true,
  };
});

export default component$(() => {
  const other = useOtherAction();
  const date = useDateLoader();
  const promiseSettled = useSignal(false);

  return (
    <div class="actions">
      <h1>Actions Test</h1>
      <section class="input">
        <SecretForm />
      </section>
      <div>{date.value.toISOString()}</div>
      <section>
        <div id="other-store">
          {String(other.isRunning)}:{other.formData?.get('username') as string}:
          {other.formData?.get('code') as string}:{JSON.stringify(other.value)}
        </div>
        <button id="other-button" onClick$={() => other.submit()}>
          Run other
        </button>
        <button
          id="other-promise-button"
          onClick$={async () => {
            promiseSettled.value = false;
            void other.submit();
            await other.promise();
            promiseSettled.value = true;
          }}
        >
          Run and await promise
        </button>
        {promiseSettled.value && <div id="other-promise-settled">Settled</div>}
        {other.value?.success && <div id="other-success">Success</div>}
      </section>
    </div>
  );
});

export const head: DocumentHead = () => {
  return {
    title: 'Actions',
  };
};
