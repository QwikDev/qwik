import {
  createContextId,
  useContext,
  useContextProvider,
  useSignal,
  useTask$,
  component$,
  type Signal,
} from "@qwik.dev/core";

const Ctx = createContextId<{ descId: Signal<string> }>("bp-ctx-1");

export const Backpatching = component$(() => {
  return (
    <>
      <AttributeBackpatching />
    </>
  );
});

const AttributeBackpatchingChild = component$(() => {
  const context = useContext(Ctx);
  useTask$(() => {
    context.descId.value = "final-id";
  });
  return <div>child</div>;
});

const AttributeBackpatching = component$(() => {
  const descId = useSignal("initial-id");
  useContextProvider(Ctx, { descId });
  return (
    <>
      <input
        id="attribute-backpatching-input"
        aria-describedby={descId.value}
      />
      <AttributeBackpatchingChild />
    </>
  );
});
