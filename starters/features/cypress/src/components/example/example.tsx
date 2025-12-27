import { component$, useStore } from "@builder.io/qwik";

import { useExampleLoader } from "../../loaders/example.loader";
import { useExampleAction } from "../../actions/example.action";

export const ExampleTest = component$((props: { flag: boolean }) => {
  const state = useStore({
    counter: 0,
  });

  const loaderState = useExampleLoader();
  const action = useExampleAction();

  return (
    <>
      <span id="count">Count:{state.counter}</span>
      <div id="icon">Flag: {props.flag ? "⭐" : "💣"}</div>
      <button id="btn-counter" onClick$={() => state.counter++}>
        Increment counter
      </button>
      <span id="loader-data">{loaderState.value}</span>
      <button id="btn-action" onClick$={() => action.submit()}>
        Call action
      </button>
    </>
  );
});
