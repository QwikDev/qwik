import {
  component$,
  useRef,
  Ref,
  Signal,
  useSignal,
  useStore,
  useClientEffect$,
  useWatch$,
  Slot,
  useStyles$,
} from '@builder.io/qwik';
import { delay } from '../resource/resource';
import {
  TestAC,
  TestACN,
  TestACNStr,
  TestACStr,
  TestC,
  TestCN,
  TestCNStr,
  TestCStr,
  TestCWithFlag,
} from './utils/utils';

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
      <Issue2176 />
      <Issue2245 />
      <Issue2245B />
      <ComplexClassSignals />
      <Issue2311 />
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
      <textarea value={props.styles}></textarea>
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

export const Issue2176 = component$(() => {
  const data = useSignal({ text: 'testing', flag: false, num: 1 });
  const store = useStore({ text: 'testing', flag: false, num: 1 });
  return (
    <div>
      <button
        id="issue-2176-btn"
        onClick$={() => {
          const nu = data.value.num + 1;
          const text = 'testing' + nu;
          data.value = { text, flag: !data.value.flag, num: nu };
          store.num = nu;
          store.text = text;
          store.flag = !store.flag;
        }}
      >
        Click me to change the data
      </button>
      {/* <code>{JSON.stringify(data.value)}</code> */}

      <h2>Signal</h2>
      <ul>
        <li>
          <Test1 text={data.value.text} flag={data.value.flag} num={data.value.num}>
            Nested value
          </Test1>
        </li>
        <li>
          <Test1Sig sig={data}>Raw </Test1Sig>
        </li>
        <li>
          <Test2
            text={`${data.value.text} flag=${data.value.flag ? 'T' : 'F'} num=${data.value.num}`}
          >
            Computed prop
          </Test2>
        </li>
        <li>
          <Test2Sig sig={data}>Raw + Computed</Test2Sig>
        </li>
        <li>
          <Test2Child>
            Slot{' '}
            <span class="issue-2176-result">
              {data.value.text} flag={data.value.flag ? 'T' : 'F'} num={data.value.num}
            </span>
          </Test2Child>
        </li>
        <li>
          <Test2Child>
            Computed + Slot{' '}
            <span class="issue-2176-result">
              {`${data.value.text} flag=${data.value.flag ? 'T' : 'F'} num=${data.value.num}`}
            </span>
          </Test2Child>
        </li>
      </ul>

      <h2>Store</h2>
      <ul>
        <li>
          <Test1 text={store.text} flag={store.flag} num={store.num}>
            Nested value
          </Test1>
        </li>
        <li>
          <TestStore store={store}>Raw</TestStore>
        </li>
        <li>
          <Test2 text={`${store.text} flag=${store.flag ? 'T' : 'F'} num=${store.num}`}>
            Computed prop
          </Test2>
        </li>
        <li>
          <Test2Store store={store}>Raw + Computed</Test2Store>
        </li>
        <li>
          <Test2Child>
            Slot{' '}
            <span class="issue-2176-result">
              {store.text} flag={store.flag ? 'T' : 'F'} num={store.num}
            </span>
          </Test2Child>
        </li>
        <li>
          <Test2Child>
            Computed + Slot{' '}
            <span class="issue-2176-result">
              {`${store.text} flag=${store.flag ? 'T' : 'F'} num=${store.num}`}
            </span>
          </Test2Child>
        </li>
      </ul>
    </div>
  );
});

export const Test1 = component$((props: { text: string; flag: boolean; num: number }) => {
  return (
    <p>
      <Slot />{' '}
      <span class="issue-2176-result">
        {props.text} flag={props.flag ? 'T' : 'F'} num={props.num}
      </span>
    </p>
  );
});
export const Test1Sig = component$((props: { sig: Signal }) => {
  return (
    <p>
      <Slot />{' '}
      <span class="issue-2176-result">
        {props.sig.value.text} flag={props.sig.value.flag ? 'T' : 'F'} num=
        {props.sig.value.num}
      </span>
    </p>
  );
});
export const TestStore = component$((props: { store: any }) => {
  return (
    <p>
      <Slot />{' '}
      <span class="issue-2176-result">
        {props.store.text} flag={props.store.flag ? 'T' : 'F'} num={props.store.num}
      </span>
    </p>
  );
});
export const Test2 = component$((props: { text: string }) => {
  return (
    <p>
      <Slot /> <span class="issue-2176-result">{props.text}</span>
    </p>
  );
});
export const Test2Sig = component$((props: { sig: Signal }) => {
  return (
    <p>
      <Slot />{' '}
      <span class="issue-2176-result">
        {`${props.sig.value.text} flag=${props.sig.value.flag ? 'T' : 'F'} num=${
          props.sig.value.num
        }`}
      </span>
    </p>
  );
});
export const Test2Store = component$((props: { store: any }) => {
  return (
    <p>
      <Slot />{' '}
      <span class="issue-2176-result">
        {`${props.store.text} flag=${props.store.flag ? 'T' : 'F'} num=${props.store.num}`}
      </span>
    </p>
  );
});
export const Test2Child = component$(() => {
  return (
    <p>
      <Slot />
    </p>
  );
});

export const Issue2245 = component$(() => {
  useStyles$(`
span.true { font-weight: bold; }
span.false { font-style: italic; }
.row { display:flex; flex-direction: row; }
.column { display:flex; flex-direction: column; }
p { padding: 0.5em; border:1px solid; margin:0.2em }
.black { color: black; border-color: black; }
.red { color: red; border-color: red; }
.blue { color: blue; border-color: blue; }
.green { color: green; border-color: green; }
.purple { color: purple; border-color: purple; }
`);

  const colors = ['black', 'red', 'blue', 'green', 'purple'];
  const store = useStore({ color: 'black', n: 0, flag: false });
  const colorSignal = useSignal('black');
  return (
    <div>
      <button
        id="issue-2245-btn"
        onClick$={() => {
          store.n++;
          store.flag = !store.flag;
          if (store.n >= colors.length) store.n = 0;
          store.color = colors[store.n];
          colorSignal.value = colors[store.n];
        }}
      >
        Click me to change the color
      </button>

      <div class="row">
        <div class="column issue-2245-results">
          <h3>Store - class</h3>
          <TestC color={store.color}>Class = OK</TestC>
          <TestAC color={store.color}>[Class] = OK</TestAC>
          <TestCStr color={store.color}>{`{Class}`} = OK</TestCStr>
          <TestACStr color={store.color}>{`[{Class}]`} = OK</TestACStr>

          <h3>Store - className</h3>
          <TestCN color={store.color}>ClassName = OK</TestCN>
          <TestACN color={store.color}>[ClassName] = OK (though JSX complains</TestACN>
          <TestCNStr color={store.color}>{`{ClassName}`} = OK</TestCNStr>
          <TestACNStr color={store.color}>{`[{ClassName}]`} = OK</TestACNStr>
        </div>

        <div class="column issue-2245-results">
          <h3>Signal - class</h3>
          <TestC color={colorSignal.value}>Class = OK</TestC>
          <TestAC color={colorSignal.value}>[Class] = OK</TestAC>
          <TestCStr color={colorSignal.value}>{`{Class}`} = OK</TestCStr>
          <TestACStr color={colorSignal.value}>{`[{Class}]`} = OK</TestACStr>

          <h3>Signal - className</h3>
          <TestCN color={colorSignal.value}>ClassName = Fail</TestCN>
          <TestACN color={colorSignal.value}>[ClassName] = OK (JSX complains)</TestACN>
          <TestCNStr color={colorSignal.value}>{`{ClassName}`} = OK</TestCNStr>
          <TestACNStr color={colorSignal.value}>{`[{ClassName}]`} = OK (JSX complains)</TestACNStr>
        </div>
      </div>
    </div>
  );
});

export const Issue2245B = component$(() => {
  const colors = ['black', 'red', 'blue', 'green', 'purple'];
  const store = useStore({ color: 'black', n: 0, flag: false });
  const colorSignal = useSignal('black');
  const flagSignal = useSignal(false);
  return (
    <div>
      <button
        id="issue-2245-b-btn"
        onClick$={() => {
          store.n++;
          store.flag = !store.flag;
          flagSignal.value = !flagSignal.value;
          if (store.n >= colors.length) store.n = 0;
          store.color = colors[store.n];
          colorSignal.value = colors[store.n];
        }}
      >
        Click me to change the color
      </button>
      <div>
        FLAG: <code>{store.flag ? 'bold' : 'italic'} </code>
      </div>
      <div>
        <code>STORE: {JSON.stringify(store.color)}</code>
      </div>

      <div class="column issue-2245-b-results">
        <TestCWithFlag color={store.color} flag={store.flag}>
          Class = Fail
        </TestCWithFlag>
      </div>
    </div>
  );
});

export const ComplexClassSignals = component$(() => {
  const classes = useSignal(['initial', { hidden: false, visible: true }]);
  return (
    <div>
      <button
        id="complex-classes-btn"
        onClick$={() => {
          classes.value = ['change', { hidden: true, visible: false }];
        }}
      >
        Change classses
      </button>
      <div id="complex-classes-results" class={classes.value}>
        Div with classes
      </div>
    </div>
  );
});

type MyStore = {
  condition: boolean;
  text: string;
};

export const Issue2311 = component$(() => {
  const store = useStore<MyStore>({
    condition: false,
    text: 'Hello',
  });

  useWatch$(({ track }) => {
    const v = track(() => store.condition);
    if (v) {
      store.text = 'Bye bye 👻';
    }
  });

  return (
    <div>
      <h1>Weird DOM update bug?</h1>

      <div>
        <button
          id="issue-2311-btn"
          onClick$={() => {
            store.condition = true;
          }}
        >
          Make it so
        </button>
      </div>

      <div id="issue-2311-results">
        <p>This text should not change</p>
        <>{store.condition ? <b>Done!</b> : <p>{store.text}</p>}</>

        <p>This text should not change</p>
        <>{store.condition ? <b>Done!</b> : <p>{store.text}</p>}</>

        <p>This text should not change</p>
        <>{store.condition ? <b>Done!</b> : <p>{store.text}</p>}</>

        <p>This text should not change</p>
        <>{store.condition ? <b>Done!</b> : <p>{store.text}</p>}</>

        <p>This text should not change</p>
        <>{store.condition ? <b>Done!</b> : <p>{store.text}</p>}</>
      </div>
    </div>
  );
});
