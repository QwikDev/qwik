import { component$, useStyles$ } from "@builder.io/qwik";
import { type DocumentHead, routeAction$, Form } from "@builder.io/qwik-city";

export const useFormAction = routeAction$((data) => {
  // This runs on the server
  // eslint-disable-next-line no-console
  console.log("Form submitted with data:", data);
  return {
    success: true,
    message: "Form submitted successfully",
  };
});

export default component$(() => {
  useStyles$(`
    .form-container {
      max-width: 42rem;
      margin: 0 auto;
    }

    .title {
      font-size: 1.875rem;
      font-weight: bold;
      margin-bottom: 1rem;
    }

    .success-message {
      background-color: #dcfce7;
      border: 1px solid #86efac;
      color: #15803d;
      padding: 0.75rem 1rem;
      border-radius: 0.375rem;
      margin-bottom: 1rem;
    }

    .form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .form-group {
      display: flex;
      flex-direction: column;
    }

    .label {
      display: block;
      font-size: 0.875rem;
      font-weight: 500;
      color: #374151;
      margin-bottom: 0.25rem;
    }

    .input,
    .textarea {
      width: 100%;
      padding: 0.5rem;
      border: 1px solid #d1d5db;
      border-radius: 0.375rem;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    }

    .input:focus,
    .textarea:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5);
    }

    .textarea {
      min-height: 6rem;
    }

    .submit-button {
      display: inline-flex;
      justify-content: center;
      padding: 0.5rem 1rem;
      font-size: 0.875rem;
      font-weight: 500;
      color: white;
      background-color: #2563eb;
      border: none;
      border-radius: 0.375rem;
      cursor: pointer;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
      align-self: flex-start;
    }

    .submit-button:hover {
      background-color: #1d4ed8;
    }

    .submit-button:focus {
      outline: none;
      box-shadow: 0 0 0 2px white, 0 0 0 4px #2563eb;
    }
  `);

  const action = useFormAction();

  return (
    <div class="form-container">
      <h1 class="title">Contact Form</h1>

      {action.value?.success ? (
        <div class="success-message">Thank you for your submission!</div>
      ) : (
        <Form action={action} class="form">
          <div class="form-group">
            <label for="name" class="label">
              Name
            </label>
            <input id="name" name="name" type="text" class="input" required />
          </div>

          <div class="form-group">
            <label for="email" class="label">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              class="input"
              required
            />
          </div>

          <div class="form-group">
            <label for="message" class="label">
              Message
            </label>
            <textarea id="message" name="message" class="textarea" required />
          </div>

          <button type="submit" class="submit-button">
            Submit
          </button>
        </Form>
      )}
    </div>
  );
});

export const head: DocumentHead = {
  title: "Contact Form - Preloader Test",
  meta: [
    {
      name: "description",
      content: "Contact form for the Preloader Test application",
    },
  ],
};
