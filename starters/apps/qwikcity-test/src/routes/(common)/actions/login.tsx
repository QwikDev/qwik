import { component$, useSignal } from '@builder.io/qwik';
import { action$, zod$, z, Form } from '@builder.io/qwik-city';
import styles from './actions.module.css';

export function delay(nu: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, nu);
  });
}

export const secretAction = action$(
  async (payload, { fail, redirect }) => {
    if (payload.username === 'admin' && payload.code === 123) {
      await delay(2000);
      return {
        secret: 'this is the secret',
        date: new Date(),
      };
    } else if (payload.username === 'redirect' && payload.code === 123) {
      throw redirect(400, '/qwikcity-test/');
    }
    return fail(400, {
      message: 'Invalid username or code',
    });
  },
  zod$({
    username: z.string().min(3).max(10),
    code: z.coerce.number(),
  })
);

export const SecretForm = component$(() => {
  const action = secretAction.use();
  const message = useSignal('');

  return (
    <>
      <Form action={action} id="secret-form">
        {action.isRunning && (
          <p id="running" class={styles.processing}>
            Running...
          </p>
        )}
        <div>
          <label id="label-username">
            Username:
            <input
              type="text"
              name="username"
              placeholder="admin"
              value={action.formData?.get('username')}
            />
            {action.fail?.fieldErrors?.username && (
              <p class={styles.error}>{action.fail.fieldErrors.username}</p>
            )}
          </label>
        </div>
        <div>
          <label id="label-code">
            Code:
            <input type="text" name="code" placeholder="123" value={action.formData?.get('code')} />
            {action.fail?.fieldErrors?.code && (
              <p class={styles.error}>{action.fail.fieldErrors.code}</p>
            )}
          </label>
        </div>
        {action.fail?.message && (
          <p id="form-error" class={styles.error}>
            {action.fail.message}
          </p>
        )}
        {action.value?.secret && (
          <p id="form-success" class={styles.success}>
            {action.value.secret}
          </p>
        )}
        <button id="submit" disabled={action.isRunning}>
          Submit
        </button>
      </Form>

      <button
        type="button"
        onClick$={async () => {
          const { value, fail } = await action.run({
            username: 'admin',
            code: 123,
          });
          console.warn(value?.secret);
          if (value) {
            message.value = value?.secret;
          }
          if (fail) {
            message.value = fail?.message ?? 'Validation error';
          }
        }}
      >
        I dont wanna to play
      </button>
    </>
  );
});
