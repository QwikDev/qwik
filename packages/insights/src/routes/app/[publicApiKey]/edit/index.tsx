import { component$ } from '@builder.io/qwik';
import { routeLoader$, useLocation } from '@builder.io/qwik-city';
import { formAction$, useForm, zodForm$, type InitialValues } from '@modular-forms/qwik';
import { applicationTable, getDB } from '~/db';
import { ApplicationForm } from '../../[publicApiKey]/app.form';
import { eq } from 'drizzle-orm';
import { appUrl } from '~/routes.config';

export const useFormLoader = routeLoader$<InitialValues<ApplicationForm>>(async ({ params }) => {
  if (isCreateMode(params)) {
    return {
      name: '',
      description: '',
    };
  } else {
    const db = getDB();
    const app = await db
      .select()
      .from(applicationTable)
      .where(eq(applicationTable.publicApiKey, params.publicApiKey))
      .limit(1)
      .get();
    return app as ApplicationForm;
  }
});

export const useFormAction = formAction$<ApplicationForm>(
  async ({ name, description }, { redirect, params }) => {
    const db = getDB();
    if (isCreateMode(params)) {
      const publicApiKey = Math.round(Math.random() * Number.MAX_SAFE_INTEGER).toString(36);
      await db
        .insert(applicationTable)
        .values({
          name,
          description,
          publicApiKey,
        })
        .run();
      redirect(302, appUrl(`/app/[publicApiKey]/`, { publicApiKey }));
    } else {
      db.update(applicationTable)
        .set({
          name,
          description,
        })
        .where(eq(applicationTable.publicApiKey, params.publicApiKey))
        .run();
      throw redirect(302, appUrl(`/app/[publicApiKey]/`, { publicApiKey: params.publicApiKey }));
    }
  },
  zodForm$(ApplicationForm)
);

export default component$(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [loginForm, { Form, Field, FieldArray }] = useForm<ApplicationForm>({
    loader: useFormLoader(),
    action: useFormAction(),
    validate: zodForm$(ApplicationForm),
  });
  const location = useLocation();
  const isCreate = isCreateMode(location.params);

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
          <Field name="description">
            {(field, props) => <textarea {...props} value={field.value} />}
          </Field>
        </div>
        <div>
          <label></label>
          <button type="submit">{isCreate ? 'Create' : 'Save'}</button>
        </div>
      </Form>
    </div>
  );
});

function isCreateMode(params: Readonly<Record<string, string>>) {
  return params.publicApiKey == '__new__';
}
