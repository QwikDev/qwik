import { component$, Resource, SSRStreamBlock, useResource$, useStyles$ } from '@builder.io/qwik';

export function delay(time: number) {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), time);
  });
}
export default component$(() => {
  return (
    <div>
      {delay(50).then(() => (
        <div>Block 1</div>
      ))}
      {delay(1000).then(() => (
        <div>Block 2</div>
      ))}

      <Cmp text="this 1" delay={1500}></Cmp>
      <Cmp text="this 3" delay={2500}></Cmp>
      <SSRStreamBlock>
        <Cmp text="this 4" delay={3000}></Cmp>
        <Cmp text="this 4" delay={3500}></Cmp>
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
    track(props, 'text');
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
