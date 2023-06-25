import {
  component$,
  Resource,
  SSRStream,
  useResource$,
  useStyles$,
} from "@builder.io/qwik";

export function delay(time: number) {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), time);
  });
}

export const Streaming = component$(() => {
  return (
    <div>
      <Cmp text="this 1" delay={1000}></Cmp>
      <Cmp text="this 2" delay={2000}></Cmp>
      <Cmp text="this 3" delay={3000}></Cmp>
      <Cmp text="this 4" delay={4000}></Cmp>
      <Cmp text="this 5" delay={3000}></Cmp>
      <SSRStream>
        {async function* () {
          for (let i = 0; i < 100; i++) {
            yield <div>{i}</div>;
            await delay(500);
          }
        }}
      </SSRStream>
    </div>
  );
});

export const Cmp = component$((props: { text: string; delay: number }) => {
  useStyles$(`.cmp {
    background: blue;
    color: white;
    width: 100%;
    height: 300px;
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
        onResolved={(value) => <span class="cmp">{value}</span>}
      />
    </div>
  );
});
