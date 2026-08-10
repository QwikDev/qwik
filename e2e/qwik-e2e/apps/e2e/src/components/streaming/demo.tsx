import { component$, useComputed$, useStyles$ } from '@qwik.dev/core';
import { SSRStream } from '@qwik.dev/core/internal';
import { delay } from '../delay';

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

  const resource = useComputed$<Promise<string>>(async () => {
    const text = props.text;
    await delay(props.delay);
    return text;
  });

  return <div>{resource.value && <span class="cmp">{resource.value}</span>}</div>;
});
