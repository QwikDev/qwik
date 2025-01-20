import { component$, Resource, useResource$, useStore } from "@builder.io/qwik";

import { server$ } from "@builder.io/qwik-city";

export interface Hello {
  print: string;
}

const hello = server$((hello: Hello) => {
  // Error: 'getOwnPropertyDescriptor' on proxy: trap returned descriptor for property 'print' that is incompatible with the existing property in the proxy target
  return helloBar(hello);
});

const helloBar = server$(
  (hello: Hello): Promise<string> =>
    new Promise((res) => {
      setTimeout(() => {
        res(hello.print + " Bar");
      }, 200);
    }),
);
export default component$(() => {
  const helloStore = useStore<Hello>({ print: "hello" });
  const resource = useResource$(({ track }) => {
    track(() => helloStore.print);

    return hello(helloStore);
  });

  return (
    <>
      <Resource
        value={resource}
        onPending={() => <div>Loading...</div>}
        onRejected={(error) => <div>Error: {error.message}</div>}
        onResolved={(data) => <div>Data: {data}</div>}
      />

      <button
        onClick$={() => {
          helloStore.print = "Foo";
        }}
      >
        Reset
      </button>
    </>
  );
});
