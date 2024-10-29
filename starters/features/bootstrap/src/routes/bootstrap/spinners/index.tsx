import type { DocumentHead } from "@qwik.dev/router";
import { component$ } from "@qwik.dev/core";
import { Spinner } from "~/components/bootstrap";
import { colorVariantsList } from "~/constants/data";

export default component$(() => {
  return (
    <>
      <h2>Spinners</h2>
      <hr />
      <h3>Border</h3>
      {colorVariantsList.map((colorVariant, index) => (
        <>
          <Spinner
            key={`${index + 1}_${colorVariant}`}
            colorVariant={colorVariant}
            growing={false}
          />
          <span class="me-3"></span>
        </>
      ))}
      <h3 class="mt-2">Growing</h3>
      {colorVariantsList.map((colorVariant, index) => (
        <>
          <Spinner
            key={`${index + 1}_${colorVariant}`}
            colorVariant={colorVariant}
            growing={true}
          />
          <span class="me-3"></span>
        </>
      ))}
    </>
  );
});

export const head: DocumentHead = {
  title: "Qwik - Bootstrap v5 - Spinners",
  meta: [
    {
      name: "description",
      content: "Spinners with Boostrap in Qwik",
    },
  ],
};
