import { component$ } from '@builder.io/qwik';
interface Value {
  value: 12;
}
type NullValue = Value | null;

function useMethod(foo: string, bar: () => string) {
  return foo + bar();
}

export const HelloWorld = component$(() => {
  const bar = () => 'bar';
  const foo = 'bar';
  const a: Value = { value: 12 };
  const b: NullValue = null;
  useMethod(foo, bar);
  return <div></div>;
});
