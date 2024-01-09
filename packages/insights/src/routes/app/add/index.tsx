import { component$, useSignal } from '@builder.io/qwik';
import { formAction$, useForm, zodForm$ } from '@modular-forms/qwik';
import Container from '~/components/container';
import { DiskIcon } from '~/components/icons/disk';
import Layout from '~/components/layout';
import { applicationTable, getDB, userApplicationMap } from '~/db';
import { appUrl } from '~/routes.config';
import { ApplicationForm } from '../[publicApiKey]/app.form';
import styles from './styles.module.css';
import { getInsightUser } from '~/routes/app/layout';

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

    redirect(302, appUrl(`/app/[publicApiKey]/`, { publicApiKey }));
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
    <Layout mode="bright">
      <Container position="center" width="small"></Container>
      <div class={[styles['add-app-wrapper'], 'p-6']}>
        <h1 class="h3">Create Application</h1>
        <Form>
          <div>
            <label>Name</label>
            <Field name="name">
              {(field, props) => (
                <>
                  <input
                    {...props}
                    type="text"
                    value={field.value}
                    class="border-2 border-gray-300"
                  />
                  {field.error && <p class="text-red-800">{field.error}</p>}
                </>
              )}
            </Field>
          </div>
          <div>
            <label>URL</label>
            <Field name="url">
              {(field, props) => (
                <>
                  <input
                    {...props}
                    type="url"
                    value={field.value}
                    class="border-2 border-gray-300"
                  />
                  {field.error && <p class="text-red-800">{field.error}</p>}
                </>
              )}
            </Field>
          </div>
          <div>
            <label>Description</label>
            <Field name="description">
              {(field, props) => (
                <>
                  <input
                    {...props}
                    type="text"
                    value={field.value}
                    class="border-2 border-gray-300"
                  />
                  {field.error && <p class="text-red-800">{field.error}</p>}
                </>
              )}
            </Field>
          </div>
          <div
            style={{
              'margin-top': 'calc(var(--form-element-margin-bottom) * 2)',
            }}
          >
            <button type="submit" class="button">
              <DiskIcon />
              Create
            </button>
          </div>
        </Form>
      </div>
    </Layout>
  );
});
