import { component$ } from "@builder.io/qwik";
import { routeAction$, zod$, z, Form } from "@builder.io/qwik-city";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { schema } from "../../../db/schema";

export const useCreateUser = routeAction$(
  async (data, requestEvent) => {
    const DATABASE_URL = requestEvent.env.get("DATABASE_URL");
    const sql = neon(DATABASE_URL!);
    const db = drizzle(sql as NeonQueryFunction<boolean, boolean>, { schema });
    const user = await db.insert(schema.users).values(data);
    return user;
  },
  zod$({
    name: z.string(),
    email: z.string().email(),
  })
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
      {createUserAction.value && (
        <div>
          <h2>User created successfully!</h2>
        </div>
      )}
    </section>
  );
});
