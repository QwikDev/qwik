import { sync$ } from '@builder.io/qwik';

export const ValidPreventDefaultTest = () => {
  const handleSubmit = sync$((event: SubmitEvent) => {
    event.preventDefault();
  });
  return (
    <form onSubmit$={handleSubmit}>
      <button type="submit">Hello World</button>
    </form>
  );
};
