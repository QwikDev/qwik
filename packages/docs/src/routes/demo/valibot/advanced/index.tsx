import { component$, useStylesScoped$ } from '@builder.io/qwik';
import { routeAction$, valibot$, Form } from '@builder.io/qwik-city';
import styles from './styles.css';
import { string, object, optional, minLength } from 'valibot';

export const useAddUser = routeAction$(
  async (user) => {
    // The "user" is still strongly typed, but firstname
    // is now optional: { firstName?: string | undefined, lastName: string }
    return {
      success: true,
      firstName: user.firstName,
    };
  },
  // Valibot schema is used to validate that the FormData includes "firstName" and "lastName"
  valibot$((ev) => {
    // lastName is optional the query parameter "lastname=optional" is present
    const firstName = string([minLength(1)]);
    const lastName =
      ev.url.searchParams.get('lastname') === 'optional'
        ? optional(string())
        : string([minLength(1)]);

    return object({
      firstName,
      lastName,
    });
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
            {
              // @ts-expect-error
              action.value?.failed && <p>{action.value.nested?.firstName}</p>
            }
          </p>
        </label>

        <label>
          <span>Last name:</span>
          <input name="lastName" />
        </label>
        <p data-status="error">
          {
            // @ts-expect-error
            action.value?.failed && <p>{action.value.nested?.lastName}</p>
          }
        </p>

        <button type="submit">Add user</button>

        {action.value?.success && (
          <p data-status="success">
            User {action.value.firstName as string} added successfully.
          </p>
        )}
      </Form>
    </>
  );
});
