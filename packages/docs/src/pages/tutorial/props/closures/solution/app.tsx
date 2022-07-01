import { component$, $, QRL } from '@builder.io/qwik';

export const App = component$(() => {
  const goodbyeQrl = $(() => alert('Good Bye!'));
  return (
    <div>
      <MyComponent goodbyeQrl={goodbyeQrl} hello$={(name) => alert('Hello ' + name)} />
    </div>
  );
});

interface MyComponentProps {
  goodbyeQrl?: QRL<() => void>;
  helloQrl?: QRL<(name: string) => void>;
}
export const MyComponent = component$((props: MyComponentProps) => {
  return (
    <div>
      <button onClickQrl={props.goodbyeQrl}>hello</button>
      <button onClick$={async () => await props.helloQrl?.invoke('World')}>good bye</button>
    </div>
  );
});
