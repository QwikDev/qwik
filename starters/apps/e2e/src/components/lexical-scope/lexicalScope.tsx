import {
  component$,
  $,
  useStore,
  noSerialize,
  useSignal,
  type Signal,
} from "@builder.io/qwik";

export const LexicalScope = component$(() => {
  const signal = useSignal(0);
  const store = useStore({
    count: 0,
    signal,
  });
  return (
    <LexicalScopeChild
      message={"mutable message"}
      message2={null}
      signal={signal}
      signalValue={signal.value}
      store={store}
      storeCount={store.count}
      storeSignal={store.signal}
    />
  );
});

interface LexicalScopeProps {
  message: string;
  message2: string | null;
  signal: Signal;
  signalValue: number;
  store: Record<string, any>;
  storeCount: number;
  storeSignal: Signal;
}

export const LexicalScopeChild = component$((props: LexicalScopeProps) => {
  const immutable = useStore(
    {
      stuff: "foo",
    },
    {
      deep: true,
    },
  );
  Object.freeze(immutable);
  const state = useStore({
    count: 0,
    result: "",
  });
  const a = 1;
  const b = "</script>";
  const promise = Promise.resolve("from a promise");
  const rejected = Promise.reject(new Error("failed message"));
  rejected.catch(() => null);

  const formData = new FormData();
  formData.append("name", "qwik");
  formData.append("age", "1");
  formData.append("age", "2");

  const specialStrings = [
    "\b: backspace",
    "\f: form feed",
    "\n: line feed",
    "\r: carriage return",
    "\t: horizontal tab",
    "\v: vertical tab",
    "\0: null character",
    "': single quote",
    "\\: backslash",
  ];
  const c = {
    a: { thing: 12 },
    b: "hola",
    c: 123,
    d: false,
    e: true,
    f: null,
    g: undefined,
    h: [1, "string", false, { hola: 1 }, ["hello"]],
    i: noSerialize(() => console.warn()),
    promise,
  };
  const propsCopy = {
    signal: props.signal,
    signalValue: props.signalValue,
    store: props.store,
    storeCount: props.storeCount,
    storeSignal: props.storeSignal,
  };
  const d = undefined;
  const e = null;
  const g = true;
  const h = false;
  const i = noSerialize(() => console.error());
  const f = [1, 2, "hola", i, {}];
  const url = new URL("http://qwik.builder.com/docs?query=true");
  const date = new Date("2022-07-26T17:40:30.255Z");
  const regex = /hola()\//gi;
  const nullPrototype = Object.create(null);
  nullPrototype.value = 12;
  const infinite = Infinity;
  const negativeInfinite = -Infinity;
  const nan = NaN;
  const urlSearchParams = new URLSearchParams("mph=88");
  const bigint = BigInt("200000000000000000");

  const set = new Set(["hola", 12, { a: date }]);
  const map = new Map<any, any>([
    [formData, set],
    ["mapkey", url],
  ]);

  const onclick = $(async () => {
    // eslint-disable-next-line
    console.assert(infinite === Infinity);
    // eslint-disable-next-line
    console.assert(negativeInfinite === -Infinity);
    // eslint-disable-next-line
    console.assert(isNaN(nan));

    rejected.catch((reason) => {
      promise.then((promiseValue) => {
        state.result = JSON.stringify([
          a,
          b,
          c,
          String(d),
          String(e),
          f,
          g,
          h,
          i,
          props.message,
          props.message2,
          props.signal,
          props.signalValue,
          props.store,
          props.storeCount,
          props.storeSignal,
          promiseValue,
          url.href,
          date.toISOString(),
          `${regex.source} ${regex.flags}`,
          nullPrototype.value,
          reason.message,
          specialStrings,
          String(infinite),
          String(negativeInfinite),
          String(nan),
          urlSearchParams.get("mph"),
          formData.get("name"),
          formData.getAll("age"),
          String(bigint),
          JSON.stringify([...set.keys()]),
          JSON.stringify([...map.entries()]),
        ]);
        state.count++;
      });
    });
  });

  return (
    <section>
      <div id="static">
        <p>{JSON.stringify(a)}</p>
        <p>{JSON.stringify(b)}</p>
        <p>{JSON.stringify(c)}</p>
        <p>{String(d)}</p>
        <p>{String(e)}</p>
        <p>{JSON.stringify(f)}</p>
        <p>{JSON.stringify(g)}</p>
        <p>{JSON.stringify(h)}</p>
        <p>{String(i)}</p>
        <p>{props.message}</p>
        <p>{JSON.stringify(propsCopy)}</p>
        <p>{promise}</p>
        <p>{Object.keys(props).join(", ")}</p>
      </div>
      <button onClick$={onclick} id="rerender">
        Rerender {state.count}
      </button>
      <div id="result">{"" + state.result}</div>
    </section>
  );
});
