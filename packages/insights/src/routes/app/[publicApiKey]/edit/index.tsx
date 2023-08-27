import { component$ } from '@builder.io/qwik';
import { routeLoader$, useLocation } from '@builder.io/qwik-city';
import { formAction$, useForm, zodForm$, type InitialValues } from '@modular-forms/qwik';
import { applicationTable, getDB } from '~/db';
import { ApplicationForm } from '../app.form';
import { eq } from 'drizzle-orm';
import { appUrl } from '~/routes.config';
import AppCard from '~/components/app-card';
import styles from './styles.module.css';
import { DiskIcon } from '~/components/icons/disk';

export const useFormLoader = routeLoader$<InitialValues<ApplicationForm>>(async ({ params }) => {
  const db = getDB();
  const app = await db
    .select()
    .from(applicationTable)
    .where(eq(applicationTable.publicApiKey, params.publicApiKey))
    .limit(1)
    .get();
  return app as ApplicationForm;
});

export const useFormAction = formAction$<ApplicationForm>(
  async ({ name, description }, { redirect, params }) => {
    const db = getDB();
    db.update(applicationTable)
      .set({
        name,
        description,
      })
      .where(eq(applicationTable.publicApiKey, params.publicApiKey))
      .run();
    throw redirect(302, appUrl(`/app/[publicApiKey]/`, { publicApiKey: params.publicApiKey }));
  },
  zodForm$(ApplicationForm)
);

export default component$(() => {
  // const form = useFormLoader();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [loginForm, { Form, Field, FieldArray }] = useForm<ApplicationForm>({
    loader: useFormLoader(),
    action: useFormAction(),
    validate: zodForm$(ApplicationForm),
  });
  const location = useLocation();

  return (
    <div>
      <h1 class="h3">Edit Application</h1>
      <Form>
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
        <div style={{ 'margin-top': 'calc(var(--form-element-margin-bottom) * 2)' }}>
          <button type="submit" class="button">
            <DiskIcon />
            Save
          </button>
        </div>
      </Form>
    </div>
  );
});
