import { $, component$, useSignal } from "@builder.io/qwik";
import { Form, routeAction$ } from "@builder.io/qwik-city";

export const useDotNotationAction = routeAction$(async (payload) => {
  return {
    success: true,
    payload: payload,
  };
});

export default component$(() => {
  const finished = useSignal(false);
  const dotNotation = useDotNotationAction();

  return (
    <>
      <h1>Dot Notation Form Inputs</h1>
      <Form
        action={dotNotation}
        onSubmit$={[
          $(() => {
            finished.value = false;
          }),
          $((evt) => dotNotation.submit(evt)),
          $(() => {
            finished.value = dotNotation.submitted;
          }),
        ]}
        id="dot-notation-form"
      >
        <input type="hidden" name="arrayOld[]" value="0" />
        <input type="hidden" name="arrayOld[]" value="1" />
        <input type="hidden" name="arrayNew.0" value="0" />
        <input type="hidden" name="arrayNew.1" value="1" />
        <input type="hidden" name="people.0.name" value="Fred" />
        <input type="hidden" name="people.1.name" value="Sam" />

        <button id="multiple-handlers-button" disabled={dotNotation.isRunning}>
          Dot Notation
        </button>
      </Form>
      {dotNotation.value?.success && (
        <div id="multiple-handlers-success">
          {JSON.stringify(dotNotation.value.payload)}
        </div>
      )}
      <div id="multiple-handlers-finished">{String(finished.value)}</div>
    </>
  );
});
