import { component$ } from "@builder.io/qwik";
import { Form, globalAction$ } from "@builder.io/qwik-city";

export const useDotNotationAction = globalAction$(async (payload) => {
  return {
    success: true,
    payload: payload,
  };
});

export default component$(() => {
  const dotNotation = useDotNotationAction();

  return (
    <>
      <h1>Dot Notation Form Inputs</h1>
      <Form action={dotNotation} id="dot-notation-form">
        <input type="hidden" name="credentials.username" value="user" />
        <input type="hidden" name="credentials.password" value="pass" />
        <input type="hidden" name="array[]" value="1" />
        <input type="hidden" name="array[]" value="2" />
        <button id="issue3497-button" disabled={dotNotation.isRunning}>
          Dot Notation
        </button>
      </Form>
      {dotNotation.value?.success && (
        <div id="issue3497-success">
          {JSON.stringify(dotNotation.value.payload)}
        </div>
      )}
    </>
  );
});
