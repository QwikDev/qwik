import type { DocumentHead } from "@qwikdev/city";
import { component$ } from "@qwikdev/core";
import { Button } from "~/components/bootstrap";
import { colorVariantsList } from "~/constants/data";

export default component$(() => {
  return (
    <>
      <h2>Buttons</h2>
      <hr />
      {colorVariantsList.map((colorVariant, index) => (
        <>
          <Button
            key={`${index + 1}_${colorVariant}`}
            colorVariant={colorVariant}
          />
          <span class="me-3"></span>
        </>
      ))}
    </>
  );
});

export const head: DocumentHead = {
  title: "Qwik - Bootstrap v5 - Buttons",
  meta: [
    {
      name: "description",
      content: "Buttons with Boostrap in Qwik",
    },
  ],
};
