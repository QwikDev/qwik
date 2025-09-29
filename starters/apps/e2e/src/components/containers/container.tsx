import {
  component$,
  Resource,
  useResource$,
  useSignal,
  useStyles$,
} from "@qwik.dev/core";
import {
  SSRRaw,
  SSRStream,
  type SSRStreamWriter,
} from "@qwik.dev/core/internal";

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

const SSRStreamRemoteContainer = component$<{
  url: string;
  containerId?: string;
}>(({ url, containerId }) => {
  const decoder = new TextDecoder();
  const getSSRStreamFunction =
    (remoteUrl: string) => async (stream: SSRStreamWriter) => {
      const _remoteUrl = new URL(
        `http://localhost:${(globalThis as any).PORT}${remoteUrl}`,
      );
      const response = await fetch(_remoteUrl, {
        headers: {
          accept: "text/html",
        },
      });
      if (response.ok) {
        const reader = response.body!.getReader();
        let fragmentChunk = await reader.read();
        while (!fragmentChunk.done) {
          const rawHtml = decoder.decode(fragmentChunk.value);
          stream.write((<SSRRaw data={rawHtml} />) as string);
          fragmentChunk = await reader.read();
        }
      } else {
        console.error(
          "Failed to connect with status:",
          response.status,
          response.statusText,
        );
      }
    };

  return (
    <div id={containerId} q:shadowRoot>
      <template shadowRootMode="open">
        <SSRStream>{getSSRStreamFunction(url)}</SSRStream>
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
        <div id="shadow-dom-resource" q:shadowRoot>
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
        <SSRStreamRemoteContainer
          url="/e2e/two-listeners?fragment&loader=false"
          containerId="shadow-dom-stream"
        />
      </div>
    </div>
  );
});
