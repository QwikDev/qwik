export const isUseFunction = (string: string) => {
  return string.startsWith('use') && string.endsWith('$');
};
