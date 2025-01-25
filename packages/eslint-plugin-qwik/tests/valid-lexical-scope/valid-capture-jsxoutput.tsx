import { component$, useTask$, JSXOutput, useStore } from '@builder.io/qwik';

type FooState = {
  foo?: JSXOutput;
};

export default component$(() => {
  const state = useStore<FooState>({});
  state.foo = <div>Foo</div>;

  useTask$(() => {
    console.log(state.foo);
  });
  return <></>;
});
