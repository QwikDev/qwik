import { component$ } from '@qwik.dev/core';
import { routeAction$, valibot$ } from '@qwik.dev/router';
import { Field, Form, useForm$ } from '@formisch/qwik';
import Container from '~/components/container';
import { DiskIcon } from '~/components/icons/disk';
import Layout from '~/components/layout';
import { applicationTable, getDB, userApplicationMap } from '~/db';
import { ApplicationForm } from '../[publicApiKey]/app.form';
import styles from './styles.module.css';
import { getInsightUser } from '~/routes/app/layout';

export const useFormAction = routeAction$(
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
  valibot$(ApplicationForm)
);

export default component$(() => {
  const action = useFormAction();
  const form = useForm$(() => ({
    schema: ApplicationForm,
  }));
  return (
    <Layout mode="bright">
      <Container position="center" width="small"></Container>
      <div class={[styles['add-app-wrapper'], 'p-6']}>
        <h1 class="h3">Create Application</h1>
        <Form of={form} onSubmit$={(output) => action.submit(output)}>
          <div>
            <label>Name</label>
            <Field
              of={form}
              path={['name']}
              render$={(field) => (
                <>
                  <input
                    {...field.props}
                    type="text"
                    value={field.input.value}
                    class="border-2 border-gray-300"
                  />
                  {field.errors.value && <p class="text-red-800">{field.errors.value[0]}</p>}
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
                  <input
                    {...field.props}
                    type="url"
                    value={field.input.value}
                    class="border-2 border-gray-300"
                  />
                  {field.errors.value && <p class="text-red-800">{field.errors.value[0]}</p>}
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
                  <input
                    {...field.props}
                    type="text"
                    value={field.input.value}
                    class="border-2 border-gray-300"
                  />
                  {field.errors.value && <p class="text-red-800">{field.errors.value[0]}</p>}
                </>
              )}
            />
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
