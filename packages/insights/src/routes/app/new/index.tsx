import { component$ } from '@builder.io/qwik';
import { Form, routeAction$, z, zod$ } from '@builder.io/qwik-city';
import { getDB, applicationTable } from '~/db';

export const useCreateApplicationAction = routeAction$(
  async ({ name, description }, { redirect }) => {
    const db = getDB();
    const publicApiKey = Math.round(Math.random() * Number.MAX_SAFE_INTEGER).toString(36);
    const response = await db
      .insert(applicationTable)
      .values({
        name,
        description,
        publicApiKey,
      })
      .run();
    throw redirect(302, `/app/${response.lastInsertRowid}`);
  },
  zod$({
    name: z.string().min(3).max(50),
    description: z.string().min(3).max(50),
  })
);

export default component$(() => {
  const createApplicationAction = useCreateApplicationAction();
  return (
    <div>
      <h1>Create new application</h1>
      <Form action={createApplicationAction}>
        <div>
          <label>name</label>
          <input name="name" type="text" />
        </div>
        <div>
          <label>description</label>
          <textarea name="description" />
        </div>
        <div>
          <label></label>
          <button type="submit">Create</button>
        </div>
      </Form>
    </div>
  );
});
