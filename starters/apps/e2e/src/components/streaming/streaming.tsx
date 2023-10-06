import {
  component$,
  Resource,
  SSRStream,
  SSRStreamBlock,
  useResource$,
  useStore,
  useStyles$,
} from "@builder.io/qwik";

export function delay(time: number) {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), time);
  });
}

export const StreamingRoot = component$(() => {
  const store = useStore({
    count: 0,
  });
  return (
    <>
      <button id="client-render" onClick$={() => store.count++}>
        Client rerender: {store.count}
      </button>
      <Streaming key={store.count} />
    </>
  );
});

export const Streaming = component$(() => {
  const store = useStore({
    count: 0,
  });
  return (
    <div>
      <button id="count" onClick$={() => store.count++}>
        Rerender: {store.count}
      </button>

      <ul>
        <SSRStream>
          {async function* () {
            for (let i = 0; i < 5; i++) {
              yield <li>yield: {i}</li>;
              await delay(100);
            }
          }}
        </SSRStream>
      </ul>

      <ol>
        <SSRStream>
          {async function (stream: any) {
            for (let i = 0; i < 10; i++) {
              stream.write(`<li>raw: ${i}</li>`);
              await delay(100);
            }
          }}
        </SSRStream>
      </ol>

      <SSRStreamBlock>
        <Cmp text="this 1" delay={1000}></Cmp>
        <Cmp text="this 2" delay={1200}></Cmp>
      </SSRStreamBlock>

      <Cmp text="this 3" delay={1500}></Cmp>

      <SSRStreamBlock>
        <Cmp text="this 4" delay={1000}></Cmp>
        <Cmp text="this 4" delay={2000}></Cmp>
      </SSRStreamBlock>
    </div>
  );
});

export const Cmp = component$((props: { text: string; delay: number }) => {
  useStyles$(`.cmp {
    background: blue;
    color: white;
    width: 100%;
    height: 100px;
    display: block;
    text-align: center;
    font-size: 40px;
    margin: 20px 0;
  }`);

  const resource = useResource$<string>(async ({ track }) => {
    track(() => props.text);
    await delay(props.delay);
    return props.text;
  });

  return (
    <div>
      <Resource
        value={resource}
        onResolved={(value) => (
          <span id={value} class="cmp">
            {value}
          </span>
        )}
      />
    </div>
  );
});
