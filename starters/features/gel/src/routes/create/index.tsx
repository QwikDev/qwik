import { component$ } from "@builder.io/qwik";
import { routeAction$, zod$, z, Form } from "@builder.io/qwik-city";
import { insertUser } from "../../actions/user";

export const useCreateUser = routeAction$(
  async ({ name, email }) => {
    const user = await insertUser(name, email, true);
    if (!user)
      return { error: "A user already exists with that email.", user: null };
    return { error: null, user };
  },
  zod$({
    name: z.string().min(1, { message: "Name is required" }),
    email: z.string().email({ message: "Invalid email address" }),
  }),
);

export default component$(() => {
  const action = useCreateUser();
  const errors = action.value?.fieldErrors;
  const customError = action.value?.error;

  return (
    <section>
      <h1>Create User</h1>
      <Form action={action}>
        <label>
          Name
          <input name="name" value={action.formData?.get("name") ?? ""} />
        </label>
        <label>
          Email
          <input name="email" value={action.formData?.get("email") ?? ""} />
        </label>
        <button type="submit">Create</button>
      </Form>
      {action.value?.user && <h2>User created successfully!</h2>}
      {(errors || customError) && (
        <div style={{ color: "red" }}>
          {errors?.name && (
            <div>
              <h2>{errors.name}</h2>
            </div>
          )}
          {errors?.email && (
            <div>
              <h2>{errors.email}</h2>
            </div>
          )}
          {customError && (
            <div>
              <h2>{customError}</h2>
            </div>
          )}
        </div>
      )}
    </section>
  );
});
