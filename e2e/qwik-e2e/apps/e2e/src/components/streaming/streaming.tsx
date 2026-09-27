import { component$, useComputed$, useStore, useStyles$ } from '@qwik.dev/core';
import { delay } from '../delay';

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
        {[0, 1, 2, 3, 4].map((index) => (
          <AsyncListItem key={index} index={index} kind="yield" />
        ))}
      </ul>

      <ol>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((index) => (
          <AsyncListItem key={index} index={index} kind="raw" />
        ))}
      </ol>

      <Cmp text="this_1" delay={200}></Cmp>
      <Cmp text="this_2" delay={300}></Cmp>

      <Cmp text="this_3" delay={400}></Cmp>

      <Cmp text="this_4" delay={500}></Cmp>
      <Cmp text="this_5" delay={600}></Cmp>
    </div>
  );
});

export const AsyncListItem = component$(async (props: { index: number; kind: string }) => {
  await delay((props.index + 1) * 100);
  return (
    <li>
      {props.kind}: {props.index}
    </li>
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

  const resource = useComputed$<Promise<string>>(async () => {
    const text = props.text;
    await delay(props.delay);
    return text;
  });

  return (
    <div>
      {resource.value && (
        <span id={resource.value} class="cmp">
          {resource.value}
        </span>
      )}
    </div>
  );
});
