import { component$ } from "@builder.io/qwik";
import { routeAction$, zod$, z, Form } from "@builder.io/qwik-city";
import { executeQuery } from "../../actions/client";
import * as queries from "../../../dbschema/queries";

export const useCreateUser = routeAction$(
  async (data) => {
    // GEL implementation: use EdgeQL query to insert or update user
    // Map form data to EdgeQL parameters
    const params = {
      name: data.name,
      package_version: "", // You may want to collect this from the form or set a default
      has_profile: true, // You may want to collect this from the form or set a default
      dependencies: [
        {
          address: data.email,
          provider: "email", // You may want to collect this from the form or set a default
        },
      ],
    };
    const user = await executeQuery(queries.insertOrUpdateUser, params);
    return user;
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
          <input
            name="name"
            value={createUserAction.formData?.get("name") ?? ""}
          />
        </label>
        <label>
          Email
          <input
            name="email"
            value={createUserAction.formData?.get("email") ?? ""}
          />
        </label>
        <button type="submit">Create</button>
      </Form>
      {createUserAction.value && (
        <div>
          <h2>User created successfully!</h2>
        </div>
      )}
    </section>
  );
});
