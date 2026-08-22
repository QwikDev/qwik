import { component$, useSignal, useTask$ } from '@qwik.dev/core';
import {
  Form,
  routeAction$,
  routeLoader$,
  useLocation,
  z,
  zod$,
  type DocumentHead,
} from '@qwik.dev/router';
import { formAction$, useForm, zodForm$, type InitialValues } from '@modular-forms/qwik';
import { eq } from 'drizzle-orm';
import AppCard from '~/components/app-card';
import Button from '~/components/button';
import FormField from '~/components/form-field';
import { DiskIcon } from '~/components/icons/disk';
import PageHeader from '~/components/page-header';
import { applicationTable, getDB } from '~/db';
import {
  dbAddUserToApplication,
  dbGetUsersForApplication,
  dbRemoveUserFromApplication,
} from '~/db/sql-user';
import { ApplicationForm } from '../app.form';

export const head: DocumentHead = {
  title: 'Edit application | Qwik Insights',
};

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
    throw redirect(302, `/app/${params.publicApiKey}/`);
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
  const form = useFormLoader();
  const [loginForm, { Form: ModularForm, Field }] = useForm<ApplicationForm>({
    loader: form,
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
    <div class="font-editorial-ui text-editorial-primary">
      <PageHeader
        eyebrow="Application settings"
        title="Edit application"
        description="Update project details and control who can access this application's insights."
      />

      <div class="mt-editorial-6 grid gap-editorial-10 border-t border-editorial-border pt-editorial-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="application-details-title">
          <p class="text-editorial-11 font-semibold tracking-[0.02em] text-editorial-muted uppercase">
            Application details
          </p>
          <h2
            id="application-details-title"
            class="mt-editorial-3 text-editorial-24 font-semibold leading-[1.2] tracking-[-0.01em]"
          >
            Project identity
          </h2>
          <p class="mt-editorial-1 text-editorial-14 text-editorial-secondary">
            Shown in the application switcher and dashboard navigation.
          </p>

          <ModularForm class="mt-editorial-8 flex max-w-editorial-form flex-col gap-editorial-8">
            <Field name="name">
              {(field, props) => (
                <FormField
                  {...props}
                  id="application-name"
                  type="text"
                  label="Name"
                  value={field.value}
                  error={field.error}
                  placeholder="Qwik Docs · Production"
                  autocomplete="organization"
                />
              )}
            </Field>
            <Field name="url">
              {(field, props) => (
                <FormField
                  {...props}
                  id="application-url"
                  type="url"
                  label="URL"
                  value={field.value}
                  error={field.error}
                  placeholder="https://qwik.dev"
                  inputMode="url"
                />
              )}
            </Field>
            <Field name="description">
              {(field, props) => (
                <FormField
                  {...props}
                  id="application-description"
                  type="text"
                  label="Description"
                  value={field.value}
                  error={field.error}
                  placeholder="Production application for Qwik Docs"
                />
              )}
            </Field>
            <div class="mb-0 pt-editorial-2">
              <Button type="submit" theme="primary">
                <DiskIcon class="size-4" />
                Save changes
              </Button>
            </div>
          </ModularForm>
        </section>

        <aside aria-label="Application preview">
          <p class="mb-editorial-3 text-editorial-11 font-semibold tracking-[0.02em] text-editorial-muted uppercase">
            Application preview
          </p>
          <AppCard
            mode="show"
            title={loginForm.internal.fields.name?.value}
            publicApiKey={location.params.publicApiKey}
          />
        </aside>
      </div>

      <section
        class="mt-editorial-12 border-t border-editorial-border pt-editorial-8"
        aria-labelledby="application-access-title"
      >
        <p class="text-editorial-11 font-semibold tracking-[0.02em] text-editorial-muted uppercase">
          Access
        </p>
        <h2
          id="application-access-title"
          class="mt-editorial-3 text-editorial-24 font-semibold leading-[1.2] tracking-[-0.01em]"
        >
          Allowed users
        </h2>
        <p class="mt-editorial-1 text-editorial-14 text-editorial-secondary">
          People listed here can open this application and its analytics.
        </p>

        {users.value.length ? (
          <ul class="mt-editorial-6 max-w-editorial-form border-t border-editorial-border">
            {users.value.map((user) => (
              <li
                key={user}
                class="flex items-center justify-between gap-editorial-6 border-b border-editorial-border py-editorial-4"
              >
                <span class="min-w-0 truncate text-editorial-14">{user}</span>
                <Form action={removeUserAction}>
                  <input type="hidden" name="email" value={user} />
                  <Button type="submit" theme="danger" class="!min-h-[41px]">
                    Remove
                  </Button>
                </Form>
              </li>
            ))}
          </ul>
        ) : (
          <p class="mt-editorial-6 text-editorial-14 text-editorial-muted">
            No users have access yet.
          </p>
        )}

        <Form
          action={addUserAction}
          class="mt-editorial-8 grid max-w-editorial-form gap-editorial-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
        >
          <FormField
            id="allowed-user-email"
            type="email"
            name="email"
            label="Add user"
            bind:value={addEmail}
            placeholder="developer@example.com"
            autocomplete="email"
            class="w-full"
          />
          <Button type="submit" theme="primary" class="min-h-editorial-11">
            Add user
          </Button>
        </Form>
      </section>
    </div>
  );
});
