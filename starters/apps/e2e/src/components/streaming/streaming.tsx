import { component$, Host, Resource, useResource$, useStyles$ } from '@builder.io/qwik';

export function delay(time: number) {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), time);
  });
}

export const Streaming = component$(() => {
  return (
    <Host>
      <ul>
        {delay(100).then(() => (
          <div>HELLO</div>
        ))}
        <Cmp text="this 1" delay={1000}></Cmp>
        <Cmp text="this 2" delay={2000}></Cmp>
        <Cmp text="this 3" delay={3000}></Cmp>
        <Cmp text="this 4" delay={4000}></Cmp>
        <Cmp text="this 5" delay={3000}></Cmp>
      </ul>
    </Host>
  );
});

export const Cmp = component$((props: { text: string; delay: number }) => {
  useStyles$(`.cmp {
    background: blue;
    color: white;
    display: block;
  }`);

  const resource = useResource$<string>(async ({ track }) => {
    track(props, 'text');
    await delay(props.delay);
    return props.text;
  });

  return (
    <Host class="cmp">
      <Resource resource={resource} onResolved={(value) => <span>{value}</span>} />
    </Host>
  );
});
