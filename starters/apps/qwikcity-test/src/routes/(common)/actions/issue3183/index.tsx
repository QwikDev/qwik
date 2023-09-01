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
        <input type="hidden" name="arrayOld[]" value="0" />
        <input type="hidden" name="arrayOld[]" value="1" />
        <input type="hidden" name="arrayNew.0" value="0" />
        <input type="hidden" name="arrayNew.1" value="1" />
        <input type="hidden" name="people.0.name" value="Fred" />
        <input type="hidden" name="people.1.name" value="Sam" />

        <button id="issue3183-button" disabled={dotNotation.isRunning}>
          Dot Notation
        </button>
      </Form>
      {dotNotation.value?.success && (
        <div id="issue3183-success">
          {JSON.stringify(dotNotation.value.payload)}
        </div>
      )}
    </>
  );
});
