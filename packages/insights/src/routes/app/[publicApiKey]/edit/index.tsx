import { component$, useSignal, useTask$ } from '@qwik.dev/core';
import { routeAction$, routeLoader$, useLocation, valibot$, zod$, Form } from '@qwik.dev/router';
import * as z from 'zod';
import { Field, Form as SchemaForm, reset, useField, useForm$ } from '@formisch/qwik';
import { eq } from 'drizzle-orm';
import AppCard from '~/components/app-card';
import { DiskIcon } from '~/components/icons/disk';
import { applicationTable, getDB } from '~/db';
import {
  dbAddUserToApplication,
  dbGetUsersForApplication,
  dbRemoveUserFromApplication,
} from '~/db/sql-user';
import { ApplicationForm } from '../app.form';
import { EditIcon } from '~/components/icons/edit';

export const useFormLoader = routeLoader$<ApplicationForm>(async ({ params }) => {
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

export const useFormAction = routeAction$(
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
    throw redirect(302, `/app/${params.publicApiKey}/`);
  },
  valibot$(ApplicationForm)
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
  const formLoader = useFormLoader();
  const action = useFormAction();
  const form = useForm$(() => ({
    schema: ApplicationForm,
    initialInput: formLoader.value,
  }));
  const nameField = useField(form, { path: ['name'] });
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
  useTask$(({ track }) => {
    const loaded = track(() => formLoader.value);
    reset(form, { initialInput: loaded });
  });

  return (
    <div>
      <h1 class="h3">
        <EditIcon />
        Edit Application
      </h1>
      <SchemaForm of={form} onSubmit$={(output) => action.submit(output)}>
        <div class="mb-10">
          <AppCard
            mode="show"
            title={nameField.input.value}
            publicApiKey={location.params.publicApiKey}
          />
        </div>
        <div>
          <label>Name</label>
          <Field
            of={form}
            path={['name']}
            render$={(field) => (
              <>
                <input {...field.props} type="text" value={field.input.value} />{' '}
                {field.errors.value && <div>{field.errors.value[0]}</div>}
              </>
            )}
          />
        </div>
        <div>
          <label>Description</label>
          <Field
            of={form}
            path={['description']}
            render$={(field) => (
              <>
                <input {...field.props} type="text" value={field.input.value} />
                {field.errors.value && <div>{field.errors.value[0]}</div>}
              </>
            )}
          />
        </div>
        <div>
          <label>URL</label>
          <Field
            of={form}
            path={['url']}
            render$={(field) => (
              <>
                <input {...field.props} type="text" value={field.input.value} />
                {field.errors.value && <div>{field.errors.value[0]}</div>}
              </>
            )}
          />
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
      </SchemaForm>
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
