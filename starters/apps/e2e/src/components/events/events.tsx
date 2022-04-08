import { component$, useStore, Host, EventHandler } from '@builder.io/qwik';

export const Events = component$(() => {
  const store = useStore({
    countTransparent: 0,
    countWrapped: 0,
  });

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

      <p id="count-transparent">countTransparent: {store.countTransparent}</p>
      <p id="count-wrapped">countWrapped: {store.countWrapped}</p>
    </Host>
  );
});

interface ButtonProps {
  onTransparentClickQrl?: EventHandler<Event>; // QRL<(Event)=>any>
  onWrappedClickQrl?: EventHandler<number>;
}

export const Buttons = component$((props: ButtonProps) => {
  const store = useStore({ count: 0 });
  return (
    <Host>
      <span>some</span>
      <button id="btn-transparent" onClickQrl={props.onTransparentClickQrl}>
        Transparent
      </button>
      <button
        id="btn-wrapped"
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
