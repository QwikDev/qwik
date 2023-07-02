import "./styles.css";

import { type QwikIntrinsicElements, Slot, component$ } from "@builder.io/qwik";

type ButtonProps = QwikIntrinsicElements["button"] & {
  theme?:
    | "primary"
    | "secondary"
    | "danger"
    | "success"
    | "warning"
    | "info"
    | "github";
  size?: "small" | "medium" | "large";
  variant?: "outlined" | "contained";
};

export default component$<ButtonProps>((props) => {
  return (
    <button
      {...props}
      class={{ button: true, github: props.theme === "github" }}
    >
      <Slot />
    </button>
  );
});
