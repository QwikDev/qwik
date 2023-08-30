import { component$, useStylesScoped$ } from '@builder.io/qwik';
import { routeAction$, valibot$, Form } from '@builder.io/qwik-city';
import styles from './styles.css';
import { string, minLength } from 'valibot';

export const useAddUser = routeAction$(
  async (user) => {
    // The "user" is strongly typed: { firstName: string, lastName: string }
    return {
      success: true,
      firstName: user.firstName,
    };
  },
  // Valibot schema is used to validate that the FormData includes "firstName" and "lastName"
  valibot$({
    firstName: string([minLength(1)]),
    lastName: string([minLength(1)]),
  })
);

export default component$(() => {
  const action = useAddUser();
  useStylesScoped$(styles);

  return (
    <>
      <Form action={action} class="flow">
        <label>
          <span>First name:</span>
          <input name="firstName" />
          <p data-status="error">
            {action.value?.failed && <p>{action.value.nested?.firstName}</p>}
          </p>
        </label>

        <label>
          <span>Last name:</span>
          <input name="lastName" />
        </label>
        <p data-status="error">
          {action.value?.failed && <p>{action.value.nested?.lastName}</p>}
        </p>

        <button type="submit">Add user</button>

        {action.value?.success && (
          <p data-status="success">
            User {action.value.firstName} added successfully.
          </p>
        )}
      </Form>
    </>
  );
});
