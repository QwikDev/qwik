import { isServer, useSignal, useTask$, useVisibleTask$ } from "@qwik.dev/core";

export const useTheme = () => {
  const theme = useSignal("");
  useVisibleTask$(({ track }) => {
    track(() => theme.value);
    theme.value = "dark";
  });

  useTask$(({ track }) => {
    track(() => theme.value);
  });

  useTask$(({ track }) => {
    track(() => theme.value);
  });

  useTask$(({ track }) => {
    track(() => theme.value);
  });

  useTask$(({ track }) => {
    track(() => theme.value);
  });

  useTask$(({ track }) => {
    track(() => theme.value);
  });

  useTask$(({ track }) => {
    track(() => theme.value);
  });

  useTask$(({ track }) => {
    track(() => theme.value);
  });

  useTask$(({ track }) => {
    track(() => theme.value);
  });

  useTask$(({ track }) => {
    track(() => theme.value);
  });
  return theme;
};
