import { component$, useSignal } from "@builder.io/qwik";
import { zod$, z, Form, globalAction$ } from "@builder.io/qwik-city";
import styles from "./actions.module.css";

export function delay(nu: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, nu);
  });
}

export const useSecretAction = globalAction$(
  async (payload, { fail, redirect }) => {
    if (payload.username === "admin" && payload.code === 123) {
      await delay(2000);
      return {
        secret: "this is the secret",
        date: new Date(),
      };
    } else if (payload.username === "redirect" && payload.code === 123) {
      throw redirect(302, "/qwikcity-test/");
    }
    return fail(400, {
      message: "Invalid username or code",
    });
  },
  zod$({
    username: z.string().min(3).max(10),
    code: z.coerce.number(),
    button: z.string().startsWith("hello"),
  }),
);

export const SecretForm = component$(() => {
  const action = useSecretAction();
  const message = useSignal("");

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
              value={action.formData?.get("username")}
            />
            {action.value?.fieldErrors?.username && (
              <p class={styles.error}>{action.value.fieldErrors.username}</p>
            )}
          </label>
        </div>
        <div>
          <label id="label-code">
            Code:
            <input
              type="text"
              name="code"
              placeholder="123"
              value={action.formData?.get("code")}
            />
            {action.value?.fieldErrors?.code && (
              <p class={styles.error}>{action.value.fieldErrors.code}</p>
            )}
          </label>
        </div>
        {action.value?.message && (
          <p id="form-error" class={styles.error}>
            {action.value.message}
          </p>
        )}
        {action.value?.secret && (
          <p id="form-success" class={styles.success}>
            {action.value.secret}
          </p>
        )}
        <button
          value="hello"
          name="button"
          id="submit"
          disabled={action.isRunning}
        >
          Submit
        </button>
      </Form>

      <button
        type="button"
        onClick$={async () => {
          const { value } = await action.submit({
            username: "admin",
            code: 123,
            button: "hello",
          });
          console.warn(value?.secret);
          message.value = value!.secret!;
        }}
      >
        I don't wanna to play
      </button>
    </>
  );
});
