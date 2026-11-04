import { Form, routeAction$, z, zod$ } from "@qwik.dev/router";
import { component$ } from "@qwik.dev/core";
import { db } from "../../../prisma/db";

export const useCreateUser = routeAction$(
  async (data, { fail }) => {
    try {
      return await db.orm.public.User.create(data);
    } catch (error) {
      // 23505 is the PostgreSQL error code for a unique constraint violation
      if ((error as { sqlState?: string }).sqlState === "23505") {
        return fail(409, { message: "Email already in use" });
      }
      throw error;
    }
  },
  zod$({
    name: z.string(),
    email: z.string().email(),
  }),
);

export default component$(() => {
  const createUserAction = useCreateUser();
  return (
    <section>
      <h1>Create User</h1>
      <Form action={createUserAction}>
        <label>
          Name
          <input name="name" value={createUserAction.formData?.get("name")} />
        </label>
        <label>
          Email
          <input name="email" value={createUserAction.formData?.get("email")} />
        </label>
        <button type="submit">Create</button>
      </Form>
      {createUserAction.value?.failed && (
        <p>
          {createUserAction.value.message ??
            createUserAction.value.fieldErrors?.email}
        </p>
      )}
      {createUserAction.value && !createUserAction.value.failed && (
        <h2>User {createUserAction.value.name} created successfully!</h2>
      )}
    </section>
  );
});
