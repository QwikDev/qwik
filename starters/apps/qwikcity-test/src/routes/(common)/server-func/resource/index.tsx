import { component$, useResource$, Resource } from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";

const serverFunctionA = server$(async function a() {
  return this.pathname + "a";
});

const serverFunctionB = server$(async function b() {
  return this.pathname + "b";
});

const serverFunctionC = server$(async function c() {
  return this.pathname + "c";
});

const ResourceServerFns = component$(() => {
  const resource = useResource$(async () => {
    const resultA = await serverFunctionA();
    const resultB = await serverFunctionB();
    const resultC = await serverFunctionC();

    return { resultA, resultB, resultC };
  });

  return (
    <div>
      <Resource
        value={resource}
        onResolved={({ resultA, resultB, resultC }) => (
          <>
            <p id="a">{resultA}</p>
            <p id="b">{resultB} </p>
            <p id="c">{resultC}</p>
          </>
        )}
      />
    </div>
  );
});

export default ResourceServerFns;
