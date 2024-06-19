import {
  component$,
  useStyles$,
  useResource$,
  Resource,
  useSignal,
} from "@builder.io/qwik";

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

  const resource = useResource$<{ url: string; html: string }>(
    async ({ track }) => {
      track(() => props.url);
      const url = `http://localhost:${(globalThis as any).PORT}${
        props.url
      }?fragment&loader=false`;
      const res = await fetch(url);
      return {
        url,
        html: await res.text(),
      };
    },
  );

  return (
    <div>
      <div class="inline-container">
        <Resource
          value={resource}
          onResolved={({ url, html }) => {
            return (
              <>
                <div class="url">{url}</div>
                <div class="frame" dangerouslySetInnerHTML={html} />
              </>
            );
          }}
        />
      </div>
      <div style={{ border: "1px solid red" }}>
        Shadow DOM
        <div q:shadowRoot>
          <template shadowRootMode="open">
            <Resource
              value={resource}
              onResolved={({ url, html }) => {
                return (
                  <>
                    <div class="url">{url}</div>
                    <div class="frame" dangerouslySetInnerHTML={html} />
                  </>
                );
              }}
            />
          </template>
        </div>
      </div>
    </div>
  );
});
