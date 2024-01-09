import { component$ } from "@builder.io/qwik";
import {
  globalAction$,
  type DocumentHead,
  routeLoader$,
} from "@builder.io/qwik-city";
import { SecretForm } from "./login";

export const useDateLoader = routeLoader$(() => new Date());

export const useOtherAction = globalAction$(() => {
  return {
    success: true,
  };
});

export default component$(() => {
  const other = useOtherAction();
  const date = useDateLoader();

  return (
    <div class="actions">
      <h1>Actions Test</h1>
      <section class="input">
        <SecretForm />
      </section>
      <div>{date.value.toISOString()}</div>
      <section>
        <div id="other-store">
          {String(other.isRunning)}:{other.formData?.get("username") as string}:
          {other.formData?.get("code") as string}:{JSON.stringify(other.value)}
        </div>
        <button id="other-button" onClick$={() => other.submit()}>
          Run other
        </button>
        {other.value?.success && <div id="other-success">Success</div>}
      </section>
    </div>
  );
});

export const head: DocumentHead = () => {
  return {
    title: "Actions",
  };
};
