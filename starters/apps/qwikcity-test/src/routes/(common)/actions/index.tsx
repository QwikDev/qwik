import { component$ } from '@builder.io/qwik';
import { action$, DocumentHead, loader$ } from '@builder.io/qwik-city';
import { SecretForm } from './login';

export const dateLoader = loader$(() => new Date());

export const otherAction = action$((_, { fail }) => {
  if (Math.random() > 0.5) {
    return {
      secret: 'this is the secret',
      date: new Date(),
    };
  }
  return fail(400, {
    message: 'Invalid username or code',
  });
});

export default component$(() => {
  const other = otherAction.use();
  // const date = dateLoader.use();
  // console.log(date.value.toISOString());

  return (
    <div class="actions">
      <section class="input">
        <SecretForm />
      </section>
      <section>
        <div id="other-store">
          {String(other.isRunning)}:{other.formData?.get('username')}:{other.formData?.get('code')}:
          {JSON.stringify(other.fail)}:{JSON.stringify(other.value)}
        </div>
      </section>
    </div>
  );
});

export const head: DocumentHead = () => {
  return {
    title: 'Actions',
  };
};
