import { component$, useId, useSignal, useVisibleTask$ } from "@qwik.dev/core";

export const MIN_CHILDREN = 2;
export const MAX_CHILDREN = 5;
export const MAX_DEPTH = 5;

export const Nested = component$((props: { level: number }) => {
  const id = useId();
  const r =
    Math.floor(Math.random() * (MAX_CHILDREN - MIN_CHILDREN + 1)) +
    MIN_CHILDREN;
  const children = [...new Array(r).keys()];
  return (
    <>
      {" "}
      {props.level >= MAX_DEPTH && children.length ? (
        id
      ) : (
        <ul
          id={`${id}`}
          key={id}
          style="box-sizing: border-box; border: 1px solid #ccc; padding: 1rem; list-style: none"
        >
          {id}
          {children.map((number, idx) => (
            <li key={`${number}-${idx}-${id}`}>
              <Nested level={props.level + 1} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
});

export const UseId = component$(() => {
  const totalIdsSignal = useSignal<number | null>(null);
  const validIdsSignal = useSignal<number | null>(null);
  const collisionsSignal = useSignal<number | null>(null);
  const resultSignal = useSignal<string | null>(null);

  useVisibleTask$(() => {
    const ids = Array.from(document.querySelectorAll("ul[id]"));

    const uniqueIds: Set<string> = [...ids].reduce((prev, value) => {
      prev.add(value.id);
      return prev;
    }, new Set() as Set<string>);

    const validIdCount = [...ids].reduce((prev, curr) => {
      const id = curr.id;
      const isValid = !!id;
      return prev + (isValid ? 1 : 0);
    }, 0);

    totalIdsSignal.value = ids.length;
    validIdsSignal.value = validIdCount;
    collisionsSignal.value = ids.length - uniqueIds.size;

    resultSignal.value =
      totalIdsSignal.value === validIdsSignal.value &&
      collisionsSignal.value === 0
        ? "Passed"
        : "Failed";
  });

  return (
    <>
      <h1>
        useId() Collision Test{" "}
        <span
          id="result"
          style={{ visibility: resultSignal.value ? "visible" : "hidden" }}
        >
          {resultSignal.value}
        </span>
      </h1>
      Verify there are no id collisions from useId(). This tests generates a
      random depth and number of children each time to inject some randomness
      and create greater coverage over time. This test does not take into
      consideration microfrontends, but does use q:base to generate the base
      hash.
      <p>
        <b>Total IDs: </b>
        <span id="totalIds">{totalIdsSignal.value}</span>
      </p>
      <p>
        <b>Valid IDs: </b>
        <span id="validIds">{validIdsSignal.value}</span>
      </p>
      <p>
        <b>Collisions: </b>
        <span id="collisions">{collisionsSignal.value}</span>
      </p>
      <Nested key={"nested-root"} level={0} />
    </>
  );
});
