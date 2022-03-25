import { $, component$, Host, useScopedStyles$ } from '@builder.io/qwik';

interface ContainerProps {
  url: string;
}

export const Containers = component$(() => {
  return $(async () => {
    return (
      <Host class="my-app p-20">
        <Container url="/e2e/slot"></Container>
        <Container url="/e2e/two-listeners"></Container>
        <Container url="/e2e/lexical-scope"></Container>
        <Container url="/e2e/await"></Container>
      </Host>
    );
  });
});

export const Container = component$((props: ContainerProps) => {
  useScopedStyles$(`
    .container {
      margin: 20px;
      padding: 5px;
      border: 1px solid black;
      border-radius: 10px;
    }
    .frame {
      padding: 5px;
      border: 1px solid grey;
      border-radius: 5px;
    }
    .url {
      background: #d1d1d1;
      border-radius: 10px;
      padding: 5px 10px;
      margin-bottom: 10px;
    }
  `);
  return $(async () => {
    const url = `http://localhost:3300${props.url}?fragment&loader=false`;
    // const { default: fetch } = await import('node-fetch');
    // const res = await fetch(url);
    // const html = await res.text();
    const html = '';
    return (
      <Host class="container">
        <div class="url">{url}</div>
        <div class="frame" dangerouslySetInnerHTML={html} />
      </Host>
    );
  });
});
