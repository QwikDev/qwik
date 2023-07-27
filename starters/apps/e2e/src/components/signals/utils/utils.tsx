/* eslint-disable no-console */

import { component$, Slot } from "@builder.io/qwik";

export const TestC = component$((props: { color: string }) => {
  console.log("TestC");
  return (
    <p class={props.color}>
      {" "}
      <Slot />
    </p>
  );
});
export const TestAC = component$((props: { color: string }) => {
  console.log("TestAC");
  return (
    <p class={[props.color]}>
      {" "}
      <Slot />
    </p>
  );
});
export const TestCStr = component$((props: { color: string }) => {
  console.log("TestCStr");
  return (
    <p class={`${props.color}`}>
      {" "}
      <Slot />
    </p>
  );
});
export const TestACStr = component$((props: { color: string }) => {
  console.log("TestACStr");
  return (
    <p class={[`${props.color}`]}>
      {" "}
      <Slot />
    </p>
  );
});

export const TestCN = component$((props: { color: string }) => {
  console.log("TestCN");
  return (
    <p class={props.color}>
      {" "}
      <Slot />
    </p>
  );
});
export const TestACN = component$((props: { color: string }) => {
  console.log("TestACN");
  return (
    <p class={[props.color] as any}>
      {" "}
      <Slot />
    </p>
  );
});
export const TestCNStr = component$((props: { color: string }) => {
  console.log("TestCNStr");
  return (
    <p class={`${props.color}`}>
      {" "}
      <Slot />
    </p>
  );
});
export const TestACNStr = component$((props: { color: string }) => {
  console.log("TestACNStr");
  return (
    <p class={[`${props.color}`] as any}>
      {" "}
      <Slot />
    </p>
  );
});

export const TestCWithFlag = component$(
  (props: { color: string; flag: boolean }) => {
    console.log("TestCWithFlag");
    return (
      <p class={props.color}>
        <span class={props.flag ? "true" : "false"}>In {props.color}</span>{" "}
        <Slot />
      </p>
    );
  },
);
export const TestACWithFlag = component$(
  (props: { color: string; flag: boolean }) => {
    console.log("TestACWithFlag");
    return (
      <p class={[props.color]}>
        <span class={[props.flag ? "true" : "false"]}>In {props.color}</span>{" "}
        <Slot />
      </p>
    );
  },
);
export const TestCStrWithFlag = component$(
  (props: { color: string; flag: boolean }) => {
    console.log("TestCStr");
    return (
      <p class={`${props.color}`}>
        <span class={`${props.flag ? "true" : "false"}`}>In {props.color}</span>{" "}
        <Slot />
      </p>
    );
  },
);
export const TestACStrWithFlag = component$(
  (props: { color: string; flag: boolean }) => {
    console.log("TestACStrWithFlag");
    return (
      <p class={[`${props.color}`]}>
        <span class={[`${props.flag ? "true" : "false"}`]}>
          In {props.color}
        </span>{" "}
        <Slot />
      </p>
    );
  },
);

export const TestCNWithFlag = component$(
  (props: { color: string; flag: boolean }) => {
    console.log("TestCNWithFlag");
    return (
      <p class={props.color}>
        <span class={props.flag ? "true" : "false"}>In {props.color}</span>{" "}
        <Slot />
      </p>
    );
  },
);
export const TestACNWithFlag = component$(
  (props: { color: string; flag: boolean }) => {
    console.log("TestACNWithFlag");
    return (
      <p class={[props.color] as any}>
        <span class={[props.flag ? "true" : "false"] as any}>
          In {props.color}
        </span>{" "}
        <Slot />
      </p>
    );
  },
);
export const TestCNStrWithFlag = component$(
  (props: { color: string; flag: boolean }) => {
    console.log("TestCNStrWithFlag");
    return (
      <p class={`${props.color}`}>
        <span class={`${props.flag ? "true" : "false"}`}>In {props.color}</span>{" "}
        <Slot />
      </p>
    );
  },
);
export const TestACNStrWithFlag = component$(
  (props: { color: string; flag: boolean }) => {
    console.log("TestACNStrWithFlag");
    return (
      <p class={[`${props.color}`] as any}>
        <span class={[`${props.flag ? "true" : "false"}`] as any}>
          In {props.color}
        </span>{" "}
        <Slot />
      </p>
    );
  },
);
