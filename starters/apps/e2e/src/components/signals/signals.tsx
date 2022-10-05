import {
  component$,
  useRef,
  Ref,
  Signal,
  useSignal,
  useStore,
  useClientEffect$,
} from '@builder.io/qwik';

export const Signals = component$(() => {
  const ref = useRef();
  const ref2 = useSignal<Element>();
  const id = useSignal(0);
  const signal = useSignal('');
  const store = useStore({
    foo: 10,
    attribute: 'even',
    signal,
  });

  useClientEffect$(() => {
    ref.current!.setAttribute('data-set', 'ref');
    ref2.value!.setAttribute('data-set', 'ref2');
  });

  return (
    <div aria-label={store.attribute}>
      <button
        id="count"
        onClick$={() => {
          store.foo++;
          store.attribute = store.foo % 2 === 0 ? 'even' : 'odd';
        }}
      >
        Increment
      </button>
      <button
        id="click"
        onClick$={() => {
          signal.value = 'clicked';
        }}
      >
        Click
      </button>
      <button
        id="increment-id"
        onClick$={() => {
          id.value++;
        }}
      >
        Increment ID
      </button>
      <Child
        text="Message"
        count={store.foo}
        ref={ref}
        ref2={ref2}
        signal={signal}
        signal2={store.signal}
        id={id.value}
      />
    </div>
  );
});

interface ChildProps {
  count: number;
  text: string;
  ref: Ref<Element>;
  ref2: Signal<Element | undefined>;
  signal: Signal<string>;
  signal2: Signal<string>;
  id: number;
}
export const Child = component$((props: ChildProps) => {
  return (
    <>
      <div id="text" ref={props.ref}>
        Text: {props.text}
      </div>
      <div id="id">Id: {props.id}</div>
      <div id="computed">{'computed: ' + props.signal.value}</div>
      <div id="stuff" ref={props.ref2}>
        Stuff: {props.count}
      </div>
    </>
  );
});
