import { component$, useStore, useVisibleTask$ } from "@qwik.dev/core";
import type { RequestHandler } from "@qwik.dev/router";

export default component$(() => {
  const store = useStore({ timestamp: "", os: "", arch: "", node: "" });

  useVisibleTask$(async () => {
    const url = `/qwikrouter-test/api/builder.io/oss.json`;
    const rsp = await fetch(url);
    const data: any = await rsp.json();

    store.timestamp = data.timestamp;
    store.os = data.os;
    store.arch = data.arch;
    store.node = data.node;
  });

  return (
    <div>
      <h1>Qwik Router Test API!</h1>

      <ul>
        <li>
          <a href="/qwikrouter-test/api/builder.io/oss.json">
            /api/[org]/[user].json
          </a>
        </li>
        <li>
          <a href="/qwikrouter-test/api/data.json">/api/data.json</a>
        </li>
      </ul>

      <p>
        <button
          data-test-api-onput
          type="button"
          onClick$={async (_, elm) => {
            const res = await fetch("/qwikrouter-test/api/", {
              method: "PUT",
              body: JSON.stringify({ data: "test" }),
            });
            const data = await res.json();
            elm.classList.add("onput-success");
            elm.textContent = data.test;
          }}
        >
          onPut
        </button>
      </p>

      <p>
        <button
          data-test-api-onpost
          type="button"
          onClick$={async (_, elm) => {
            const res = await fetch("/qwikrouter-test/api/", {
              method: "POST",
              body: JSON.stringify({ data: "test" }),
              headers: {
                Accept: "application/json",
              },
            });
            const data = await res.json();
            elm.classList.add("onpost-success");
            elm.textContent = data.test;
          }}
        >
          onPost (accept: application/json)
        </button>
      </p>

      <p>Timestamp: {store.timestamp}</p>
      <p>
        Node: <span data-test-api-node>{store.node}</span>
      </p>
      <p>
        OS: <span>{store.os}</span>
      </p>
    </div>
  );
});

export const onPut: RequestHandler = async ({ request, method, json }) => {
  const requestData = await request.json();
  json(200, {
    test: "PUT " + requestData.data,
    method: method,
  });
};

export const onPost: RequestHandler = async ({ request, method, json }) => {
  const requestData = await request.json();
  json(200, {
    test: "POST " + requestData.data,
    method: request.method,
  });
};
