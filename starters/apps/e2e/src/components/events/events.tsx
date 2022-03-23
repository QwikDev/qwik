import { component$, $, useStore, Host, EventHandler } from '@builder.io/qwik';

const qrl = $(() => {});

qrl.invoke();

export const Events = component$(() => {
  const store = useStore({
    countTransparent: 0,
    countWrapped: 0,
  });

  return $(() => {
    return (
      <Host>
        <Buttons
          onTransparentClick$={() => {
            store.countTransparent++;
          }}
          onWrappedClick$={() => {
            store.countWrapped++;
          }}
        ></Buttons>

        <p>countTransparent: {store.countTransparent}</p>
        <p>countWrapped: {store.countWrapped}</p>
      </Host>
    );
  });
});

interface ButtonProps {
  onTransparentClickQrl?: EventHandler<Event>; // QRL<(Event)=>any>
  onWrappedClickQrl?: EventHandler<number>;
}

export const Buttons = component$((props: ButtonProps) => {
  const store = useStore({ count: 0 });
  return $(() => {
    return (
      <Host>
        <span>some</span>
        <button onClickQrl={props.onTransparentClickQrl}>Transparent</button>
        <button
          onClick$={() => {
            store.count++;
            props.onWrappedClickQrl!.invoke(store.count);
          }}
        >
          Wrapped {store.count}
        </button>
      </Host>
    );
  });
});
