import { component$ } from "@builder.io/qwik";
import { type BsComponentProps } from "~/models/bootstrap";

export const Button = component$<BsComponentProps>(({ text, colorVariant }) => (
  <button type="button" class={`btn btn-${colorVariant}`}>
    {text || "Button text"}
  </button>
));
