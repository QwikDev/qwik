import { component$, useSignal, useTask$ } from '@builder.io/qwik';
import { Form, routeAction$, routeLoader$, useLocation, z, zod$ } from '@builder.io/qwik-city';
import { formAction$, useForm, zodForm$, type InitialValues } from '@modular-forms/qwik';
import { applicationTable, getDB } from '~/db';
import { ApplicationForm } from '../app.form';
import { eq } from 'drizzle-orm';
import { appUrl } from '~/routes.config';
import AppCard from '~/components/app-card';
import styles from './styles.module.css';
import { DiskIcon } from '~/components/icons/disk';
import {
  dbAddUserToApplication,
  dbGetUsersForApplication,
  dbRemoveUserFromApplication,
} from '~/db/sql-user';

export const useFormLoader = routeLoader$<InitialValues<ApplicationForm>>(async ({ params }) => {
  const db = getDB();
  const publicApiKey = params.publicApiKey;
  const app = await db
    .select()
    .from(applicationTable)
    .where(eq(applicationTable.publicApiKey, publicApiKey))
    .limit(1)
    .get();
  return app as ApplicationForm;
});

export const useUsers = routeLoader$<string[]>(async ({ params }) => {
  const publicApiKey = params.publicApiKey;
  const users = await dbGetUsersForApplication(publicApiKey);
  return users;
});

export const useFormAction = formAction$<ApplicationForm>(
  async ({ name, description, url }, { redirect, params }) => {
    const db = getDB();
    db.update(applicationTable)
      .set({
        name,
        url,
        description,
      })
      .where(eq(applicationTable.publicApiKey, params.publicApiKey))
      .run();
    throw redirect(302, appUrl(`/app/[publicApiKey]/`, { publicApiKey: params.publicApiKey }));
  },
  zodForm$(ApplicationForm)
);

export const useRemoveUserAction = routeAction$(
  async ({ email }, { params }) => {
    await dbRemoveUserFromApplication(email, params.publicApiKey);
  },
  zod$({
    email: z.string().email(),
  })
);

export const useAddUserAction = routeAction$(
  async ({ email }, { params }) => {
    await dbAddUserToApplication(email, params.publicApiKey);
  },
  zod$({
    email: z.string().email(),
  })
);

export default component$(() => {
  // const form = useFormLoader();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [loginForm, { Form: AppForm, Field, FieldArray }] = useForm<ApplicationForm>({
    loader: useFormLoader(),
    action: useFormAction(),
    validate: zodForm$(ApplicationForm),
  });
  const location = useLocation();
  const users = useUsers();
  const removeUserAction = useRemoveUserAction();
  const addUserAction = useAddUserAction();
  const addEmail = useSignal('');
  useTask$(({ track }) => {
    const isRunning = track(() => addUserAction.isRunning);
    if (!isRunning) {
      addEmail.value = '';
    }
  });

  return (
    <div>
      <h1 class="h3">Edit Application</h1>
      <AppForm>
        <div class={styles['app-card-wrapper']}>
          <AppCard
            mode="show"
            title={loginForm.internal.fields.name?.value}
            publicApiKey={location.params.publicApiKey}
          />
        </div>
        <div>
          <label>Name</label>
          <Field name="name">
            {(field, props) => <input {...props} type="text" value={field.value} />}
          </Field>
        </div>
        <div>
          <label>Description</label>
          <Field name="description">
            {(field, props) => <input {...props} type="text" value={field.value} />}
          </Field>
        </div>
        <div>
          <label>URL</label>
          <Field name="url">
            {(field, props) => <input {...props} type="text" value={field.value} />}
          </Field>
        </div>
        <div style={{ 'margin-top': 'calc(var(--form-element-margin-bottom) * 2)' }}>
          <button type="submit" class="button">
            <DiskIcon />
            Save
          </button>
        </div>
      </AppForm>
      <label>Allowed Users</label>
      <ul>
        {users.value.map((user) => (
          <Form action={removeUserAction} key={user}>
            <li>
              {user}
              <input type="hidden" name="email" value={user} />
              <button type="submit" class="button">
                ❌
              </button>
            </li>
          </Form>
        ))}
      </ul>
      <label>Add Users</label>
      <Form action={addUserAction}>
        <div>
          <input type="text" name="email" bind:value={addEmail} />
          <button type="submit" class="button">
            ➕
          </button>
        </div>
      </Form>
    </div>
  );
});
