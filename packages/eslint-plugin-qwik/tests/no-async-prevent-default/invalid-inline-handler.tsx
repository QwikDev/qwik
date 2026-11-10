// Expect error: { "messageId": "noAsyncPreventDefault" }
// Expect error: { "messageId": "noAsyncStopPropagation" }
export const InvalidInlineHandler = () => {
  return (
    <form
      onSubmit$={(event: SubmitEvent) => {
        event.preventDefault();
      }}
    >
      <button type="button" onClick$={(event: MouseEvent) => event.stopImmediatePropagation()}>
        Hello World
      </button>
    </form>
  );
};
