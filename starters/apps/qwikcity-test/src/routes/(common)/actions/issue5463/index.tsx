import { component$ } from "@builder.io/qwik";
import { Form, globalAction$, zod$ } from "@builder.io/qwik-city";

export const useDotNotationAction = globalAction$(
  async (payload) => {
    return {
      success: true,
      payload: payload,
    };
  },
  zod$((z) =>
    z.object({
      credentials: z.object({
        username: z.string(),
        password: z.string(),
      }),
      evenMoreComplex: z.object({
        deep: z.object({
          firstName: z.string(),
        }),
      }),
    }),
  ),
);

export default component$(() => {
  const dotNotation = useDotNotationAction();

  type ConfirmType = Record<
    | "credentials.username"
    | "credentials.password"
    | "evenMoreComplex.deep.firstName",
    string
  >;

  const errors = dotNotation.value?.fieldErrors satisfies
    | ConfirmType
    | undefined;

  return (
    <>
      <h1>Dot Notation Form Errors</h1>
      <Form action={dotNotation} id="dot-notation-form">
        <input
          type="hidden"
          name="credentials.username"
          value="user"
          class={{
            error: dotNotation.value?.fieldErrors?.["credentials.username"],
          }}
        />
        <input
          type="hidden"
          name="credentials.password"
          value="pass"
          class={{
            error: dotNotation.value?.fieldErrors?.["credentials.password"],
          }}
        />
        <input
          type="hidden"
          name="credentials.password"
          value="pass"
          class={{
            error:
              dotNotation.value?.fieldErrors?.[
                "evenMoreComplex.deep.firstName"
              ],
          }}
        />
        {errors?.["credentials.password"] ?? "no error"}
        <button>Dot Notation</button>
      </Form>
    </>
  );
});
