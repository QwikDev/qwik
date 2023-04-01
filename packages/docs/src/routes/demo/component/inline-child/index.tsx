import { component$ } from '@builder.io/qwik';

// Inline component: declared using a standard function.
export const MyButton = (props: { text: string }) => {
  return <button>{props.text}</button>;
};

// Component: declared using `component$()`.
export default component$(() => {
  return (
    <div>
      Some text:
      <MyButton text="Click me" />
    </div>
  );
});
