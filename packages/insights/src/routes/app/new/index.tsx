import { component$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';
import { formAction$, useForm, zodForm$, type InitialValues } from '@modular-forms/qwik';
import { applicationTable, getDB } from '~/db';
import { ApplicationForm } from '../[publicApiKey]/app.form';

export const useFormLoader = routeLoader$<InitialValues<ApplicationForm>>(() => {
  return {
    name: '',
    description: '',
  } satisfies ApplicationForm;
});

export const useFormAction = formAction$<ApplicationForm>(
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
  zodForm$(ApplicationForm)
);

export default component$(() => {
  const [loginForm, { Form, Field, FieldArray }] = useForm<ApplicationForm>({
    loader: useFormLoader(),
    action: useFormAction(),
    validate: zodForm$(ApplicationForm),
  });

  return (
    <div>
      <h1>Create new application</h1>
      <Form>
        <div>
          <label>Name:</label>
          <Field name="name">
            {(field, props) => <input {...props} type="text" value={field.value} />}
          </Field>
        </div>
        <div>
          <label>Description:</label>
          <Field name="name">{(field, props) => <textarea {...props} value={field.value} />}</Field>
        </div>
        <div>
          <label></label>
          <button type="submit">Create</button>
        </div>
      </Form>
    </div>
  );
});
