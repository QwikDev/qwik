import { component$, Resource, useResource$, useSignal } from "@qwik.dev/core";

export const ResourceFn = component$(() => {
  const resource = useResource$(({ track }) => {
    track(() => {
      return;
    });
    return { name: "resource" };
  });
  const signal = useSignal({ name: "signal" });
  const asyncSignal = useSignal(Promise.resolve({ name: "asyncSignal" }));
  const promise = Promise.resolve({ name: "promise" });

  return (
    <div>
      <Resource
        value={resource}
        onResolved={(value) => <div id={value.name}>{value.name}</div>}
      />
      <Resource
        value={signal}
        onResolved={(value) => <div id={value.name}>{value.name}</div>}
      />
      <Resource
        value={asyncSignal}
        onResolved={(value) => <div id={value.name}>{value.name}</div>}
      />
      <Resource
        value={promise}
        onResolved={(value) => <div id={value.name}>{value.name}</div>}
      />
    </div>
  );
});
