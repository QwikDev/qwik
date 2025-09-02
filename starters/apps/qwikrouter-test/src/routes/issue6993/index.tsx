import { component$, useVisibleTask$ } from "@qwik.dev/core";
import { useNavigate } from "@qwik.dev/router";

export default component$(() => {
  const nav = useNavigate();
  useVisibleTask$(async () => {
    nav("/qwikrouter-test/issue6993/new-path/");
  });

  return <></>;
});
