import { component$, useStylesScoped$, Slot } from "@builder.io/qwik";

export interface ButtonProps {
  size?: "small" | "medium" | "large";
}
export const Button = component$<ButtonProps>(({ size = "medium" }) => {
  useStylesScoped$(`
    .size-small {
      font-size: 10px;
    }
    .size-medium {
      font-size: 14px;
    }
    .size-large {
      font-size: 18px;
    }
  `);
  return (
    <button
      class={{
        [`size-${size}`]: true,
      }}
    >
      <Slot></Slot>
    </button>
  );
});
