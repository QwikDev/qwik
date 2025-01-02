import { component$, useTask$, JSXOutput, useStore } from '@builder.io/qwik';

type FooState = {
  foo?: JSXOutput;
};

export default component$(() => {
  const state = useStore<FooState>({});
  state.foo = <div>Foo</div>;

  useTask$(() => {
    /* eslint no-console: [, { allow: ["log"] }] */
    console.log(state.foo);
  });
  return <></>;
});
