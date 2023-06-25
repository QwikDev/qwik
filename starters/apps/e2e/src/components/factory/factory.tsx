import { component$ } from "@builder.io/qwik";
import { factory$ } from "./utils";

export const A = factory$(() => {
  return <div>A</div>;
});

export const B = factory$(() => {
  return <div>B</div>;
});

export function Light(props: { prop: string }) {
  return <div>Light: {props.prop}</div>;
}

export const C = factory$(Light);

export const Factory = component$(() => {
  return (
    <div>
      <A />
      <B />
      <C prop="wow!" />
    </div>
  );
});
