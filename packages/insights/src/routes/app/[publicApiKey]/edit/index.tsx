import { component$, useSignal, useTask$ } from '@builder.io/qwik';
import { routeAction$, routeLoader$, useLocation, z, zod$, Form } from '@builder.io/qwik-city';
import { formAction$, useForm, zodForm$, type InitialValues } from '@modular-forms/qwik';
import { eq } from 'drizzle-orm';
import AppCard from '~/components/app-card';
import { DiskIcon } from '~/components/icons/disk';
import { applicationTable, getDB } from '~/db';
import {
  dbAddUserToApplication,
  dbGetUsersForApplication,
  dbRemoveUserFromApplication,
} from '~/db/sql-user';
import { appUrl } from '~/routes.config';
import { ApplicationForm } from '../app.form';
import { EditIcon } from '~/components/icons/edit';

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
  const [loginForm, { Form: ModularForm, Field }] = useForm<ApplicationForm>({
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
      <h1 class="h3">
        <EditIcon />
        Edit Application
      </h1>
      <ModularForm>
        <div class="mb-10">
          <AppCard
            mode="show"
            title={loginForm.internal.fields.name?.value}
            publicApiKey={location.params.publicApiKey}
          />
        </div>
        <div>
          <label>Name</label>
          <Field name="name">
            {(field, props) => (
              <>
                <input {...props} type="text" value={field.value} />{' '}
                {field.error && <div>{field.error}</div>}
              </>
            )}
          </Field>
        </div>
        <div>
          <label>Description</label>
          <Field name="description">
            {(field, props) => (
              <>
                <input {...props} type="text" value={field.value} />
                {field.error && <div>{field.error}</div>}
              </>
            )}
          </Field>
        </div>
        <div>
          <label>URL</label>
          <Field name="url">
            {(field, props) => (
              <>
                <input {...props} type="text" value={field.value} />
                {field.error && <div>{field.error}</div>}
              </>
            )}
          </Field>
        </div>
        <div
          style={{
            'margin-top': 'calc(var(--form-element-margin-bottom) * 2)',
          }}
        >
          <button type="submit" class="button bg-white">
            <DiskIcon />
            Save
          </button>
        </div>
      </ModularForm>
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
