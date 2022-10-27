import {
  component$,
  useRef,
  Ref,
  Signal,
  useSignal,
  useStore,
  useClientEffect$,
  useWatch$,
} from '@builder.io/qwik';
import { delay } from '../resource/resource';

export const Signals = component$(() => {
  const ref = useRef();
  const ref2 = useSignal<Element>();
  const id = useSignal(0);
  const signal = useSignal('');
  const renders = useStore(
    {
      count: 0,
    },
    { reactive: false }
  );
  const store = useStore({
    foo: 10,
    attribute: 'even',
    signal,
  });

  const styles = useSignal('body { background: white}');

  useClientEffect$(() => {
    ref.current!.setAttribute('data-set', 'ref');
    ref2.value!.setAttribute('data-set', 'ref2');
  });

  renders.count++;
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
      <button
        id="background"
        onClick$={() => {
          styles.value = 'body { background: black }';
        }}
      >
        Black background
      </button>
      <div id="parent-renders">Parent renders: {renders.count}</div>
      <Child
        text="Message"
        count={store.foo}
        ref={ref}
        ref2={ref2}
        signal={signal}
        signal2={store.signal}
        id={id.value}
        styles={styles.value}
      />
      <Issue1681 />
      <Issue1733 />
      <SideEffect />
      <Issue1884 />
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
  styles: string;
}
export const Child = component$((props: ChildProps) => {
  const renders = useStore(
    {
      count: 0,
    },
    { reactive: false }
  );
  renders.count++;
  return (
    <>
      <div id="child-renders">Child renders: {renders.count}</div>
      <div id="text" ref={props.ref}>
        Text: {props.text}
      </div>
      <Id id={props.id} />
      <div id="computed">{'computed: ' + props.signal.value}</div>
      <div id="stuff" ref={props.ref2}>
        Stuff: {props.count}
      </div>
      <style>{props.styles}</style>
    </>
  );
});

export const Id = (props: any) => <div id="id">Id: {props.id}</div>;

export const C = ({ who, count }: any) => (
  <>
    Count {who} is {count}
  </>
);

export const Issue1681 = component$(() => {
  const signal = useSignal(0);

  return (
    <div>
      <button id="issue-1681-btn" onClick$={() => signal.value++}>
        Click
      </button>{' '}
      <span id="issue-1681-return">
        <C who={'A'} count={signal.value} /> <C who={'B'} count={signal} />
      </span>
    </div>
  );
});

export const Issue1733 = component$(() => {
  const store = useStore({ open: false });
  return (
    <>
      <button id="issue1733-btn" onClick$={() => (store.open = !store.open)}>
        toggle
      </button>
      <p id="issue1733-signal">{store.open}</p>
      <p id="issue1733-false">{false}</p>
      <p id="issue1733-true">{true}</p>
      {store.open && <h1 id="issue1733-h1">Message</h1>}
    </>
  );
});

export const SideEffect = component$(() => {
  const signal = useSignal('initial');
  useWatch$(async () => {
    await delay(100);
    signal.value = 'set';
  });
  return (
    <>
      <div>{signal.value}</div>
    </>
  );
});

export const Issue1884 = component$(() => {
  const state = useStore({
    value: '',
    bool: false,
    counter: 0,
  });
  return (
    <>
      <button
        id="issue1884-btn"
        onClick$={() => {
          state.value = 'test';
          state.counter++;
          state.bool = true;
        }}
      >
        Click me {state.counter}
      </button>
      <div>
        <Test active={state.value === 'test'} />
        <Test active={state.bool ? true : false} />
        <Test active={state.bool} />
        <Test active={state.value} />
      </div>
    </>
  );
});

export const Test = component$(({ active }: { active: boolean | string }) => {
  return (
    <div class="issue1884-text" style={{ color: active && ('red' as any) }}>
      Should turn red
    </div>
  );
});
