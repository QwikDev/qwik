import { component$, useComputed$, useSignal, useStyles$ } from '@qwik.dev/core';

interface ContainerProps {
  url: string;
}

export const Containers = component$(() => {
  const signal = useSignal(0);
  return (
    <div>
      <button onClick$={() => signal.value++}>{signal.value}</button>
      <Container url="/e2e/two-listeners"></Container>
    </div>
  );
});

const StreamRemoteContainer = component$<{ url: string }>(({ url }) => {
  const html = useComputed$(async () => {
    const response = await fetch(`http://localhost:${(globalThis as any).PORT}${url}`);
    if (!response.ok || !response.body) {
      throw new Error(`Remote container request failed: ${response.status}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let result = '';
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        return result + decoder.decode();
      }
      result += decoder.decode(chunk.value, { stream: true });
    }
  });
  return (
    <div id="shadow-dom-stream" q:shadowRoot>
      <template shadowRootMode="open">
        <div class="frame" dangerouslySetInnerHTML={html.value} />
      </template>
    </div>
  );
});

export const Container = component$((props: ContainerProps) => {
  useStyles$(`
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

  const resource = useComputed$(async () => {
    const remoteUrl = props.url;
    const url = `http://localhost:${(globalThis as any).PORT}${remoteUrl}?fragment&loader=false`;
    const res = await fetch(url);
    return {
      url,
      html: await res.text(),
    };
  });

  return (
    <div>
      <div class="inline-container">
        <div class="url">{resource.value.url}</div>
        <div class="frame" dangerouslySetInnerHTML={resource.value.html} />
      </div>
      <div style={{ border: '1px solid red' }}>
        Shadow DOM
        <div id="shadow-dom-resource" q:shadowRoot>
          <template shadowRootMode="open">
            <div class="url">{resource.value.url}</div>
            <div class="frame" dangerouslySetInnerHTML={resource.value.html} />
          </template>
        </div>
        <StreamRemoteContainer url="/e2e/two-listeners?fragment&loader=false" />
      </div>
    </div>
  );
});
