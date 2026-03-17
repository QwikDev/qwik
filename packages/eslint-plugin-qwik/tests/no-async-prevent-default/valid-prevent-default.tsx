import { sync$ } from '@builder.io/qwik';

export const ValidPreventDefaultTest = () => {
  return (
    <form
      onSubmit$={sync$((event: SubmitEvent) => {
        event.preventDefault();
      })}
    >
      <button type="submit">Hello World</button>
    </form>
  );
};
