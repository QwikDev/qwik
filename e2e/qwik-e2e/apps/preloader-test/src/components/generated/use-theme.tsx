import { isServer, useSignal, useTask$, useVisibleTask$ } from '@qwik.dev/core';

export const useTheme = () => {
  const theme = useSignal('');
  useVisibleTask$(() => {
    theme.value;
    theme.value = 'dark';
  });

  useTask$(() => {
    theme.value;
  });

  useTask$(() => {
    theme.value;
  });

  useTask$(() => {
    theme.value;
  });

  useTask$(() => {
    theme.value;
  });

  useTask$(() => {
    theme.value;
  });

  useTask$(() => {
    theme.value;
  });

  useTask$(() => {
    theme.value;
  });

  useTask$(() => {
    theme.value;
  });

  useTask$(() => {
    theme.value;
  });
  return theme;
};
