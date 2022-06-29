import { component$, Host, QRL, Slot, useStore } from '@builder.io/qwik';

export const App = component$(() => {
  const store = useStore({ count: 0 });
  return <MyButton onClick$={() => store.count++}>{store.count}</MyButton>;
});

interface MyButtonProps {
  onClickQrl?: QRL<(event: Event) => void>;
}
export const MyButton = component$(
  (props: MyButtonProps) => {
    return (
      <Host onClickQrl={props.onClickQrl} style={{}}>
        <Slot />
      </Host>
    );
  },
  { tagName: 'button' }
);
