import { component$, useSignal } from '@qwik.dev/core';
import { formAction$, useForm, zodForm$ } from '@modular-forms/qwik';
import { type DocumentHead } from '@qwik.dev/router';
import BackLink from '~/components/back-link';
import Button from '~/components/button';
import FormField from '~/components/form-field';
import Layout from '~/components/layout';
import { applicationTable, getDB, userApplicationMap } from '~/db';
import { ApplicationForm } from '../[publicApiKey]/app.form';
import { getInsightUser } from '~/routes/app/layout';

export const head: DocumentHead = {
  title: 'Create application | Qwik Insights',
};

export const useFormAction = formAction$<ApplicationForm>(
  async ({ name, description, url }, { redirect, sharedMap }) => {
    const db = getDB();
    const publicApiKey = Math.round(Math.random() * Number.MAX_SAFE_INTEGER).toString(36);

    const insightUser = getInsightUser(sharedMap);

    const insert = await db
      .insert(applicationTable)
      .values({
        name,
        description,
        publicApiKey,
        url,
      })
      .run();

    const applicationId = insert.lastInsertRowid;

    await db
      .insert(userApplicationMap)
      .values({
        userId: insightUser.userId,
        applicationId: parseInt(`${applicationId}`),
      })
      .run();

    redirect(302, `/app/${publicApiKey}/`);
  },
  zodForm$(ApplicationForm)
);

export default component$(() => {
  const [, { Form, Field }] = useForm<ApplicationForm>({
    loader: useSignal({ name: '', description: '', url: '' }),
    action: useFormAction(),
    validate: zodForm$(ApplicationForm),
  });

  return (
    <Layout>
      <div class="mx-auto max-w-editorial-shell px-editorial-6 py-editorial-12">
        <BackLink href="/app/">Back to applications</BackLink>

        <section class="mt-editorial-5" aria-labelledby="create-application-title">
          <p class="text-editorial-11 font-semibold tracking-[0.02em] text-editorial-muted uppercase">
            New application
          </p>
          <h1
            id="create-application-title"
            class="mt-editorial-3 text-editorial-44 font-bold leading-[1.2] tracking-[-0.03em] text-editorial-primary"
          >
            Create an application
          </h1>
          <p class="mt-editorial-1 text-editorial-14 leading-[1.45] text-editorial-secondary">
            Add the project details used to identify this application in Qwik Insights.
          </p>
        </section>

        <div class="mt-editorial-6 border-t border-editorial-border pt-editorial-8">
          <section aria-labelledby="application-details-title">
            <p class="text-editorial-11 font-semibold tracking-[0.02em] text-editorial-muted uppercase">
              Application details
            </p>
            <h2
              id="application-details-title"
              class="mt-editorial-3 text-editorial-24 font-semibold leading-[1.2] tracking-[-0.01em] text-editorial-primary"
            >
              Project identity
            </h2>
            <p class="mt-editorial-1 text-editorial-14 text-editorial-secondary">
              Shown in the application switcher and dashboard navigation.
            </p>

            <Form class="mt-editorial-8 flex max-w-editorial-form flex-col gap-editorial-8">
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
                  Create application
                </Button>
              </div>
            </Form>
          </section>
        </div>
      </div>
    </Layout>
  );
});
