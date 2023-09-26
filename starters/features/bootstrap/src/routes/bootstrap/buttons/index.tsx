import { component$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
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
